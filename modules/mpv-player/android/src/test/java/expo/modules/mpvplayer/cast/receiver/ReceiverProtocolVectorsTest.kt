package expo.modules.mpvplayer.cast.receiver

import java.io.File
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.fail
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * Replays the shared receiver protocol vectors (e2e/fixtures/receiver-protocol) against the
 * native protocol. Jest and the Python bench replay the same files; see their README before
 * changing a case. Robolectric only provides a real org.json.
 */
@RunWith(RobolectricTestRunner::class)
class ReceiverProtocolVectorsTest {
    private val dir = File(System.getProperty("receiverProtocolVectors") ?: error("receiverProtocolVectors is not set"))

    private fun vectors(name: String) = JSONObject(File(dir, name).readText())

    private fun JSONArray.objects() = (0 until length()).map { getJSONObject(it) }

    /** JSON values as plain Kotlin ones, numbers as Long when whole, so both sides compare as data. */
    private fun plain(value: Any?): Any? = when (value) {
        null, JSONObject.NULL -> null
        is JSONObject -> value.keys().asSequence().associateWith { plain(value.opt(it)) }
        is JSONArray -> (0 until value.length()).map { plain(value.opt(it)) }
        is Number -> value.toDouble().let { if (it % 1.0 == 0.0) it.toLong() else it }
        else -> value
    }

    private fun failures(file: String, cases: List<JSONObject>, check: (JSONObject) -> Unit) {
        val failed = cases.mapNotNull { case ->
            runCatching { check(case) }.exceptionOrNull()?.let { "${case.getString("name")}: ${it.message}" }
        }
        if (failed.isNotEmpty()) fail("$file:\n" + failed.joinToString("\n"))
    }

    private fun server(raw: JSONObject) = ReceiverServer(
        serverAddress = raw.getString("basePath"),
        accessToken = raw.getString("accessToken"),
        userId = raw.getString("userId"),
        receiverName = raw.optString("receiverName").ifEmpty { null },
        maxBitrate = if (raw.has("maxBitrate")) raw.getLong("maxBitrate") else null,
    )

    private fun JSONObject.optStringOrNull(key: String) = if (has(key) && !isNull(key)) getString(key) else null
    private fun JSONObject.optIntOrNull(key: String) = if (has(key) && !isNull(key)) getInt(key) else null
    private fun JSONObject.optLongOrNull(key: String) = if (has(key) && !isNull(key)) getLong(key) else null

    private fun request(raw: JSONObject) = ReceiverPlayRequest(
        items = raw.getJSONArray("items").objects().map { item ->
            ReceiverItem(
                id = item.optStringOrNull("Id"),
                name = item.optStringOrNull("Name"),
                type = item.optStringOrNull("Type"),
                mediaType = item.optStringOrNull("MediaType"),
                isFolder = item.optBoolean("IsFolder", false),
                channelId = item.optStringOrNull("ChannelId"),
                channelName = item.optStringOrNull("ChannelName"),
            )
        },
        startIndex = raw.optIntOrNull("startIndex"),
        startPositionTicks = raw.optLongOrNull("startPositionTicks"),
        mediaSourceId = raw.optStringOrNull("mediaSourceId"),
        audioStreamIndex = raw.optIntOrNull("audioStreamIndex"),
        subtitleStreamIndex = raw.optIntOrNull("subtitleStreamIndex"),
        liveStreamId = raw.optStringOrNull("liveStreamId"),
    )

    @Test
    fun playNowVectors() {
        failures("play-now.json", vectors("play-now.json").getJSONArray("cases").objects()) { case ->
            val sent = if (case.has("request")) {
                ReceiverProtocol.playNow(server(case.getJSONObject("session")), request(case.getJSONObject("request")))
            } else {
                ReceiverProtocol.message(case.getString("command"), server(case.getJSONObject("session")), case.optJSONObject("options") ?: JSONObject())
            }
            assertEquals(plain(case.getJSONObject("expected")), plain(sent))
        }
    }

    @Test
    fun receiverNameVectors() {
        val file = vectors("receiver-name.json")
        failures("receiver-name.json", file.getJSONArray("receiverNameFor").objects()) { case ->
            val input = case.optJSONObject("input")
            val device = input?.let { ReceiverDevice(it.optStringOrNull("friendlyName"), it.optStringOrNull("deviceId")) }
            assertEquals(plain(case.opt("expected")), ReceiverProtocol.receiverNameFor(device))
        }
        failures("receiver-name.json", file.getJSONArray("toReceiverDeviceName").objects()) { case ->
            assertEquals(case.getString("expected"), ReceiverProtocol.toReceiverDeviceName(case.getString("input")))
        }
    }

    @Test
    fun queueWindowVectors() {
        failures("queue-window.json", vectors("queue-window.json").getJSONArray("cases").objects()) { case ->
            val input = case.getJSONObject("input")
            val queue = input.getJSONArray("queue").let { list -> (0 until list.length()).map { list.getString(it) } }
            val window = ReceiverProtocol.queueWindow(queue, input.getInt("selectedIndex"), input.getInt("maxItems"))
            val expected = case.getJSONObject("expected")
            assertEquals(plain(expected.getJSONArray("items")), window.items)
            assertEquals(expected.getInt("startIndex"), window.startIndex)
        }
    }

    @Test
    fun busMessageVectors() {
        failures("bus-messages.json", vectors("bus-messages.json").getJSONArray("cases").objects()) { case ->
            // An object is the message as the receiver builds it: the wire and the bridges deliver it as a string.
            val raw = case.get("input").let { if (it is JSONObject) it.toString() else it as String }
            val expected = case.getJSONObject("expected")
            when (val message = ReceiverProtocol.parseMessage(raw)) {
                is ReceiverMessage.Parsed -> assertEquals(plain(expected), plain(message.json))
                is ReceiverMessage.Unparsed -> {
                    assertEquals(true, expected.optBoolean("invalid", false))
                    assertEquals(raw, message.raw)
                }
            }
        }
    }

    private fun customDataMap(data: ReceiverCustomData) = mapOf(
        "itemId" to data.itemId,
        "playSessionId" to data.playSessionId,
        "audioStreamIndex" to data.audioStreamIndex?.toLong(),
        "subtitleStreamIndex" to data.subtitleStreamIndex?.toLong(),
        "mediaSourceId" to data.mediaSourceId,
        "playMethod" to data.playMethod,
        "runtimeTicks" to data.runtimeTicks,
        "startPositionTicks" to data.startPositionTicks,
        "canSeek" to data.canSeek,
        "canClientSeek" to data.canClientSeek,
        "liveStreamId" to data.liveStreamId,
    )

    @Test
    fun customDataVectors() {
        failures("media-status-custom-data.json", vectors("media-status-custom-data.json").getJSONArray("cases").objects()) { case ->
            val parsed = ReceiverProtocol.parseCustomData(case.optJSONObject("input"))
            assertEquals(plain(case.getJSONObject("expected")), customDataMap(parsed))
        }
    }

    @Test
    fun mediaPositionVectors() {
        failures("media-position.json", vectors("media-position.json").getJSONArray("cases").objects()) { case ->
            val input = case.getJSONObject("input")
            val data = ReceiverProtocol.parseCustomData(input.optJSONObject("customData"))
            assertEquals(case.getDouble("expected"), ReceiverProtocol.positionInItem(input.getDouble("currentTime"), data), 1e-9)
        }
    }

    @Test
    fun loadOutcomeVectors() {
        val file = vectors("load-outcomes.json")
        failures("load-outcomes.json", file.getJSONArray("cases").objects()) { case ->
            val sent = request(case.optJSONObject("request") ?: file.getJSONObject("request"))
            val previous = case.optJSONObject("previous")
            val tracker = ReceiverLoadTracker(sent, previous?.optStringOrNull("playSessionId"))
            for (event in case.getJSONArray("events").objects()) {
                when {
                    event.has("status") -> event.getJSONObject("status").let { status ->
                        tracker.onMediaStatus(ReceiverProtocol.parseCustomData(status), status.optStringOrNull("playerState"))
                    }
                    event.has("message") -> tracker.onMessage(ReceiverProtocol.parseMessage(event.getJSONObject("message").toString()))
                    event.optBoolean("timeout") -> tracker.timeOut()
                    event.optBoolean("supersede") -> tracker.supersede()
                }
            }
            val expected = case.getJSONObject("expected")
            val outcome = tracker.outcome ?: error("no outcome")
            assertEquals(expected.getString("status"), outcome.wireName)
            if (expected.has("error")) assertEquals(expected.getString("error"), (outcome as ReceiverLoadOutcome.Failed).error.wireName)
        }
    }
}

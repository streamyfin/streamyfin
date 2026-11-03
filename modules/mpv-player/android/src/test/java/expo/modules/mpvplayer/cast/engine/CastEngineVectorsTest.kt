package expo.modules.mpvplayer.cast.engine

import expo.modules.mpvplayer.cast.FakeChannelPort
import expo.modules.mpvplayer.cast.ReceiverChannelHub
import expo.modules.mpvplayer.cast.receiver.ReceiverItem
import expo.modules.mpvplayer.cast.receiver.ReceiverLoadOutcome
import expo.modules.mpvplayer.cast.receiver.ReceiverPlayRequest
import expo.modules.mpvplayer.nativeplayer.engine.PlayerEngine
import java.io.File
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

// The shared vectors replayed through the engine itself, as JS and the receiver readers replay them.
@RunWith(RobolectricTestRunner::class)
class CastEngineVectorsTest {
    private val dir = File(System.getProperty("receiverProtocolVectors") ?: error("receiverProtocolVectors is not set"))

    private fun cases(name: String) = JSONObject(File(dir, name).readText()).getJSONArray("cases").let { list ->
        (0 until list.length()).map { list.getJSONObject(it) }
    }

    private fun JSONArray.objects() = (0 until length()).map { getJSONObject(it) }

    private fun JSONObject.stringOrNull(key: String) = if (has(key) && !isNull(key)) getString(key) else null

    private fun request(raw: JSONObject) = ReceiverPlayRequest(
        items = raw.getJSONArray("items").objects().map { item ->
            ReceiverItem(
                id = item.stringOrNull("Id"),
                name = item.stringOrNull("Name"),
                type = item.stringOrNull("Type"),
                isFolder = item.optBoolean("IsFolder", false),
                channelId = item.stringOrNull("ChannelId"),
                channelName = item.stringOrNull("ChannelName"),
            )
        },
        startIndex = if (raw.has("startIndex")) raw.getInt("startIndex") else null,
    )

    // Each case through the engine's own timer, port and media channel: the previous media is the
    // receiver's status at the send, a timeout is 30 s of the engine's clock, a supersede a second load.
    @Test
    fun loadOutcomesThroughTheEngine() {
        val file = JSONObject(File(dir, "load-outcomes.json").readText())
        assertEquals(CastEngineConstants.LOAD_TIMEOUT_MS, file.getLong("timeoutMs"))
        val failed = file.getJSONArray("cases").objects().mapNotNull { case ->
            runCatching {
                val sent = request(case.optJSONObject("request") ?: file.getJSONObject("request"))
                val media = FakeMedia()
                val port = FakeChannelPort()
                val hub = ReceiverChannelHub().apply { attach(port) }
                val scheduler = ManualScheduler()
                val engine = CastEngine(SERVER, FakeSource(FakeSession(media = media)), hub, scheduler.schedule, { it() })
                engine.start(PlayerEngine.Owner.NATIVE_SESSION) {}
                case.optJSONObject("previous")?.let { media.report(snapshot(customData = it)) }
                val results = mutableListOf<CastLoadResult>()
                engine.load(SERVER, sent) { results += it }
                val expected = case.getJSONObject("expected")
                if (expected.optString("refused") == "container") {
                    assertTrue(results.single() is CastLoadResult.NotSent)
                    assertEquals(emptyList<Pair<String, String>>(), port.sent)
                    return@runCatching
                }
                for (event in case.getJSONArray("events").objects()) {
                    when {
                        event.has("status") -> event.getJSONObject("status").let { status ->
                            media.report(snapshot(playerState = status.getString("playerState"), customData = status))
                        }
                        event.has("message") -> port.deliver(event.getJSONObject("message").toString())
                        event.optBoolean("timeout") -> scheduler.advance(CastEngineConstants.LOAD_TIMEOUT_MS)
                        event.optBoolean("supersede") -> engine.load(SERVER, sent) {}
                    }
                }
                val outcome = (results.first() as CastLoadResult.Settled).outcome
                assertEquals(expected.getString("status"), outcome.wireName)
                if (expected.has("error")) assertEquals(expected.getString("error"), (outcome as ReceiverLoadOutcome.Failed).error.wireName)
            }.exceptionOrNull()?.let { "${case.getString("name")}: ${it.message}" }
        }
        if (failed.isNotEmpty()) fail("load-outcomes.json:\n" + failed.joinToString("\n"))
    }

    @Test
    fun mediaPositionThroughTheEngine() {
        for (case in cases("media-position.json")) {
            val input = case.getJSONObject("input")
            val media = FakeMedia()
            val hub = ReceiverChannelHub().apply { attach(FakeChannelPort()) }
            val engine = CastEngine(SERVER, FakeSource(FakeSession(media = media)), hub, ManualScheduler().schedule, { it() })
            engine.start(PlayerEngine.Owner.NATIVE_SESSION) {}
            val customData = input.optJSONObject("customData")
            media.report(snapshot(customData = customData), (input.getDouble("currentTime") * 1000).toLong())
            assertEquals(case.getString("name"), case.getDouble("expected"), engine.currentPosition, 1e-9)
        }
    }
}

package expo.modules.mpvplayer.cast.receiver

import org.json.JSONArray
import org.json.JSONException
import org.json.JSONObject
import kotlin.math.roundToLong

/** What every message carries: the receiver re-reads the server and the token on each one. */
data class ReceiverServer(
    val serverAddress: String,
    val accessToken: String,
    val userId: String,
    val receiverName: String? = null,
    /** Bit/s; none sends [ReceiverProtocol.UNCAPPED_BITRATE]. */
    val maxBitrate: Long? = null,
)

/** The fields of an item the receiver reads; it fetches the rest from the server. */
data class ReceiverItem(
    val id: String?,
    val name: String? = null,
    val type: String? = null,
    val mediaType: String? = null,
    val isFolder: Boolean = false,
    val channelId: String? = null,
    val channelName: String? = null,
)

data class ReceiverPlayRequest(
    val items: List<ReceiverItem>,
    val startIndex: Int? = null,
    val startPositionTicks: Long? = null,
    val mediaSourceId: String? = null,
    val audioStreamIndex: Int? = null,
    val subtitleStreamIndex: Int? = null,
    val liveStreamId: String? = null,
)

/** The parts of a Cast device the receiver's Jellyfin device name comes from. */
data class ReceiverDevice(val friendlyName: String?, val deviceId: String?)

data class QueueWindow<T>(val items: List<T>, val startIndex: Int)

/** A message from the receiver's bus: JSON as it sent it, or the raw text when it is not JSON. */
sealed interface ReceiverMessage {
    data class Parsed(val json: JSONObject) : ReceiverMessage {
        val type: String? get() = json.optString("type").ifEmpty { null }
    }

    data class Unparsed(val raw: String) : ReceiverMessage
}

/** Why the receiver failed a load, named after what its bus message means. */
enum class ReceiverLoadError(val wireName: String) {
    /** connectionerror: its PlaybackInfo request failed (network, 401, 400, 500). */
    PLAYBACK_INFO_FAILED("playback_info_failed"),

    /** playbackerror: PlaybackInfo answered NotAllowed, NoCompatibleStream or RateLimitExceeded. */
    PLAYBACK_FAILED("playback_failed"),

    /** error: the message lacked a required field. */
    REJECTED("rejected"),
}

/** The receiver's media customData, every field optional: media another sender loaded has none. */
data class ReceiverCustomData(
    val itemId: String? = null,
    val playSessionId: String? = null,
    val audioStreamIndex: Int? = null,
    val subtitleStreamIndex: Int? = null,
    val mediaSourceId: String? = null,
    val playMethod: String? = null,
    val runtimeTicks: Long? = null,
    val startPositionTicks: Long? = null,
    val canSeek: Boolean? = null,
    val canClientSeek: Boolean? = null,
    val liveStreamId: String? = null,
)

/**
 * The Jellyfin receiver's protocol (F007D354, receiver 1.3.2), as utils/cast/jellyfinReceiver.ts
 * speaks it: both replay e2e/fixtures/receiver-protocol, so they cannot drift apart.
 */
object ReceiverProtocol {
    const val NAMESPACE = "urn:x-cast:com.connectsdk"
    const val FALLBACK_NAME = "Chromecast"
    const val FALLBACK_ID_LENGTH = 8

    /**
     * The cap sent when the user picked none: the receiver keeps the last cap it was given for as
     * long as its app runs, so a message without one would leave an earlier cast's cap in place.
     * Same value as RECEIVER_UNCAPPED_BITRATE in constants/Cast.ts.
     */
    const val UNCAPPED_BITRATE = 120_000_000L
    const val TICKS_PER_SECOND = 10_000_000L

    /** A playlist, an artist or a genre sent first plays through its children, as any folder does. */
    private val PLAYED_THROUGH_CHILDREN = setOf("Playlist", "MusicArtist", "MusicGenre")

    /**
     * JavaScript's `\s` (the receiver cleans its name with it): Java's and ICU's differ, so the set
     * is written out.
     */
    private val JS_WHITESPACE: Set<Char> = buildSet {
        addAll(listOf('\t', '\n', '\u000B', '\u000C', '\r', ' ', ' ', ' '))
        addAll(' '..' ')
        addAll(listOf(' ', ' ', ' ', ' ', '　', '﻿'))
    }

    private fun isAsciiWord(char: Char) = char in 'a'..'z' || char in 'A'..'Z' || char in '0'..'9' || char == '_'

    /** One message: the receiver drops any that lacks command, serverAddress or accessToken. */
    fun message(command: String, server: ReceiverServer, options: JSONObject = JSONObject()): JSONObject {
        val sent = JSONObject(options.toString())
        // Seek takes seconds, and the receiver turns them into ticks unrounded, which the server may reject.
        if (command == "Seek") {
            (sent.opt("position") as? Number)?.let { sent.put("position", it.toDouble().roundToLong()) }
        }
        return JSONObject().apply {
            put("command", command)
            put("serverAddress", server.serverAddress)
            put("accessToken", server.accessToken)
            put("userId", server.userId)
            server.receiverName?.takeIf { it.isNotEmpty() }?.let { put("receiverName", it) }
            put("maxBitrate", server.maxBitrate?.takeIf { it > 0 } ?: UNCAPPED_BITRATE)
            put("options", sent)
        }
    }

    /**
     * A guide program is not playable itself, and the receiver has no lookup from a program to its
     * channel: its channel plays instead, live, with none of the program's stream picks.
     */
    fun toReceiverRequest(request: ReceiverPlayRequest): ReceiverPlayRequest {
        val first = request.items.singleOrNull() ?: return request
        if (first.type != "Program" || first.channelId == null) return request
        val channel = ReceiverItem(
            id = first.channelId,
            name = first.channelName ?: first.name,
            type = "TvChannel",
            mediaType = "Video",
            isFolder = false,
        )
        return ReceiverPlayRequest(items = listOf(channel))
    }

    fun playNow(server: ReceiverServer, request: ReceiverPlayRequest): JSONObject {
        val sent = toReceiverRequest(request)
        val options = JSONObject().apply {
            sent.startIndex?.let { put("startIndex", it) }
            sent.startPositionTicks?.let { put("startPositionTicks", it) }
            sent.mediaSourceId?.let { put("mediaSourceId", it) }
            sent.audioStreamIndex?.let { put("audioStreamIndex", it) }
            sent.subtitleStreamIndex?.let { put("subtitleStreamIndex", it) }
            sent.liveStreamId?.let { put("liveStreamId", it) }
            // The receiver reads only these and refetches the rest: whole items would pass Cast's 64 KB limit.
            put("items", JSONArray(sent.items.map(::slim)))
        }
        return message("PlayNow", server, options)
    }

    private fun slim(item: ReceiverItem) = JSONObject().apply {
        item.id?.let { put("Id", it) }
        item.name?.let { put("Name", it) }
        item.type?.let { put("Type", it) }
        item.mediaType?.let { put("MediaType", it) }
        put("IsFolder", item.isFolder)
    }

    /** The part of a queue that fits one PlayNow and keeps the selected item, and its index in it. */
    fun <T> queueWindow(queue: List<T>, selectedIndex: Int, maxItems: Int): QueueWindow<T> {
        val selected = selectedIndex.coerceAtMost(queue.size - 1).coerceAtLeast(0)
        val start = selected.coerceAtMost(queue.size - maxItems).coerceAtLeast(0)
        return QueueWindow(queue.subList(start, minOf(queue.size, start + maxItems)), selected - start)
    }

    /** The receiver's own cleanup of the name it is given, before it uses it as its device name. */
    fun toReceiverDeviceName(receiverName: String): String =
        receiverName.filter { isAsciiWord(it) || it in JS_WHITESPACE }

    /**
     * The name to hand the receiver. It keeps only ASCII letters, digits, `_` and whitespace, then
     * calls btoa() on the rest, so a whitespace above U+00FF (which btoa refuses) becomes a plain
     * space, and a name with no ASCII letter or digit falls back to "Chromecast" and the id's tail.
     */
    fun receiverNameFor(device: ReceiverDevice?): String? {
        if (device == null) return null
        val name = (device.friendlyName ?: "").map { if (it in JS_WHITESPACE && it.code > 0xFF) ' ' else it }.joinToString("")
        if (toReceiverDeviceName(name).any(::isAsciiWord)) return name
        val id = (device.deviceId ?: "").filter { it in 'a'..'z' || it in 'A'..'Z' || it in '0'..'9' }.takeLast(FALLBACK_ID_LENGTH)
        return if (id.isNotEmpty()) "$FALLBACK_NAME $id" else FALLBACK_NAME
    }

    /** The bridges deliver what the receiver sent as a string; it is JSON unless something broke. */
    fun parseMessage(raw: String): ReceiverMessage = try {
        ReceiverMessage.Parsed(JSONObject(raw))
    } catch (_: JSONException) {
        ReceiverMessage.Unparsed(raw)
    }

    fun loadErrorOf(message: ReceiverMessage): ReceiverLoadError? = when ((message as? ReceiverMessage.Parsed)?.type) {
        "connectionerror" -> ReceiverLoadError.PLAYBACK_INFO_FAILED
        "playbackerror" -> ReceiverLoadError.PLAYBACK_FAILED
        "error" -> ReceiverLoadError.REJECTED
        else -> null
    }

    private fun stringOrNull(value: Any?) = value as? String

    /** A number as written, or as a non-blank string the bridges turned it into; nothing else. */
    private fun numberOrNull(value: Any?): Double? = when (value) {
        is Number -> value.toDouble().takeIf { it.isFinite() }
        is String -> value.trim().takeIf { it.isNotEmpty() }?.toDoubleOrNull()?.takeIf { it.isFinite() }
        else -> null
    }

    fun parseCustomData(customData: JSONObject?): ReceiverCustomData {
        val data = customData ?: return ReceiverCustomData()
        fun value(key: String) = data.opt(key).takeUnless { it == JSONObject.NULL }
        return ReceiverCustomData(
            itemId = stringOrNull(value("itemId")),
            playSessionId = stringOrNull(value("playSessionId")),
            audioStreamIndex = numberOrNull(value("audioStreamIndex"))?.toInt(),
            subtitleStreamIndex = numberOrNull(value("subtitleStreamIndex"))?.toInt(),
            mediaSourceId = stringOrNull(value("mediaSourceId")),
            playMethod = stringOrNull(value("playMethod")),
            runtimeTicks = numberOrNull(value("runtimeTicks"))?.toLong(),
            startPositionTicks = numberOrNull(value("startPositionTicks"))?.toLong(),
            canSeek = value("canSeek") as? Boolean,
            canClientSeek = value("canClientSeek") as? Boolean,
            liveStreamId = stringOrNull(value("liveStreamId")),
        )
    }

    /**
     * Where the receiver is in the item, in seconds, from its media status currentTime. A stream it
     * cannot seek in itself (transcoded music, live TV) runs from the position it was loaded at.
     */
    fun positionInItem(currentTime: Double, customData: ReceiverCustomData): Double =
        if (customData.canClientSeek == false) {
            currentTime + (customData.startPositionTicks ?: 0L).toDouble() / TICKS_PER_SECOND
        } else {
            currentTime
        }

    /** Whether the receiver plays this item's children instead of the item. */
    fun playsChildren(item: ReceiverItem?): Boolean =
        item != null && (item.type in PLAYED_THROUGH_CHILDREN || item.isFolder)
}

package expo.modules.mpvplayer.cast

import com.google.android.gms.cast.CastDevice
import com.google.android.gms.cast.MediaInfo
import com.google.android.gms.cast.MediaMetadata
import com.google.android.gms.cast.MediaQueueItem
import com.google.android.gms.cast.MediaStatus
import com.google.android.gms.cast.MediaTrack
import com.google.android.gms.cast.framework.CastSession
import expo.modules.mpvplayer.cast.target.GoogleCastTargetPort
import org.json.JSONArray
import org.json.JSONObject

/** SDK objects as the records the JS side declares in Cast.types.ts. */
object CastRecords {
    // The record discovery publishes, so a session's device carries the same fields.
    fun device(device: CastDevice?): Map<String, Any?>? = GoogleCastTargetPort.device(device)?.toMap()

    fun session(session: CastSession?): Map<String, Any?>? {
        val id = session?.sessionId ?: return null
        return mapOf("id" to id, "device" to device(session.castDevice))
    }

    fun mediaStatus(status: MediaStatus?): Map<String, Any?>? = status?.let {
        mapOf(
            "playerState" to CastMapping.playerStateName(it.playerState),
            // An idle receiver stopped, finished, or could not play the stream: only the reason tells them apart.
            "idleReason" to CastMapping.idleReasonName(it.idleReason),
            "currentItemId" to it.currentItemId.takeIf { id -> id != MediaQueueItem.INVALID_ITEM_ID },
            // The SDK counts milliseconds; the screens, like the library before them, read seconds.
            "streamPosition" to it.streamPosition / 1000.0,
            "playbackRate" to it.playbackRate,
            "volume" to it.streamVolume,
            "isMuted" to it.isMute,
            "mediaInfo" to mediaInfo(it.mediaInfo),
            "customData" to json(it.customData),
            // A track switched on the receiver (its captions) changes these and not the custom data.
            "activeTrackIds" to (it.activeTrackIds?.toList() ?: emptyList()),
        )
    }

    private fun mediaInfo(info: MediaInfo?): Map<String, Any?>? = info?.let {
        mapOf(
            "contentId" to it.contentId,
            "customData" to json(it.customData),
            "metadata" to metadata(it.metadata),
            "textTrackIds" to (it.mediaTracks?.filter { track -> track.type == MediaTrack.TYPE_TEXT }?.map { track -> track.id } ?: emptyList()),
        )
    }

    private fun metadata(metadata: MediaMetadata?): Map<String, Any?>? = metadata?.let {
        mapOf(
            "title" to it.getString(MediaMetadata.KEY_TITLE),
            "subtitle" to it.getString(MediaMetadata.KEY_SUBTITLE),
        )
    }

    /** org.json values as plain collections, which the Expo bridge hands to JS as objects. */
    fun json(value: Any?): Any? = when (value) {
        null, JSONObject.NULL -> null
        is JSONObject -> value.keys().asSequence().associateWith { key -> json(value.opt(key)) }
        is JSONArray -> (0 until value.length()).map { index -> json(value.opt(index)) }
        else -> value
    }
}

package expo.modules.mpvplayer.cast.engine

import expo.modules.mpvplayer.cast.receiver.ReceiverLoadOutcome
import org.json.JSONObject

// What the Cast engine needs from the Cast SDK, in plain types: GoogleCastPorts.kt implements these
// and the tests fake them, so the engine never touches an SDK type.

/** One media status as the SDK reported it, with the names of CastMapping. */
data class CastMediaSnapshot(
    val playerState: String,
    val idleReason: String,
    val hasMedia: Boolean,
    val streamPositionMs: Long,
    val playbackRate: Double,
    val customData: JSONObject?,
    val streamDurationMs: Long,
    val hasTextTracks: Boolean,
)

interface CastMediaListener {
    fun onStatusUpdated()
    fun onProgress(positionMs: Long)
}

/** The media channel of one session. A resume hands a new one, never the old one again. */
interface CastMediaPort {
    val status: CastMediaSnapshot?
    val approximatePositionMs: Long
    fun setListener(listener: CastMediaListener?, progressIntervalMs: Long)
    fun play()
    fun pause()
    fun togglePlayback()
    fun seek(positionMs: Long, done: (Boolean) -> Unit)
    fun requestStatus()
}

interface CastSessionPort {
    val sessionId: String?
    val isConnected: Boolean
    val media: CastMediaPort?

    /** Whether this sender started the receiver app; null when the SDK does not say. */
    val wasLaunched: Boolean?
    val volume: Double?
    fun setVolume(level: Double)
    fun setMute(muted: Boolean)
}

interface CastSessionListener {
    fun onSuspended(sessionId: String?)
    fun onResumed(session: CastSessionPort)
    fun onEnded(sessionId: String?, error: String?)
    fun onVolumeChanged(volume: Double, muted: Boolean)
}

interface CastSessionSource {
    val current: CastSessionPort?
    fun setListener(listener: CastSessionListener?)
}

/** How a load ended: settled by what the receiver reported, or never sent. */
sealed interface CastLoadResult {
    data class Settled(val outcome: ReceiverLoadOutcome) : CastLoadResult
    data class NotSent(val error: String) : CastLoadResult
}

/** Told when the engine loses its session; the error is null for an end the user asked for. */
fun interface CastBindingListener {
    fun onBindingLost(sessionId: String?, error: String?)
}

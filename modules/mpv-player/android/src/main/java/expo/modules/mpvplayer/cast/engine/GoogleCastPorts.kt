package expo.modules.mpvplayer.cast.engine

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.annotation.MainThread
import com.google.android.gms.cast.Cast
import com.google.android.gms.cast.MediaSeekOptions
import com.google.android.gms.cast.framework.CastContext
import com.google.android.gms.cast.framework.CastSession
import com.google.android.gms.cast.framework.SessionManager
import com.google.android.gms.cast.framework.SessionManagerListener
import com.google.android.gms.cast.framework.media.RemoteMediaClient
import expo.modules.mpvplayer.cast.CastMapping
import expo.modules.mpvplayer.cast.CastSupport
import expo.modules.mpvplayer.cast.GoogleCastChannelBinding
import expo.modules.mpvplayer.cast.ReceiverChannelHub
import expo.modules.mpvplayer.cast.receiver.ReceiverServer
import java.util.Collections
import java.util.WeakHashMap

// The Cast SDK behind the engine's ports: the one file of the engine that imports it. Every call runs
// on the main thread, as the SDK asserts; what the SDK throws is caught and logged.

private const val TAG = "CastEngine"

private inline fun <T> sdk(what: String, call: () -> T): T? = try {
    call()
} catch (error: Exception) {
    Log.w(TAG, "$what failed", error)
    null
}

/**
 * The engine for this device, bound to the shared receiver channel hub, or null where Cast is
 * unavailable (Android TV, no Play Services). It runs its timers and its calls on the main looper.
 */
@MainThread
fun CastEngine.Companion.create(context: Context, server: ReceiverServer): CastEngine? {
    // The availability check is a Play Services call too: it throws where the app's manifest lacks
    // the services version, as under Robolectric.
    if (sdk("isAvailable") { CastSupport.isAvailable(context) } != true) return null
    val cast = sdk("CastContext") { CastContext.getSharedInstance(context.applicationContext) } ?: return null
    GoogleCastChannelBinding.install(cast.sessionManager)
    val main = Handler(Looper.getMainLooper())
    return CastEngine(
        server = server,
        sessions = GoogleCastSessionSource(cast.sessionManager),
        hub = ReceiverChannelHub.shared,
        schedule = mainLooperSchedule(),
        runOnMain = { block -> if (Looper.myLooper() == Looper.getMainLooper()) block() else main.post(block) },
        log = { Log.i(TAG, it) },
    )
}

/** Timers on the main looper, cancellable, as the engine and the debug probe run theirs. */
internal fun mainLooperSchedule(): (Long, () -> Unit) -> (() -> Unit) {
    val main = Handler(Looper.getMainLooper())
    return { delayMs, run ->
        val task = Runnable(run)
        main.postDelayed(task, delayMs)
        val cancel: () -> Unit = { main.removeCallbacks(task) }
        cancel
    }
}

/** The session manager as the engine sees it: the current session, and what happens to sessions. */
internal class GoogleCastSessionSource(private val sessionManager: SessionManager) : CastSessionSource {
    private var listener: CastSessionListener? = null
    private var listening = false

    // A Cast.Listener per session object, for the volume: a session keeps its listeners, so one only.
    private val heard: MutableSet<CastSession> = Collections.newSetFromMap(WeakHashMap())

    override val current: CastSessionPort?
        get() = sdk("currentCastSession") { sessionManager.currentCastSession }?.let(::portFor)

    override fun setListener(listener: CastSessionListener?) {
        this.listener = listener
        if (listener != null && !listening) {
            sdk("addSessionManagerListener") { sessionManager.addSessionManagerListener(managerListener, CastSession::class.java) }
            listening = true
        } else if (listener == null && listening) {
            sdk("removeSessionManagerListener") { sessionManager.removeSessionManagerListener(managerListener, CastSession::class.java) }
            listening = false
        }
    }

    private fun portFor(session: CastSession): CastSessionPort {
        if (heard.add(session)) {
            sdk("addCastListener") {
                session.addCastListener(object : Cast.Listener() {
                    override fun onVolumeChanged() {
                        val volume = sdk("getVolume") { session.volume } ?: return
                        listener?.onVolumeChanged(volume, sdk("isMute") { session.isMute } ?: false)
                    }
                })
            }
        }
        return GoogleCastSessionPort(session)
    }

    private val managerListener = object : SessionManagerListener<CastSession> {
        override fun onSessionSuspended(session: CastSession, reason: Int) {
            listener?.onSuspended(session.sessionId)
        }

        override fun onSessionResumed(session: CastSession, wasSuspended: Boolean) {
            listener?.onResumed(portFor(session))
        }

        override fun onSessionResumeFailed(session: CastSession, error: Int) {
            listener?.onEnded(session.sessionId, CastMapping.sessionEndError(error))
        }

        override fun onSessionEnded(session: CastSession, error: Int) {
            listener?.onEnded(session.sessionId, CastMapping.sessionEndError(error))
        }

        override fun onSessionStarting(session: CastSession) = Unit

        override fun onSessionStarted(session: CastSession, sessionId: String) = Unit

        override fun onSessionStartFailed(session: CastSession, error: Int) = Unit

        override fun onSessionResuming(session: CastSession, sessionId: String) = Unit

        override fun onSessionEnding(session: CastSession) = Unit
    }
}

internal class GoogleCastSessionPort(private val session: CastSession) : CastSessionPort {
    private var mediaPort: GoogleCastMediaPort? = null

    override val sessionId: String?
        get() = session.sessionId

    override val isConnected: Boolean
        get() = sdk("isConnected") { session.isConnected } ?: false

    // A start or a resume rebuilds the remote media client: a new client gets a new port.
    override val media: CastMediaPort?
        get() {
            val client = sdk("remoteMediaClient") { session.remoteMediaClient } ?: return null
            mediaPort?.takeIf { it.client === client }?.let { return it }
            return GoogleCastMediaPort(client).also { mediaPort = it }
        }

    override val wasLaunched: Boolean?
        get() = sdk("applicationConnectionResult") { session.applicationConnectionResult?.wasLaunched }

    override val volume: Double?
        get() = sdk("getVolume") { session.volume }

    override fun setVolume(level: Double) {
        sdk("setVolume") { session.volume = level }
    }

    override fun setMute(muted: Boolean) {
        sdk("setMute") { session.setMute(muted) }
    }
}

internal class GoogleCastMediaPort(val client: RemoteMediaClient) : CastMediaPort {
    private var listener: CastMediaListener? = null

    private val callback = object : RemoteMediaClient.Callback() {
        override fun onStatusUpdated() {
            listener?.onStatusUpdated()
        }
    }

    private val progress = RemoteMediaClient.ProgressListener { progressMs, _ -> listener?.onProgress(progressMs) }

    // The receiver writes its customData on the media information, not on the status (spec §3.1).
    override val status: CastMediaSnapshot?
        get() {
            val status = sdk("mediaStatus") { client.mediaStatus } ?: return null
            val info = status.mediaInfo
            val trackTypes = info?.mediaTracks?.map { it.type } ?: emptyList()
            return CastMediaSnapshot(
                playerState = CastMapping.playerStateName(status.playerState),
                idleReason = CastMapping.idleReasonName(status.idleReason),
                hasMedia = info != null,
                streamPositionMs = status.streamPosition,
                playbackRate = status.playbackRate,
                customData = info?.customData,
                streamDurationMs = info?.streamDuration ?: -1L,
                hasTextTracks = CastMapping.hasTextTracks(trackTypes),
            )
        }

    override val approximatePositionMs: Long
        get() = sdk("approximateStreamPosition") { client.approximateStreamPosition } ?: 0L

    override fun setListener(listener: CastMediaListener?, progressIntervalMs: Long) {
        val wasListening = this.listener != null
        this.listener = listener
        if (listener != null && !wasListening) {
            sdk("registerCallback") { client.registerCallback(callback) }
            sdk("addProgressListener") { client.addProgressListener(progress, progressIntervalMs) }
        } else if (listener == null && wasListening) {
            sdk("unregisterCallback") { client.unregisterCallback(callback) }
            sdk("removeProgressListener") { client.removeProgressListener(progress) }
        }
    }

    override fun play() {
        sdk("play") { client.play() }
    }

    override fun pause() {
        sdk("pause") { client.pause() }
    }

    override fun togglePlayback() {
        sdk("togglePlayback") { client.togglePlayback() }
    }

    override fun seek(positionMs: Long, done: (Boolean) -> Unit) {
        val options = MediaSeekOptions.Builder().setPosition(positionMs).setResumeState(MediaSeekOptions.RESUME_STATE_UNCHANGED).build()
        val pending = sdk("seek") { client.seek(options) }
        if (pending == null) {
            done(false)
            return
        }
        pending.setResultCallback { done(it.status.isSuccess) }
    }

    override fun requestStatus() {
        sdk("requestStatus") { client.requestStatus() }
    }
}

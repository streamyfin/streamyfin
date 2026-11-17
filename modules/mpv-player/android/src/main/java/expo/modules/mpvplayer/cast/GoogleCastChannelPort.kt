package expo.modules.mpvplayer.cast

import android.util.Log
import androidx.annotation.MainThread
import com.google.android.gms.cast.Cast
import com.google.android.gms.cast.framework.CastSession
import com.google.android.gms.cast.framework.SessionManager
import com.google.android.gms.cast.framework.SessionManagerListener
import com.google.android.gms.common.api.PendingResult
import com.google.android.gms.common.api.Status
import java.io.IOException

/**
 * One Cast session's receiver channel, as the hub sees it. The SDK calls come in as functions so
 * that a test can stand in for the session, and [of] wires a real one: the SDK's callback, whose
 * device Kotlin checks for null, stays there.
 */
internal class SdkChannelPort(
    override val sessionId: String?,
    private val connected: () -> Boolean,
    private val setCallbacks: (String, (String) -> Unit) -> Unit,
    private val removeCallbacks: (String) -> Unit,
    private val sendMessage: (String, String) -> PendingResult<Status>,
) : ReceiverChannelPort {
    override val isConnected: Boolean
        get() = connected()

    // A session that lost its connection throws instead of taking the callback: refused, the
    // namespace stays free for the next attach.
    override fun register(namespace: String, onMessage: (String) -> Unit): Boolean = try {
        setCallbacks(namespace, onMessage)
        true
    } catch (error: IOException) {
        refused(namespace, error)
    } catch (error: IllegalStateException) {
        refused(namespace, error)
    } catch (error: IllegalArgumentException) {
        refused(namespace, error)
    }

    override fun unregister(namespace: String) {
        // The session may be gone already, and its callbacks with it.
        try {
            removeCallbacks(namespace)
        } catch (error: IOException) {
            Log.w(TAG, "Removing the $namespace callback failed", error)
        } catch (error: IllegalArgumentException) {
            Log.w(TAG, "Removing the $namespace callback failed", error)
        }
    }

    override fun send(namespace: String, text: String, done: (String?) -> Unit) {
        val pending = try {
            sendMessage(namespace, text)
        } catch (error: IllegalArgumentException) {
            done(error.message ?: SEND_REFUSED)
            return
        } catch (error: IllegalStateException) {
            done(error.message ?: SEND_REFUSED)
            return
        }
        pending.setResultCallback { status -> done(if (status.isSuccess) null else status.statusMessage ?: SEND_REFUSED) }
    }

    private fun refused(namespace: String, error: Exception): Boolean {
        Log.w(TAG, "The Cast session refused the $namespace callback", error)
        return false
    }

    companion object {
        private const val TAG = "StreamyfinCast"
        private const val SEND_REFUSED = "The receiver did not take the message"

        fun of(session: CastSession) = SdkChannelPort(
            sessionId = session.sessionId,
            connected = session::isConnected,
            setCallbacks = { namespace, onMessage ->
                session.setMessageReceivedCallbacks(namespace, Cast.MessageReceivedCallback { _, _, message -> onMessage(message) })
            },
            removeCallbacks = session::removeMessageReceivedCallbacks,
            sendMessage = session::sendMessage,
        )
    }
}

/**
 * Ties the shared hub to the SDK's sessions, once per process: a start and a resume both rebuild
 * the Cast client and drop its channel callbacks, so each hands the hub a new port.
 */
internal object GoogleCastChannelBinding {
    private var installedOn: SessionManager? = null

    @MainThread
    fun install(sessionManager: SessionManager, hub: ReceiverChannelHub = ReceiverChannelHub.shared) {
        if (installedOn === sessionManager) return
        installedOn = sessionManager
        sessionManager.addSessionManagerListener(listener(hub), CastSession::class.java)
        // A session that was there before the binding (a JS reload, the SDK's own reconnection).
        sessionManager.currentCastSession?.takeIf { it.isConnected }?.let { hub.attach(SdkChannelPort.of(it)) }
    }

    private fun listener(hub: ReceiverChannelHub) = object : SessionManagerListener<CastSession> {
        override fun onSessionStarted(session: CastSession, sessionId: String) = hub.attach(SdkChannelPort.of(session))

        override fun onSessionResumed(session: CastSession, wasSuspended: Boolean) = hub.attach(SdkChannelPort.of(session))

        override fun onSessionSuspended(session: CastSession, reason: Int) = hub.suspend()

        override fun onSessionEnded(session: CastSession, error: Int) = hub.end()

        override fun onSessionResumeFailed(session: CastSession, error: Int) = hub.end()

        override fun onSessionStarting(session: CastSession) = Unit

        override fun onSessionStartFailed(session: CastSession, error: Int) = Unit

        override fun onSessionResuming(session: CastSession, sessionId: String) = Unit

        override fun onSessionEnding(session: CastSession) = Unit
    }
}

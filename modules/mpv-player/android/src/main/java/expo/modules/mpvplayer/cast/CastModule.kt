package expo.modules.mpvplayer.cast

import android.content.Context
import android.content.Intent
import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.mediarouter.app.MediaRouteChooserDialog
import androidx.mediarouter.app.MediaRouteControllerDialog
import androidx.mediarouter.media.MediaRouter
import com.google.android.gms.cast.CastDevice
import com.google.android.gms.cast.MediaSeekOptions
import com.google.android.gms.cast.framework.CastContext
import com.google.android.gms.cast.framework.CastSession
import com.google.android.gms.cast.framework.CastStateListener
import com.google.android.gms.cast.framework.SessionManagerListener
import com.google.android.gms.cast.framework.media.RemoteMediaClient
import com.google.android.gms.common.GoogleApiAvailability
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * The Cast SDK, owned by the module: context, discovery, session, custom channels and the
 * media status, published to JS as the events and records of Cast.types.ts. Every SDK call
 * runs on the main thread (the SDK asserts it); the synchronous getters answer from caches
 * the listeners keep current, so a screen can read them from the JS thread.
 */
class CastModule : Module() {
    // Expo drops the module's app context right after OnDestroy, and reading it then throws:
    // a callback still queued on the main looper has to know it is late.
    @Volatile
    private var destroyed = false

    private val context: Context
        get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

    private val mainHandler = Handler(Looper.getMainLooper())
    // Written on the main thread, read by the synchronous getters from the JS thread: volatile
    // keeps a read right after an update from answering the previous value.
    @Volatile
    private var castContext: CastContext? = null
    @Volatile
    private var cachedState: String? = null
    @Volatile
    private var cachedDevices: List<Map<String, Any?>> = emptyList()
    @Volatile
    private var cachedSession: Map<String, Any?>? = null
    private var routerCallback: MediaRouter.Callback? = null
    // The router the callback went to: OnDestroy runs once the React context may be gone, and the
    // context getter would throw on the main looper instead of letting the callback go.
    private var registeredRouter: MediaRouter? = null
    // JS asked for discovery; it pauses while the app is in the background and resumes with it.
    private var discoveryWanted = false
    private var mediaClient: RemoteMediaClient? = null
    private val channels = mutableSetOf<String>()

    private val stateListener = CastStateListener { state -> updateState(state) }

    private val mediaCallback = object : RemoteMediaClient.Callback() {
        override fun onStatusUpdated() {
            sendEvent("onMediaStatusChanged", mapOf("status" to CastRecords.mediaStatus(mediaClient?.mediaStatus)))
        }
    }

    private val sessionListener = object : SessionManagerListener<CastSession> {
        override fun onSessionStarting(session: CastSession) = emitSession("starting", session, null)

        override fun onSessionStarted(session: CastSession, sessionId: String) {
            attachMedia(session)
            updateSession(session)
            emitSession("started", session, null)
        }

        override fun onSessionStartFailed(session: CastSession, error: Int) =
            emitSession("startFailed", session, CastMapping.sessionEndError(error))

        override fun onSessionSuspended(session: CastSession, reason: Int) {
            detachMedia()
            emitSession("suspended", session, null)
        }

        override fun onSessionResuming(session: CastSession, sessionId: String) = emitSession("resuming", session, null)

        override fun onSessionResumed(session: CastSession, wasSuspended: Boolean) {
            attachMedia(session)
            updateSession(session)
            emitSession("resumed", session, null)
        }

        override fun onSessionResumeFailed(session: CastSession, error: Int) =
            emitSession("startFailed", session, CastMapping.sessionEndError(error))

        override fun onSessionEnding(session: CastSession) = emitSession("ending", session, null)

        override fun onSessionEnded(session: CastSession, error: Int) {
            detachMedia()
            // The channels died with the session; the JS side opens new ones on the next command.
            channels.clear()
            updateSession(null)
            emitSession("ended", session, CastMapping.sessionEndError(error))
        }
    }

    override fun definition() = ModuleDefinition {
        Name("StreamyfinCast")

        Events("onCastStateChanged", "onDevicesChanged", "onSessionEvent", "onMediaStatusChanged", "onReceiverMessage")

        OnStartObserving {
            mainHandler.post { ensureContext() }
        }

        // CastContext and MediaRouter outlive the module: after a JS reload the old instance
        // would keep feeding events to a dead app context.
        OnDestroy {
            destroyed = true
            mainHandler.removeCallbacksAndMessages(null)
            mainHandler.post { release() }
        }

        // An active scan costs battery; the SDK's own button paused it while off screen.
        OnActivityEntersBackground {
            mainHandler.post { stopDiscovery() }
        }

        OnActivityEntersForeground {
            mainHandler.post { if (discoveryWanted) ensureContext()?.let { cast -> startDiscovery(cast) } }
        }

        Function("isAvailable") { CastSupport.isAvailable(context) }

        Function("getCastState") {
            if (castContext == null) mainHandler.post { ensureContext() }
            cachedState
        }

        Function("getPlayServicesState") { CastMapping.playServicesStateName(CastSupport.playServicesState(context)) }

        AsyncFunction("showPlayServicesErrorDialog") { _: String ->
            val activity = appContext.currentActivity ?: return@AsyncFunction Unit
            val code = CastSupport.playServicesState(context)
            GoogleApiAvailability.getInstance().getErrorDialog(activity, code, 0)?.show()
            Unit
        }.runOnQueue(Queues.MAIN)

        Function("getDevices") { cachedDevices }

        AsyncFunction("startDiscovery") {
            discoveryWanted = true
            ensureContext()?.let { cast -> startDiscovery(cast) }
            Unit
        }.runOnQueue(Queues.MAIN)

        AsyncFunction("stopDiscovery") {
            discoveryWanted = false
            stopDiscovery()
            Unit
        }.runOnQueue(Queues.MAIN)

        Function("getCurrentSession") {
            if (castContext == null) mainHandler.post { ensureContext() }
            cachedSession
        }

        AsyncFunction("showCastDialog") {
            val activity = appContext.currentActivity ?: return@AsyncFunction false
            val cast = ensureContext() ?: return@AsyncFunction false
            // A suspended or connecting session still owns the route: the controller dialog is
            // the one with "Stop casting", the chooser would list the same TV as a no-op.
            if (cast.sessionManager.currentSession != null) {
                MediaRouteControllerDialog(activity).show()
            } else {
                val selector = cast.mergedSelector ?: return@AsyncFunction false
                MediaRouteChooserDialog(activity).apply { routeSelector = selector }.show()
            }
            true
        }.runOnQueue(Queues.MAIN)

        AsyncFunction("showExpandedControls") {
            if (ensureContext() == null) return@AsyncFunction false
            val intent = Intent(context, CastExpandedControllerActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(intent)
            true
        }.runOnQueue(Queues.MAIN)

        AsyncFunction("addChannel") { namespace: String ->
            val session = currentSession() ?: return@AsyncFunction mapOf("namespace" to namespace, "connected" to false)
            if (channels.add(namespace)) {
                session.setMessageReceivedCallbacks(namespace) { _: CastDevice, received: String, message: String ->
                    sendEvent("onReceiverMessage", mapOf("namespace" to received, "message" to message))
                }
            }
            mapOf("namespace" to namespace, "connected" to session.isConnected)
        }.runOnQueue(Queues.MAIN)

        AsyncFunction("removeChannel") { namespace: String ->
            if (channels.remove(namespace)) {
                // The session may be gone already; its callbacks went with it.
                runCatching { currentSession()?.removeMessageReceivedCallbacks(namespace) }
            }
            Unit
        }.runOnQueue(Queues.MAIN)

        AsyncFunction("sendMessage") { namespace: String, message: String, promise: Promise ->
            val session = currentSession()
            if (session == null) {
                promise.reject("ERR_CAST_NO_SESSION", "No Cast session to send on", null)
                return@AsyncFunction
            }
            session.sendMessage(namespace, message).setResultCallback { status ->
                if (status.isSuccess) promise.resolve(null)
                else promise.reject("ERR_CAST_SEND", status.statusMessage ?: "The receiver did not take the message", null)
            }
        }.runOnQueue(Queues.MAIN)

        AsyncFunction("getMediaStatus") {
            CastRecords.mediaStatus(currentSession()?.remoteMediaClient?.mediaStatus)
        }.runOnQueue(Queues.MAIN)

        AsyncFunction("play") { currentSession()?.remoteMediaClient?.play(); Unit }.runOnQueue(Queues.MAIN)
        AsyncFunction("pause") { currentSession()?.remoteMediaClient?.pause(); Unit }.runOnQueue(Queues.MAIN)
        AsyncFunction("stop") { currentSession()?.remoteMediaClient?.stop(); Unit }.runOnQueue(Queues.MAIN)
        AsyncFunction("seek") { positionSeconds: Double ->
            val options = MediaSeekOptions.Builder().setPosition((positionSeconds * 1000).toLong()).build()
            currentSession()?.remoteMediaClient?.seek(options)
            Unit
        }.runOnQueue(Queues.MAIN)

        View(CastButtonView::class) {
            Prop("tintColor") { view: CastButtonView, color: String? -> view.setTintColor(color) }
        }
    }

    // Main thread only: the SDK checks it, and the caches are written here alone.
    private fun ensureContext(): CastContext? {
        // Posted to the main looper from several places: a module destroyed or a React
        // context cleared in between is "nothing to do", not an exception on the looper.
        if (destroyed) return null
        val reactContext = appContext.reactContext ?: return null
        if (!CastSupport.isAvailable(reactContext)) return null
        castContext?.let { return it }
        val cast = try {
            CastContext.getSharedInstance(reactContext.applicationContext)
        } catch (error: RuntimeException) {
            // Every Cast call then does nothing; the reason has to be somewhere.
            Log.w(TAG, "Cast context could not be initialized", error)
            return null
        }
        castContext = cast
        cast.addCastStateListener(stateListener)
        updateState(cast.castState)
        cast.sessionManager.addSessionManagerListener(sessionListener, CastSession::class.java)
        cast.sessionManager.currentCastSession?.let { session ->
            attachMedia(session)
            updateSession(session)
            // A session that was there before JS listened (a reload, the SDK's own reconnection)
            // is announced like a resume, or the hooks would never see it.
            emitSession("resumed", session, null)
        }
        return cast
    }

    private fun currentSession(): CastSession? = ensureContext()?.sessionManager?.currentCastSession

    private fun updateState(state: Int) {
        val name = CastMapping.castStateName(state) ?: return
        if (name == cachedState) return
        cachedState = name
        sendEvent("onCastStateChanged", mapOf("state" to name))
    }

    private fun updateSession(session: CastSession?) {
        cachedSession = CastRecords.session(session)
    }

    private fun emitSession(event: String, session: CastSession, error: String?) {
        sendEvent("onSessionEvent", mapOf("event" to event, "sessionId" to session.sessionId, "error" to error))
    }

    private fun attachMedia(session: CastSession) {
        val client = session.remoteMediaClient ?: return
        if (client === mediaClient) return
        detachMedia()
        client.registerCallback(mediaCallback)
        mediaClient = client
    }

    private fun detachMedia() {
        mediaClient?.unregisterCallback(mediaCallback)
        mediaClient = null
    }

    private fun release() {
        stopDiscovery()
        detachMedia()
        castContext?.let { cast ->
            // The channel callbacks hold this instance too; a live session would keep calling it.
            cast.sessionManager.currentCastSession?.let { session ->
                channels.forEach { namespace -> runCatching { session.removeMessageReceivedCallbacks(namespace) } }
            }
            cast.removeCastStateListener(stateListener)
            cast.sessionManager.removeSessionManagerListener(sessionListener, CastSession::class.java)
        }
        channels.clear()
        castContext = null
    }

    private companion object {
        const val TAG = "StreamyfinCast"
    }

    private fun startDiscovery(cast: CastContext) {
        if (routerCallback != null) return
        val selector = cast.mergedSelector ?: return
        val router = MediaRouter.getInstance(context.applicationContext)
        val callback = object : MediaRouter.Callback() {
            override fun onRouteAdded(router: MediaRouter, route: MediaRouter.RouteInfo) = updateDevices(router, cast)
            override fun onRouteRemoved(router: MediaRouter, route: MediaRouter.RouteInfo) = updateDevices(router, cast)
            override fun onRouteChanged(router: MediaRouter, route: MediaRouter.RouteInfo) = updateDevices(router, cast)
        }
        // Active scan finds the receivers a passive one misses; the library needed a mounted button for this.
        router.addCallback(
            selector,
            callback,
            MediaRouter.CALLBACK_FLAG_REQUEST_DISCOVERY or MediaRouter.CALLBACK_FLAG_PERFORM_ACTIVE_SCAN,
        )
        routerCallback = callback
        registeredRouter = router
        updateDevices(router, cast)
    }

    private fun stopDiscovery() {
        val callback = routerCallback ?: return
        registeredRouter?.removeCallback(callback)
        routerCallback = null
        registeredRouter = null
    }

    private fun updateDevices(router: MediaRouter, cast: CastContext) {
        val selector = cast.mergedSelector ?: return
        val devices = router.routes
            .filter { route -> !route.isDefault && route.matchesSelector(selector) }
            .mapNotNull { route -> CastDevice.getFromBundle(route.extras) }
            .mapNotNull { device -> CastRecords.device(device) }
        if (devices == cachedDevices) return
        cachedDevices = devices
        sendEvent("onDevicesChanged", mapOf("devices" to devices))
    }
}

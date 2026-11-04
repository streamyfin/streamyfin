package expo.modules.mpvplayer.cast.target

import android.content.Context
import android.util.Log
import androidx.annotation.MainThread
import androidx.mediarouter.media.MediaRouter
import com.google.android.gms.cast.Cast
import com.google.android.gms.cast.CastDevice
import com.google.android.gms.cast.framework.CastContext
import com.google.android.gms.cast.framework.CastSession
import com.google.android.gms.cast.framework.SessionManagerListener
import expo.modules.mpvplayer.cast.CastMapping
import expo.modules.mpvplayer.cast.engine.mainLooperSchedule
import java.io.IOException

/** A Cast route as the port uses it: the receiver it reaches, whether MediaRouter takes it now, and how to select it. */
internal class CastRoute(val device: TargetDevice, val enabled: Boolean = true, val select: () -> Unit)

/** The SDK's current session when the port starts: connected, or still connecting. */
internal class RunningSession(val device: TargetDevice?, val connected: Boolean)

/**
 * The Cast SDK as the hub sees it. The SDK calls come in as functions so that a test can stand in
 * for MediaRouter and the session manager, and [of] wires the real ones. Main thread only.
 */
internal class GoogleCastTargetPort(
    private val routes: () -> List<CastRoute>,
    private val runningSession: () -> RunningSession?,
    private val endSession: (stopPlayback: Boolean) -> Unit,
    private val unselectRoute: () -> Unit,
    private val watchSessions: (((String, TargetDevice?, String?, Int?) -> Unit)?) -> Unit,
    private val watchRoutes: ((() -> Unit)?) -> Unit,
    /** The main loop, for what has to wait until the SDK has finished the callback it is in. */
    private val schedule: (Long, () -> Unit) -> (() -> Unit),
    /** The current session's receiver volume and mute, null without a session. */
    private val sessionVolume: () -> Pair<Double, Boolean>?,
    private val setSessionVolume: (Double) -> Unit,
    private val setSessionMuted: (Boolean) -> Unit,
    private val watchVolume: (((Double, Boolean) -> Unit)?) -> Unit,
) : TargetPort {
    private var events: TargetPortEvents? = null
    private var discovering = false
    // The receiver a switch is taking the session from, until the SDK reports that session's end, and the
    // one asked back meanwhile. Its route is selected on the main loop turn after that end: the SDK's
    // cleanup of an ended session selects the default route when that session's route is selected at that
    // moment, after the listeners have run, so a route selected before, or inside the callback, lost to it.
    private var leaving: TargetDevice? = null
    private var afterLeaving: TargetDevice? = null

    override fun start(events: TargetPortEvents) {
        this.events = events
        watchSessions { event, device, error, code ->
            this.events?.sessionEvent(event, device, error, code)
            // A session's volume is the receiver's: read once it is up, then followed.
            if (event == "started" || event == "resumed") reportVolume()
            sessionChanged(event, device)
        }
        watchVolume { level, muted -> this.events?.volumeChanged(level, muted) }
        // A session that was there before the port (a JS reload, the SDK's own reconnection at launch).
        runningSession()?.let { session ->
            events.sessionEvent(if (session.connected) "resumed" else "resuming", session.device, null)
            reportVolume()
        }
    }

    private fun reportVolume() {
        sessionVolume()?.let { (level, muted) -> events?.volumeChanged(level, muted) }
    }

    override fun setVolume(level: Double) = setSessionVolume(level)

    override fun setMuted(muted: Boolean) = setSessionMuted(muted)

    override fun stop() {
        leaving = null
        afterLeaving = null
        stopDiscovery()
        watchSessions(null)
        watchVolume(null)
        events = null
    }

    override fun devices(): List<TargetDevice> = routes().map { it.device }

    override fun startDiscovery() {
        if (discovering) return
        discovering = true
        watchRoutes { events?.devicesChanged(devices()) }
        events?.devicesChanged(devices())
    }

    override fun stopDiscovery() {
        if (!discovering) return
        discovering = false
        watchRoutes(null)
    }

    override fun connect(device: TargetDevice) {
        if (device.id == leaving?.id) {
            afterLeaving = device
            return
        }
        afterLeaving = null
        runningSession()?.device?.takeIf { it.id != device.id }?.let { leaving = it }
        select(device)
    }

    private fun select(device: TargetDevice) {
        val route = routes().firstOrNull { it.device.id == device.id }
        if (route == null) {
            events?.sessionEvent("startFailed", device, RECEIVER_GONE)
            return
        }
        // MediaRouter ignores a disabled route's select(), so no session event would ever come.
        if (!route.enabled) {
            events?.sessionEvent("startFailed", device, RECEIVER_BUSY)
            return
        }
        // The SDK's session manager follows the selected route: it ends a session on another one first.
        route.select()
    }

    override fun disconnect(stopPlayback: Boolean) {
        afterLeaving = null
        if (runningSession() != null) {
            endSession(stopPlayback)
            return
        }
        // Asked before the SDK started a session: nothing would end, so the request ends here.
        unselectRoute()
        events?.sessionEvent("ended", null, null)
    }

    private fun sessionChanged(event: String, device: TargetDevice?) {
        val left = leaving ?: return
        if (event != "ended" && event != "startFailed") return
        if (device != null && device.id != left.id) return
        leaving = null
        if (afterLeaving == null) return
        // A disconnect meanwhile drops the request: it clears afterLeaving before this runs.
        schedule(0) {
            val next = afterLeaving ?: return@schedule
            afterLeaving = null
            select(next)
        }
    }

    companion object {
        const val RECEIVER_GONE = "The receiver is no longer on the network"
        const val RECEIVER_BUSY = "The receiver cannot take a session now"

        private const val TAG = "GoogleCastTargetPort"

        fun device(device: CastDevice?): TargetDevice? =
            device?.let { device(it.deviceId, it.friendlyName, it.modelName, it.hasCapability(CastDevice.CAPABILITY_VIDEO_OUT)) }

        fun device(id: String, name: String?, model: String?, videoOut: Boolean) = TargetDevice(id, name ?: "", model, videoOut)

        @MainThread
        fun of(context: Context, cast: CastContext): GoogleCastTargetPort {
            val router = MediaRouter.getInstance(context.applicationContext)
            val sessions = cast.sessionManager
            var sessionListener: SessionManagerListener<CastSession>? = null
            var routerCallback: MediaRouter.Callback? = null
            var volumeRelay: ((Double, Boolean) -> Unit)? = null
            // The receiver's volume comes through the session's Cast.Listener, one per session.
            val volumeListener = object : Cast.Listener() {
                override fun onVolumeChanged() {
                    sessions.currentCastSession?.let { volumeRelay?.invoke(it.volume, it.isMute) }
                }
            }
            fun listenToVolume(session: CastSession) {
                session.removeCastListener(volumeListener)
                session.addCastListener(volumeListener)
            }
            // The SDK refuses a volume for a session that is not connected; the state follows what it reports.
            fun onSession(action: String, set: (CastSession) -> Unit) {
                val session = sessions.currentCastSession ?: return
                try {
                    set(session)
                } catch (error: IOException) {
                    Log.w(TAG, "$action failed", error)
                } catch (error: IllegalStateException) {
                    Log.w(TAG, "$action failed", error)
                }
            }

            fun castRoutes(): List<CastRoute> {
                val selector = cast.mergedSelector ?: return emptyList()
                return router.routes
                    .filter { route -> !route.isDefault && route.matchesSelector(selector) }
                    .mapNotNull { route ->
                        device(CastDevice.getFromBundle(route.extras))?.let { CastRoute(it, route.isEnabled, route::select) }
                    }
            }

            // The SDK reports "Stop casting" under a status code of its own, which only the context resolves.
            fun endError(error: Int): String? = CastMapping.sessionEndError(error, cast.getCastReasonCodeForCastStatusCode(error))

            return GoogleCastTargetPort(
                routes = ::castRoutes,
                runningSession = {
                    sessions.currentCastSession?.let { session -> RunningSession(device(session.castDevice), session.isConnected) }
                },
                endSession = sessions::endCurrentSession,
                unselectRoute = { router.unselect(MediaRouter.UNSELECT_REASON_STOPPED) },
                watchSessions = { relay ->
                    sessionListener?.let { sessions.removeSessionManagerListener(it, CastSession::class.java) }
                    sessionListener = relay?.let { report ->
                        sessionListener(report, ::endError, onUp = ::listenToVolume, onGone = { it.removeCastListener(volumeListener) })
                    }
                    sessionListener?.let { sessions.addSessionManagerListener(it, CastSession::class.java) }
                },
                watchRoutes = { onChange ->
                    routerCallback?.let(router::removeCallback)
                    routerCallback = null
                    val selector = cast.mergedSelector
                    if (onChange != null && selector != null) {
                        val callback = object : MediaRouter.Callback() {
                            override fun onRouteAdded(router: MediaRouter, route: MediaRouter.RouteInfo) = onChange()
                            override fun onRouteRemoved(router: MediaRouter, route: MediaRouter.RouteInfo) = onChange()
                            override fun onRouteChanged(router: MediaRouter, route: MediaRouter.RouteInfo) = onChange()
                        }
                        // Active scan finds the receivers a passive one misses; the library needed a mounted button for this.
                        router.addCallback(
                            selector,
                            callback,
                            MediaRouter.CALLBACK_FLAG_REQUEST_DISCOVERY or MediaRouter.CALLBACK_FLAG_PERFORM_ACTIVE_SCAN,
                        )
                        routerCallback = callback
                    }
                },
                schedule = mainLooperSchedule(),
                sessionVolume = { sessions.currentCastSession?.let { it.volume to it.isMute } },
                setSessionVolume = { level -> onSession("setVolume") { it.volume = level } },
                setSessionMuted = { muted -> onSession("setMute") { it.isMute = muted } },
                watchVolume = { relay ->
                    volumeRelay = relay
                    sessions.currentCastSession?.let { session ->
                        if (relay != null) listenToVolume(session) else session.removeCastListener(volumeListener)
                    }
                },
            )
        }

        // The same event names and errors as the module's own listener, which onSessionEvent publishes; an
        // error comes with the SDK's status code. [onUp] and [onGone] follow the session for its volume.
        private fun sessionListener(
            report: (String, TargetDevice?, String?, Int?) -> Unit,
            endError: (Int) -> String?,
            onUp: (CastSession) -> Unit,
            onGone: (CastSession) -> Unit,
        ) = object : SessionManagerListener<CastSession> {
            fun failure(event: String, session: CastSession, error: Int) {
                val message = endError(error)
                report(event, device(session.castDevice), message, if (message != null) error else null)
            }

            override fun onSessionStarting(session: CastSession) = report("starting", device(session.castDevice), null, null)

            override fun onSessionStarted(session: CastSession, sessionId: String) {
                onUp(session)
                report("started", device(session.castDevice), null, null)
            }

            override fun onSessionStartFailed(session: CastSession, error: Int) = failure("startFailed", session, error)

            override fun onSessionSuspended(session: CastSession, reason: Int) =
                report("suspended", device(session.castDevice), null, null)

            override fun onSessionResuming(session: CastSession, sessionId: String) =
                report("resuming", device(session.castDevice), null, null)

            override fun onSessionResumed(session: CastSession, wasSuspended: Boolean) {
                onUp(session)
                report("resumed", device(session.castDevice), null, null)
            }

            override fun onSessionResumeFailed(session: CastSession, error: Int) = failure("startFailed", session, error)

            override fun onSessionEnding(session: CastSession) = report("ending", device(session.castDevice), null, null)

            override fun onSessionEnded(session: CastSession, error: Int) {
                onGone(session)
                failure("ended", session, error)
            }
        }
    }
}

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
import com.google.android.gms.cast.framework.media.RemoteMediaClient
import expo.modules.mpvplayer.cast.CastMapping
import expo.modules.mpvplayer.cast.engine.mainLooperSchedule
import kotlin.math.roundToInt

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
    /** The current session's device muted itself, apart from its stream: another sender did it. False without one. */
    private val deviceMuted: () -> Boolean,
) : TargetPort {
    private var events: TargetPortEvents? = null
    private var discovering = false
    // The receiver a switch is taking the session from, until the SDK reports that session's end, and the
    // one asked back meanwhile. Its route is selected on the main loop turn after that end: the SDK's
    // cleanup of an ended session selects the default route when that session's route is selected at that
    // moment, after the listeners have run, so a route selected before, or inside the callback, lost to it.
    private var leaving: TargetDevice? = null
    private var afterLeaving: TargetDevice? = null
    // A launch cancelled before its session was up, which the hub was told ended at once. Ending a session still
    // starting lets the launch go on and leaves the receiver app open on the TV (bench, 04/11): the session is
    // ended once it is up instead, which closes the app. Its events stay away from the hub until that end.
    private var cancelled: CancelledLaunch? = null

    /** [stopWhenUp] is the stop asked, null once none is due: sent already, or another route ends the session. */
    private class CancelledLaunch(val device: TargetDevice, var stopWhenUp: Boolean?)

    override fun start(events: TargetPortEvents) {
        this.events = events
        watchSessions { event, device, error, code ->
            if (!cancelledLaunchEvent(event, device)) {
                this.events?.sessionEvent(event, device, error, code)
                // A session's volume is the receiver's: read once it is up, then followed.
                if (event == "started" || event == "resumed") reportVolume()
            }
            sessionChanged(event, device)
        }
        watchVolume { level, muted -> this.events?.volumeChanged(level, muted, deviceMuted()) }
        // A session that was there before the port (a JS reload, the SDK's own reconnection at launch).
        runningSession()?.let { session ->
            events.sessionEvent(if (session.connected) "resumed" else "resuming", session.device, null)
            reportVolume()
        }
    }

    private fun reportVolume() {
        sessionVolume()?.let { (level, muted) -> events?.volumeChanged(level, muted, deviceMuted()) }
    }

    override fun setVolume(level: Double) = setSessionVolume(level)

    override fun setMuted(muted: Boolean) = setSessionMuted(muted)

    override fun stop() {
        leaving = null
        afterLeaving = null
        cancelled = null
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
        cancelled?.takeIf { it.device.id == device.id }?.let { launch ->
            // Asked again before it was up, the launch goes on and the hub follows it again; asked again while that
            // session is being ended, it is selected again once it has, as for a switch back.
            if (launch.stopWhenUp != null) cancelled = null else leaving = launch.device
        }
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
        // Another receiver's route ends a cancelled launch: no stop is due once it is selected, and that launch's end
        // still stays away from the hub. A refused route selects nothing, and the stop stays due.
        cancelled?.takeIf { it.device.id != device.id }?.stopWhenUp = null
        // The SDK's session manager follows the selected route: it ends a session on another one first.
        route.select()
    }

    override fun disconnect(stopPlayback: Boolean) {
        afterLeaving = null
        val session = runningSession()
        val launching = session?.device?.takeIf { !session.connected }
        if (launching != null) {
            cancelled = CancelledLaunch(launching, stopPlayback)
            events?.sessionEvent("ended", launching, null)
            return
        }
        if (session != null) {
            endSession(stopPlayback)
            return
        }
        // Asked before the SDK started a session: nothing would end, so the request ends here.
        unselectRoute()
        events?.sessionEvent("ended", null, null)
    }

    // Whether the event is the cancelled launch's, which the hub no longer follows; once that session is up, it is
    // ended with the stop asked.
    private fun cancelledLaunchEvent(event: String, device: TargetDevice?): Boolean {
        val launch = cancelled ?: return false
        if (device != null && device.id != launch.device.id) return false
        when (event) {
            "started", "resumed" -> launch.stopWhenUp?.let { stop ->
                launch.stopWhenUp = null
                endSession(stop)
            }
            "ended", "startFailed" -> cancelled = null
        }
        return true
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

        /** The selected route's volume step closest to [level]: MediaRouter counts in steps, 20 on a Chromecast. */
        fun routeStep(level: Double, max: Int) = (level.coerceIn(0.0, 1.0) * max).roundToInt()

        /** The step to ask a route for, or none on a route that reports no maximum: MediaRouter allows it. */
        fun volumeRequest(level: Double, max: Int): Int? = if (max > 0) routeStep(level, max) else null

        /** The app mutes the playing stream; another sender may have muted the device itself. */
        fun receiverMuted(device: Boolean, stream: Boolean?) = device || stream == true

        /**
         * The receiver's level, or none on a route MediaRouter marks fixed: a Google TV whose sound the TV sets
         * through HDMI-CEC reports 0 there, which is no level a sender can set.
         */
        fun reportedLevel(level: Double, muted: Boolean, volumeHandling: Int?): Pair<Double, Boolean>? =
            if (volumeHandling == MediaRouter.RouteInfo.PLAYBACK_VOLUME_FIXED) null else level to muted

        /** The route of the session's receiver, by its device id: on a switch the selected route is the next one. */
        fun <R> sessionRoute(sessionDeviceId: String?, routes: List<Pair<String?, R>>): R? =
            sessionDeviceId?.let { id -> routes.firstOrNull { it.first == id }?.second }

        @MainThread
        fun of(context: Context, cast: CastContext): GoogleCastTargetPort {
            val router = MediaRouter.getInstance(context.applicationContext)
            val sessions = cast.sessionManager
            var sessionListener: SessionManagerListener<CastSession>? = null
            var routerCallback: MediaRouter.Callback? = null
            var volumeRelay: ((Double, Boolean) -> Unit)? = null
            // The session's own setters are not used: after CastSession.setVolume or setMute the session no longer
            // follows the receiver, a level or a mute set elsewhere never reaches it (bench, 04/11). The level goes
            // through the route, as the Cast dialog's slider does; the app mutes the stream, as the route has no mute.
            // The SDK's own mute toggle, in its expanded controls, mutes the device instead (reference and bench, 05/11).
            // MediaRouter selects a switch's next route before the old session has ended: the level goes to the
            // route of the session's own receiver.
            fun sessionCastRoute(): MediaRouter.RouteInfo? {
                val selector = cast.mergedSelector ?: return null
                // A route with no maximum stays: a fixed one still has to hide its level.
                val routes = router.routes
                    .filter { it.matchesSelector(selector) }
                    .map { CastDevice.getFromBundle(it.extras)?.deviceId to it }
                return sessionRoute(sessions.currentCastSession?.castDevice?.deviceId, routes)
            }
            // The route is variable from the session's start on a Chromecast, and fixed for good on a Google TV that
            // leaves its sound to the TV (bench, 04/11).
            fun levelOf(session: CastSession) =
                reportedLevel(
                    session.volume,
                    receiverMuted(session.isMute, session.remoteMediaClient?.mediaStatus?.isMute),
                    sessionCastRoute()?.volumeHandling,
                )
            fun relayVolume() {
                sessions.currentCastSession?.let(::levelOf)?.let { (level, muted) -> volumeRelay?.invoke(level, muted) }
            }
            // The device's level and mute come through the session's Cast.Listener, the stream's mute through its
            // media client: one of each per session.
            val volumeListener = object : Cast.Listener() {
                override fun onVolumeChanged() = relayVolume()
            }
            val streamListener = object : RemoteMediaClient.Callback() {
                override fun onStatusUpdated() = relayVolume()
            }
            fun listenToVolume(session: CastSession) {
                session.removeCastListener(volumeListener)
                session.addCastListener(volumeListener)
                session.remoteMediaClient?.let {
                    it.unregisterCallback(streamListener)
                    it.registerCallback(streamListener)
                }
            }
            fun stopListeningToVolume(session: CastSession) {
                session.removeCastListener(volumeListener)
                session.remoteMediaClient?.unregisterCallback(streamListener)
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
                        sessionListener(report, ::endError, onUp = ::listenToVolume, onGone = ::stopListeningToVolume)
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
                sessionVolume = { sessions.currentCastSession?.let(::levelOf) },
                setSessionVolume = { level ->
                    val route = sessionCastRoute()
                    val step = route?.let { volumeRequest(level, it.volumeMax) }
                    if (step != null) route.requestSetVolume(step) else Log.w(TAG, "setVolume: no route with a volume for the session's receiver")
                },
                // Only a stream can be muted this way: without one loaded, the receiver plays nothing to mute.
                setSessionMuted = { muted ->
                    val client = sessions.currentCastSession?.remoteMediaClient?.takeIf { it.hasMediaSession() }
                    if (client != null) client.setStreamMute(muted) else Log.w(TAG, "setMute: no media playing to mute")
                },
                watchVolume = { relay ->
                    volumeRelay = relay
                    sessions.currentCastSession?.let { session ->
                        if (relay != null) listenToVolume(session) else stopListeningToVolume(session)
                    }
                },
                deviceMuted = { sessions.currentCastSession?.isMute == true },
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

            // A resume can come with another media client: the listeners go with the suspension and come back
            // with the resume.
            override fun onSessionSuspended(session: CastSession, reason: Int) {
                onGone(session)
                report("suspended", device(session.castDevice), null, null)
            }

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

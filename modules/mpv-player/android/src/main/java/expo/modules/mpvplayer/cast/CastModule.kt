package expo.modules.mpvplayer.cast

import android.content.Context
import android.content.Intent
import android.graphics.Rect
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.View
import com.google.android.gms.cast.MediaMetadata
import com.google.android.gms.cast.MediaSeekOptions
import com.google.android.gms.cast.MediaStatus
import com.google.android.gms.cast.framework.CastContext
import com.google.android.gms.cast.framework.CastReasonCodes
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
import expo.modules.mpvplayer.cast.output.LastHeardStatus
import expo.modules.mpvplayer.cast.output.OutputPickerPresenter
import expo.modules.mpvplayer.cast.output.OutputPickerStrings
import expo.modules.mpvplayer.cast.receiver.ReceiverProtocol
import expo.modules.mpvplayer.cast.target.RemoteTargetHub
import expo.modules.mpvplayer.cast.target.RemoteTargetListener
import expo.modules.mpvplayer.cast.target.RemoteTargetSnapshot
import expo.modules.mpvplayer.cast.target.RemoteTargets
import expo.modules.mpvplayer.cast.target.TargetDevice
import java.util.concurrent.TimeUnit

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
    private var cachedSession: Map<String, Any?>? = null
    // The target hub outlives the module, like the channel hub: it holds the port, discovery and the
    // target state, and the module relays what it publishes until OnDestroy lets go of the relay.
    private val remoteTargets = RemoteTargetHub.shared
    // JS asks for discovery; it runs only in the foreground, paused with the app and resumed with it.
    private val appDiscovery = AppDiscovery(
        start = { if (ensureContext() != null) remoteTargets.startDiscovery(RemoteTargetHub.APP_DISCOVERY) },
        stop = { remoteTargets.stopDiscovery(RemoteTargetHub.APP_DISCOVERY) },
    )
    private var removeTargetRelay: (() -> Unit)? = null
    private var mediaClient: RemoteMediaClient? = null
    // What the output sheet reads of the receiver through a suspension, which drops the media client.
    private val heardStatus = LastHeardStatus<MediaStatus>()
    // The hub holds the SDK registration of each namespace and outlives the module; the module only
    // keeps what JS asked to hear, so that a reload or a session end lets go of exactly that.
    private val hub = ReceiverChannelHub.shared
    private val jsSubscriptions = mutableMapOf<String, ReceiverSubscription>()

    private val stateListener = CastStateListener { state -> updateState(state) }

    // The hub calls on the main looper until release() lets go of the relay, which can be after OnDestroy.
    private val targetRelay = object : RemoteTargetListener {
        override fun targetChanged(snapshot: RemoteTargetSnapshot) {
            if (!destroyed) sendEvent("onRemoteTargetChanged", snapshot.toMap())
        }

        override fun devicesChanged(devices: List<TargetDevice>) {
            if (!destroyed) sendEvent("onDevicesChanged", mapOf("devices" to devices.map { it.toMap() }))
        }
    }

    private val mediaCallback = object : RemoteMediaClient.Callback() {
        override fun onStatusUpdated() {
            heardStatus.forget()
            sendEvent("onMediaStatusChanged", mapOf("status" to CastRecords.mediaStatus(mediaClient?.mediaStatus)))
            OutputPickerPresenter.refresh()
        }
    }

    private val sessionListener = object : SessionManagerListener<CastSession> {
        override fun onSessionStarting(session: CastSession) {
            heardStatus.forget()
            emitSession("starting", session, null)
        }

        override fun onSessionStarted(session: CastSession, sessionId: String) {
            attachMedia(session)
            updateSession(session)
            emitSession("started", session, null)
        }

        override fun onSessionStartFailed(session: CastSession, error: Int) =
            emitSession("startFailed", session, endError(error))

        override fun onSessionSuspended(session: CastSession, reason: Int) {
            // Before the client goes: the sheet keeps what the receiver plays until it reports again.
            heardStatus.hold(mediaClient?.mediaStatus)
            detachMedia()
            emitSession("suspended", session, null)
        }

        override fun onSessionResuming(session: CastSession, sessionId: String) = emitSession("resuming", session, null)

        override fun onSessionResumed(session: CastSession, wasSuspended: Boolean) {
            attachMedia(session)
            updateSession(session)
            emitSession("resumed", session, null)
        }

        override fun onSessionResumeFailed(session: CastSession, error: Int) {
            heardStatus.forget()
            emitSession("startFailed", session, endError(error))
        }

        override fun onSessionEnding(session: CastSession) = emitSession("ending", session, null)

        override fun onSessionEnded(session: CastSession, error: Int) {
            heardStatus.forget()
            detachMedia()
            // The JS side opens its channels again on the next session's first command.
            removeJsSubscriptions()
            updateSession(null)
            emitSession("ended", session, endError(error))
        }
    }

    override fun definition() = ModuleDefinition {
        Name("StreamyfinCast")

        Events(
            "onCastStateChanged",
            "onDevicesChanged",
            "onSessionEvent",
            "onMediaStatusChanged",
            "onReceiverMessage",
            "onRemoteTargetChanged",
            "onOutputPickerAction",
            "onOutputPickerDismissed",
        )

        OnCreate {
            // The output sheet outlives a JS reload like the hub; it reaches JS through the module in place.
            OutputPickerPresenter.receiverTitle = {
                heardStatus.read(mediaClient?.mediaStatus)?.let { status ->
                    CastMapping.playingTitle(status.playerState, status.mediaInfo?.metadata?.getString(MediaMetadata.KEY_TITLE))
                }
            }
            OutputPickerPresenter.receiverPlaying = {
                heardStatus.read(mediaClient?.mediaStatus)?.let { CastMapping.isPlaying(it.playerState) } == true
            }
            OutputPickerPresenter.receiverGoesOnHere = {
                heardStatus.read(mediaClient?.mediaStatus)?.mediaInfo?.let { media ->
                    val data = ReceiverProtocol.parseCustomData(media.customData)
                    CastMapping.goesOnHere(media.metadata?.mediaType, data.itemId, data.liveStreamId)
                } == true
            }
            OutputPickerPresenter.onDismissed = { if (!destroyed) sendEvent("onOutputPickerDismissed", emptyMap<String, Any?>()) }
            OutputPickerPresenter.currentActivity = { if (destroyed) null else appContext.currentActivity }
            // Installed from the sheet: the context the module could not start before starts now.
            OutputPickerPresenter.onPlayServicesAvailable = { if (!destroyed) ensureContext() }
        }

        OnStartObserving {
            mainHandler.post { ensureContext() }
        }

        // CastContext and MediaRouter outlive the module: after a JS reload the old instance
        // would keep feeding events to a dead app context.
        OnDestroy {
            destroyed = true
            mainHandler.removeCallbacksAndMessages(null)
            mainHandler.post {
                OutputPickerPresenter.dismiss()
                release()
            }
        }

        // An active scan costs battery; the SDK's own button paused it while off screen.
        OnActivityEntersBackground {
            mainHandler.post { appDiscovery.background() }
        }

        OnActivityEntersForeground {
            mainHandler.post { appDiscovery.foreground() }
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

        Function("getDevices") { remoteTargets.devices.map { it.toMap() } }

        AsyncFunction("startDiscovery") {
            appDiscovery.want()
            Unit
        }.runOnQueue(Queues.MAIN)

        AsyncFunction("stopDiscovery") {
            appDiscovery.release()
            Unit
        }.runOnQueue(Queues.MAIN)

        Function("getRemoteTarget") {
            if (castContext == null) mainHandler.post { ensureContext() }
            remoteTargets.snapshot.toMap()
        }

        // False when discovery does not know the device; the state then follows the session events.
        AsyncFunction("connectToDevice") { deviceId: String ->
            ensureContext() != null && remoteTargets.connect(deviceId)
        }.runOnQueue(Queues.MAIN)

        AsyncFunction("disconnect") { stopPlayback: Boolean ->
            if (ensureContext() != null) remoteTargets.disconnect(stopPlayback)
            Unit
        }.runOnQueue(Queues.MAIN)

        // Only for a connected receiver; the state follows what the SDK reports back.
        AsyncFunction("setTargetVolume") { level: Double ->
            if (ensureContext() != null) remoteTargets.setVolume(level)
            Unit
        }.runOnQueue(Queues.MAIN)

        AsyncFunction("setTargetMuted") { muted: Boolean ->
            if (ensureContext() != null) remoteTargets.setMuted(muted)
            Unit
        }.runOnQueue(Queues.MAIN)

        Function("getCurrentSession") {
            if (castContext == null) mainHandler.post { ensureContext() }
            cachedSession
        }

        // The output sheet (Cast receivers, this device): true once on screen, false where it cannot show.
        AsyncFunction("presentOutputPicker") { options: Map<String, Any?> ->
            if (destroyed) return@AsyncFunction false
            val activity = appContext.currentActivity ?: return@AsyncFunction false
            // Not gated on the Cast context: without Play Services the sheet says so and offers the fix.
            ensureContext()
            @Suppress("UNCHECKED_CAST")
            val strings = (options["strings"] as? Map<String, Any?>).orEmpty().mapNotNull { (key, value) -> (value as? String)?.let { key to it } }
            OutputPickerPresenter.strings = OutputPickerStrings(strings.toMap())
            // The button's own view, which the popover follows across a rotation; its frame is the fallback.
            val anchorView = (options["anchorTag"] as? Number)?.let { tag -> appContext.findView<View>(tag.toInt()) }
            OutputPickerPresenter.present(
                activity,
                anchorRect(options["anchor"], activity),
                options["playingHere"] as? String,
                anchorView,
                // JS leaves this device out (a SyncPlay member): it only stops the receiver then.
                onPlayHere =
                    if (options["playHere"] == false) {
                        null
                    } else {
                        { if (!destroyed) sendEvent("onOutputPickerAction", mapOf("action" to "playHere")) }
                    },
            ) {
                if (!destroyed) sendEvent("onOutputPickerAction", mapOf("action" to "remote"))
            }
        }.runOnQueue(Queues.MAIN)

        AsyncFunction("dismissOutputPicker") {
            OutputPickerPresenter.dismiss()
        }.runOnQueue(Queues.MAIN)

        AsyncFunction("showExpandedControls") {
            if (ensureContext() == null) return@AsyncFunction false
            val intent = Intent(context, CastExpandedControllerActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(intent)
            true
        }.runOnQueue(Queues.MAIN)

        // The hub registers the namespace on every session it is given, a resume included, so the
        // relay hears the receiver from the next session on as well.
        AsyncFunction("addChannel") { namespace: String ->
            if (ensureContext() == null) return@AsyncFunction mapOf("namespace" to namespace, "connected" to false)
            if (namespace !in jsSubscriptions) jsSubscriptions[namespace] = hub.subscribe(namespace, jsRelay(namespace))
            mapOf("namespace" to namespace, "connected" to hub.isReady(namespace))
        }.runOnQueue(Queues.MAIN)

        AsyncFunction("removeChannel") { namespace: String ->
            // Only JS stops hearing: the engine may still listen on the same registration.
            jsSubscriptions.remove(namespace)?.remove()
            Unit
        }.runOnQueue(Queues.MAIN)

        AsyncFunction("sendMessage") { namespace: String, message: String, promise: Promise ->
            if (currentSession() == null) {
                promise.reject("ERR_CAST_NO_SESSION", ReceiverChannelHub.NO_SESSION_ERROR, null)
                return@AsyncFunction
            }
            hub.send(namespace, message) { error ->
                if (error == null) promise.resolve(null) else promise.reject("ERR_CAST_SEND", error, null)
            }
        }.runOnQueue(Queues.MAIN)

        // Each transport call names the session JS meant it for: the current one may have
        // changed between the JS check and this main-queue run.
        AsyncFunction("getMediaStatus") { sessionId: String? ->
            mediaStatusRecord(ownSession(sessionId)?.remoteMediaClient)
        }.runOnQueue(Queues.MAIN)

        // The status held is the receiver's last report, which comes on events only: this asks the receiver, whose
        // answer says where it is. The record comes with the answer, or as it stands once timeoutMs pass.
        AsyncFunction("requestMediaStatus") { sessionId: String, timeoutMs: Double, promise: Promise ->
            val client = ownSession(sessionId)?.remoteMediaClient
            if (client == null) {
                promise.resolve(null)
                return@AsyncFunction
            }
            client.requestStatus().setResultCallback(
                { promise.resolve(mediaStatusRecord(client)) },
                timeoutMs.toLong(),
                TimeUnit.MILLISECONDS,
            )
        }.runOnQueue(Queues.MAIN)

        AsyncFunction("play") { sessionId: String? -> ownSession(sessionId)?.remoteMediaClient?.play(); Unit }.runOnQueue(Queues.MAIN)
        AsyncFunction("pause") { sessionId: String? -> ownSession(sessionId)?.remoteMediaClient?.pause(); Unit }.runOnQueue(Queues.MAIN)
        AsyncFunction("stop") { sessionId: String? -> ownSession(sessionId)?.remoteMediaClient?.stop(); Unit }.runOnQueue(Queues.MAIN)
        AsyncFunction("seek") { positionSeconds: Double, sessionId: String? ->
            val options = MediaSeekOptions.Builder().setPosition((positionSeconds * 1000).toLong()).build()
            ownSession(sessionId)?.remoteMediaClient?.seek(options)
            Unit
        }.runOnQueue(Queues.MAIN)
    }

    // A status holds the position of its report: the record also says where the receiver is now, as the SDK
    // estimates it from that report and the time since.
    private fun mediaStatusRecord(client: RemoteMediaClient?): Map<String, Any?>? =
        CastRecords.mediaStatus(client?.mediaStatus)?.let { record ->
            record + ("approximateStreamPosition" to client?.approximateStreamPosition?.div(1000.0))
        }

    // The button's frame in window dp, as JS measures it, to the window pixels the popover is placed in.
    private fun anchorRect(anchor: Any?, activity: android.app.Activity): Rect? {
        val frame = anchor as? Map<*, *> ?: return null
        val density = activity.resources.displayMetrics.density
        fun px(key: String): Int? {
            val dp = (frame[key] as? Number)?.toDouble() ?: return null
            return (dp * density).toInt()
        }
        val left = px("x") ?: return null
        val top = px("y") ?: return null
        val width = px("width") ?: return null
        val height = px("height") ?: return null
        return Rect(left, top, left + width, top + height)
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
        // Before the module's own listener and before a present session is announced: whatever JS
        // sends on hearing of a session finds the hub attached to it.
        GoogleCastChannelBinding.install(cast.sessionManager)
        // Relayed before the port is installed: a session the port finds running reaches JS as connected.
        if (removeTargetRelay == null) removeTargetRelay = remoteTargets.addListener(targetRelay)
        RemoteTargets.installDefault(reactContext, cast)
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

    private fun ownSession(sessionId: String?): CastSession? {
        val session = currentSession() ?: return null
        return if (sessionId == null || session.sessionId == sessionId) session else null
    }

    private fun updateState(state: Int) {
        val name = CastMapping.castStateName(state) ?: return
        if (name == cachedState) return
        cachedState = name
        sendEvent("onCastStateChanged", mapOf("state" to name))
    }

    private fun updateSession(session: CastSession?) {
        cachedSession = CastRecords.session(session)
    }

    // The SDK reports "Stop casting" under a status code of its own (2154 on 22.3.1), which only
    // the context resolves to CASTING_STOPPED, as react-native-google-cast read it.
    private fun endError(error: Int): String? = CastMapping.sessionEndError(
        error,
        castContext?.getCastReasonCodeForCastStatusCode(error) ?: CastReasonCodes.UNKNOWN_REASON,
    )

    private fun emitSession(event: String, session: CastSession, error: String?) {
        val payload = mapOf("event" to event, "sessionId" to session.sessionId, "error" to error)
        // A disconnect without stop ends without an error too, and may leave the TV playing: the stop reporter
        // checks the receiver for it instead of taking the end for a closed receiver.
        val withoutStop = event == "ended" && remoteTargets.disconnectedWithoutStop
        sendEvent("onSessionEvent", if (withoutStop) payload + ("withoutStop" to true) else payload)
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
        appDiscovery.release()
        removeTargetRelay?.invoke()
        removeTargetRelay = null
        detachMedia()
        // The relays hold this instance and the hub outlives it: a live session would keep calling them.
        removeJsSubscriptions()
        castContext?.let { cast ->
            cast.removeCastStateListener(stateListener)
            cast.sessionManager.removeSessionManagerListener(sessionListener, CastSession::class.java)
        }
        castContext = null
    }

    private fun jsRelay(namespace: String) = object : ReceiverBusListener {
        override fun onMessage(raw: String) {
            sendEvent("onReceiverMessage", mapOf("namespace" to namespace, "message" to raw))
        }
    }

    private fun removeJsSubscriptions() {
        jsSubscriptions.values.forEach { it.remove() }
        jsSubscriptions.clear()
    }

    private companion object {
        const val TAG = "StreamyfinCast"
    }
}

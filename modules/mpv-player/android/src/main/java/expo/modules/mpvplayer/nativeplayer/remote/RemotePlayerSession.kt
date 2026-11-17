package expo.modules.mpvplayer.nativeplayer.remote

import android.app.Activity
import android.content.Context
import android.os.Handler
import android.os.Looper
import android.view.KeyEvent
import android.view.ViewGroup
import android.widget.FrameLayout
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.ComposeView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.ViewModelStoreOwner
import androidx.lifecycle.setViewTreeLifecycleOwner
import androidx.lifecycle.setViewTreeViewModelStoreOwner
import androidx.savedstate.SavedStateRegistryOwner
import androidx.savedstate.setViewTreeSavedStateRegistryOwner
import expo.modules.mpvplayer.cast.output.OutputPickerPresenter
import expo.modules.mpvplayer.cast.playback.RemotePlayback
import expo.modules.mpvplayer.cast.playback.RemotePlaybackSnapshot
import expo.modules.mpvplayer.cast.target.RemoteTargetHub
import expo.modules.mpvplayer.nativeplayer.AccessibilityIsolation
import expo.modules.mpvplayer.nativeplayer.NoRemoteEngineException
import expo.modules.mpvplayer.nativeplayer.PlayerViewModel
import expo.modules.mpvplayer.nativeplayer.PresentedPlayer
import expo.modules.mpvplayer.nativeplayer.RemotePlayerConfigRecord
import expo.modules.mpvplayer.nativeplayer.RemotePlayerFailureRecord
import expo.modules.mpvplayer.nativeplayer.RemoteTintRecord
import expo.modules.mpvplayer.nativeplayer.ui.PlayerTheme
import expo.modules.mpvplayer.nativeplayer.ui.remote.RemotePlayerScreen

/**
 * The native chrome over a remote engine, with no surface: a remote control for what the TV plays. It leaves
 * the window alone (system bars shown, the phone sleeps and turns as usual), and holds no media session, no
 * volume or brightness control and no picture in picture. It borrows the engine of the holder, which stays its
 * delegate and relays its calls; closing it hands the engine back and sends nothing to the TV. The state the
 * holder publishes decides what the screen shows and when it closes (RemoteScreenModel). Every event it emits
 * is marked remote.
 */
class RemotePlayerSession(
    private val playback: RemotePlayback = RemotePlayback.shared,
    private val emit: (String, Map<String, Any?>) -> Unit,
    private val onTornDown: () -> Unit,
    /** What the screen draws; the session's tests draw nothing, Robolectric cannot idle an endless spinner. */
    private val screenContent: @Composable (PlayerViewModel, RemoteScreenState) -> Unit = { model, screen ->
        RemotePlayerScreen(model, screen)
    },
    /** The Cast session the TV button reports to TalkBack; the tests give their own. */
    private val hub: RemoteTargetHub = RemoteTargetHub.shared,
) : PresentedPlayer {
    override val viewModel = PlayerViewModel()
    override val acceptsJsTransport = false

    private var host: Activity? = null
    private var screen: ViewGroup? = null
    private var backCallback: OnBackPressedCallback? = null
    private var lifecycleObserver: LifecycleEventObserver? = null
    private val accessibility = AccessibilityIsolation()
    private var closed = false
    private var unfollowPlayback: (() -> Unit)? = null

    /** What the screen draws besides the view model; null until presented. */
    var screenState: RemoteScreenState? = null
        private set

    init {
        viewModel.emit = { name, body -> emit(name, markRemote(body)) }
        viewModel.onDismissRequested = { reason -> dismiss(reason) }
    }

    fun present(activity: Activity, config: RemotePlayerConfigRecord) {
        val engine = playback.engine ?: throw NoRemoteEngineException()
        // Opened from the app's Cast sheet: the sheet goes first, as for the local player.
        OutputPickerPresenter.dismissForPlayer()
        host = activity
        viewModel.engine = engine
        viewModel.applyCapabilities(pictureInPictureSupported = false, allowCast = false)
        viewModel.apply(config.toPresentConfig())
        // The TV button says the session's state to TalkBack; willTeardown stops following it.
        viewModel.followCast(hub)

        val model = RemoteScreenState(config.targetName, config.imageHeaders, config.tint, viewModel, ::playHere)
        // The screen composes as it is attached: it starts from the TV's state rather than from nothing, which a
        // later frame would have to correct (the controls of a reconnecting TV said enabled until then).
        model.snapshot = playback.snapshot
        screenState = model
        val content = ComposeView(activity).apply {
            (activity as? LifecycleOwner)?.let { setViewTreeLifecycleOwner(it) }
            (activity as? ViewModelStoreOwner)?.let { setViewTreeViewModelStoreOwner(it) }
            (activity as? SavedStateRegistryOwner)?.let { setViewTreeSavedStateRegistryOwner(it) }
            setContent { PlayerTheme { screenContent(viewModel, model) } }
        }
        val view = BackKeyFrame(activity) { dismiss("closeButton") }.apply {
            layoutParams = ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
            addView(content, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
        }
        accessibility.hideAppOf(activity)
        activity.addContentView(view, view.layoutParams)
        view.requestFocus()
        screen = view

        // A back that reaches the dispatcher (JS declined it, or predictive back) closes the screen too.
        (activity as? ComponentActivity)?.let { owner ->
            backCallback = object : OnBackPressedCallback(true) {
                override fun handleOnBackPressed() = dismiss("closeButton")
            }.also { owner.onBackPressedDispatcher.addCallback(it) }
        }
        // A view added over the activity stays on it when the system recreates it (font or display size):
        // shown nowhere, the screen closes with its activity.
        (activity as? LifecycleOwner)?.lifecycle?.let { lifecycle ->
            lifecycleObserver = LifecycleEventObserver { _, event ->
                if (event == Lifecycle.Event.ON_DESTROY) dismiss("programmatic")
            }.also { lifecycle.addObserver(it) }
        }

        // After apply(), which starts the view model at the config's position: the screen opens on the TV's. The
        // holder started the engine with the session and stays its delegate.
        playback.attachScreen(viewModel)
        unfollowPlayback = playback.addListener(::follow)
        follow(playback.snapshot)
    }

    // The holder publishes on the main thread. A failure goes once the TV loads or plays again. The film over with
    // nothing after it, or the connection over: the screen closes, an end of playback reported first as the local
    // player does.
    private fun follow(snapshot: RemotePlaybackSnapshot) {
        val state = screenState ?: return
        if (closed) return
        val clears = RemoteScreenModel.failureClears(state.snapshot.phase, snapshot.phase)
        state.snapshot = snapshot
        if (clears) clearFailure()
        val close = state.model.closes ?: return
        if (close == RemoteClose.PLAYBACK_ENDED) {
            emit("onPlaybackEnded", markRemote(mapOf("positionSec" to viewModel.authoritativePosition)))
        }
        dismiss(close.reason)
    }

    /** The tint JS sends once it knows the artwork's color; the screen fades to it. */
    fun updateTint(tint: RemoteTintRecord?) = onMain { screenState?.updateTint(tint) }

    /**
     * A new config for the open screen, in place: another item sent, the TV's name, the tracks, the tint. The whole
     * config is replaced and the failure goes; the screen stays on where the TV is. False when none is open. On the
     * main thread, as the module calls it.
     */
    fun update(config: RemotePlayerConfigRecord): Boolean {
        val state = screenState ?: return false
        if (closed) return false
        viewModel.apply(config.toPresentConfig())
        state.replace(config.targetName, config.imageHeaders, config.tint)
        clearFailure()
        // apply() starts the view model at the config's position: the TV's state again, as present() does.
        playback.attachScreen(viewModel)
        return true
    }

    /** What JS says of a send that failed, shown with Play here when it offers it; null takes it away. */
    fun showFailure(failure: RemotePlayerFailureRecord?) = onMain {
        val state = screenState ?: return@onMain
        if (failure == null) clearFailure() else state.failure = RemoteFailure(failure.message, failure.canPlayHere)
    }

    // Play here: JS plays on the phone from the TV's position, and closes this screen first.
    private fun playHere() {
        if (closed) return
        emit("onPlayHereRequested", markRemote(mapOf("positionSec" to viewModel.authoritativePosition)))
    }

    // Both failures go: the one JS said, and the engine's own error.
    private fun clearFailure() {
        screenState?.failure = null
        viewModel.errorMessage = null
    }

    override fun dismiss(reason: String, completion: (() -> Unit)?) {
        if (closed) {
            completion?.invoke()
            return
        }
        closed = true
        onMain {
            viewModel.willTeardown()
            emit("onDismiss", markRemote(mapOf(
                "positionSec" to viewModel.authoritativePosition,
                "durationSec" to viewModel.duration,
                "reason" to reason,
            )))
            detach()
            completion?.invoke()
        }
    }

    override fun teardownImmediately() {
        if (closed) return
        closed = true
        onMain {
            viewModel.willTeardown()
            detach()
        }
    }

    // Detaches from the engine and hands it back to the holder: never stop(), which the holder decides.
    private fun detach() {
        backCallback?.remove()
        backCallback = null
        lifecycleObserver?.let { observer -> (host as? LifecycleOwner)?.lifecycle?.removeObserver(observer) }
        lifecycleObserver = null
        screen?.let { (it.parent as? ViewGroup)?.removeView(it) }
        screen = null
        accessibility.restore()
        unfollowPlayback?.invoke()
        unfollowPlayback = null
        playback.detachScreen(viewModel)
        viewModel.engine = null
        host = null
        onTornDown()
    }

    private fun onMain(block: () -> Unit) {
        if (Looper.myLooper() == Looper.getMainLooper()) block() else Handler(Looper.getMainLooper()).post(block)
    }
}

/**
 * The screen's root. The app turns predictive back off, so a back key goes to React Native's onBackPressed, and
 * JS, before any dispatcher callback, and JS pops its own page under the screen when it has one. Holding the
 * focus puts this frame on the key's path first: it takes the key and closes the screen.
 */
private class BackKeyFrame(context: Context, private val onBack: () -> Unit) : FrameLayout(context) {
    init {
        isFocusable = true
        isFocusableInTouchMode = true
    }

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        if (event.keyCode != KeyEvent.KEYCODE_BACK) return super.dispatchKeyEvent(event)
        if (event.action == KeyEvent.ACTION_UP && !event.isCanceled) onBack()
        return true
    }
}

/**
 * What the remote screen draws besides the view model: the TV's name, the headers for the images it loads, its
 * colors, which start from the config's tint and follow each one JS sends, and what the TV does.
 */
class RemoteScreenState(
    targetName: String?,
    imageHeaders: Map<String, String>?,
    tint: RemoteTintRecord?,
    private val viewModel: PlayerViewModel,
    private val onPlayHere: () -> Unit = {},
) {
    var targetName by mutableStateOf(targetName)
        private set

    var imageHeaders by mutableStateOf(imageHeaders)
        private set

    var colors by mutableStateOf(colorsOf(tint))
        private set

    /** What JS said of a send that failed; the engine's own error shows when there is none. */
    var failure by mutableStateOf<RemoteFailure?>(null)
        internal set

    /** What the TV does, as the holder last published it. */
    var snapshot by mutableStateOf(RemotePlaybackSnapshot.NONE)
        internal set

    /**
     * What the screen shows of the TV. Read in composition, it follows the snapshot, the next episode and the
     * engine's error. The reduced player (media our server does not know) comes with the foreign media.
     */
    val model: RemoteScreenModel
        get() = RemoteScreenModel.of(
            snapshot,
            targetName,
            hasNext = viewModel.nextEpisode != null,
            reduced = false,
            failure = failure?.message ?: viewModel.errorMessage,
            canPlayHere = failure?.canPlayHere == true,
        )

    fun updateTint(tint: RemoteTintRecord?) {
        colors = colorsOf(tint)
    }

    /** The parts of a new config the screen draws itself. */
    fun replace(targetName: String?, imageHeaders: Map<String, String>?, tint: RemoteTintRecord?) {
        this.targetName = targetName
        this.imageHeaders = imageHeaders
        colors = colorsOf(tint)
    }

    /** The screen's Play here button. */
    fun playHere() = onPlayHere()

    private fun colorsOf(tint: RemoteTintRecord?) = RemoteColors.of(tint?.top, tint?.bottom, tint?.accent)
}

/** A failed send as the remote screen says it. */
data class RemoteFailure(val message: String, val canPlayHere: Boolean)

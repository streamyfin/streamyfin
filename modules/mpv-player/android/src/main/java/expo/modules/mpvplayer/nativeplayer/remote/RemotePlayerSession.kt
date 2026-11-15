package expo.modules.mpvplayer.nativeplayer.remote

import android.app.Activity
import android.os.Handler
import android.os.Looper
import android.view.ViewGroup
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.compose.runtime.Composable
import androidx.compose.ui.platform.ComposeView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.ViewModelStoreOwner
import androidx.lifecycle.setViewTreeLifecycleOwner
import androidx.lifecycle.setViewTreeViewModelStoreOwner
import androidx.savedstate.SavedStateRegistryOwner
import androidx.savedstate.setViewTreeSavedStateRegistryOwner
import expo.modules.mpvplayer.nativeplayer.AccessibilityIsolation
import expo.modules.mpvplayer.nativeplayer.PlayerViewModel
import expo.modules.mpvplayer.nativeplayer.PresentedPlayer
import expo.modules.mpvplayer.nativeplayer.RemotePlayerConfigRecord
import expo.modules.mpvplayer.nativeplayer.engine.PlayerEngine
import expo.modules.mpvplayer.nativeplayer.ui.PlayerTheme
import expo.modules.mpvplayer.nativeplayer.ui.remote.RemotePlayerScreen

/**
 * The native chrome over a remote engine, with no surface: a remote control for what the TV plays. It leaves
 * the window alone (system bars shown, the phone sleeps and turns as usual), and holds no media session, no
 * volume or brightness control and no picture in picture. Closing it hands the engine back through its lease
 * and sends nothing to the TV. Every event it emits is marked remote.
 */
class RemotePlayerSession(
    private val lease: RemoteEngineLease,
    private val emit: (String, Map<String, Any?>) -> Unit,
    private val onTornDown: () -> Unit,
    /** What the screen draws; the session's tests draw nothing, Robolectric cannot idle an endless spinner. */
    private val screenContent: @Composable (PlayerViewModel, String?) -> Unit = { model, target ->
        RemotePlayerScreen(model, target)
    },
) : PresentedPlayer {
    override val viewModel = PlayerViewModel()
    override val acceptsJsTransport = false

    private var host: Activity? = null
    private var screen: ComposeView? = null
    private var backCallback: OnBackPressedCallback? = null
    private var lifecycleObserver: LifecycleEventObserver? = null
    private val accessibility = AccessibilityIsolation()
    private var closed = false

    init {
        viewModel.emit = { name, body -> emit(name, markRemote(body)) }
        viewModel.onDismissRequested = { reason -> dismiss(reason) }
    }

    fun present(activity: Activity, config: RemotePlayerConfigRecord) {
        host = activity
        val engine = lease.engine
        engine.delegate = viewModel
        viewModel.engine = engine
        viewModel.applyCapabilities(pictureInPictureSupported = false, allowCast = false)
        viewModel.apply(config.toPresentConfig())

        val targetName = config.targetName
        val view = ComposeView(activity).apply {
            layoutParams = ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
            (activity as? LifecycleOwner)?.let { setViewTreeLifecycleOwner(it) }
            (activity as? ViewModelStoreOwner)?.let { setViewTreeViewModelStoreOwner(it) }
            (activity as? SavedStateRegistryOwner)?.let { setViewTreeSavedStateRegistryOwner(it) }
            setContent { PlayerTheme { screenContent(viewModel, targetName) } }
        }
        accessibility.hideAppOf(activity)
        activity.addContentView(view, view.layoutParams)
        screen = view

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

        // Starting a bound engine again does nothing: the TV keeps playing what it plays.
        engine.start(PlayerEngine.Owner.NATIVE_SESSION) {}
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

    // Detaches from the engine and hands it back: never stop(), which the lease's owner decides.
    private fun detach() {
        backCallback?.remove()
        backCallback = null
        lifecycleObserver?.let { observer -> (host as? LifecycleOwner)?.lifecycle?.removeObserver(observer) }
        lifecycleObserver = null
        screen?.let { (it.parent as? ViewGroup)?.removeView(it) }
        screen = null
        accessibility.restore()
        if (lease.engine.delegate === viewModel) lease.engine.delegate = null
        viewModel.engine = null
        host = null
        lease.release()
        onTornDown()
    }

    private fun onMain(block: () -> Unit) {
        if (Looper.myLooper() == Looper.getMainLooper()) block() else Handler(Looper.getMainLooper()).post(block)
    }
}

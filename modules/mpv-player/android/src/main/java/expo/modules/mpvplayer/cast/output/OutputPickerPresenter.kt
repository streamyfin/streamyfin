package expo.modules.mpvplayer.cast.output

import android.app.Activity
import android.graphics.Rect
import android.util.Log
import android.view.View
import android.view.ViewGroup
import android.view.ViewTreeObserver
import androidx.annotation.MainThread
import androidx.annotation.VisibleForTesting
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.platform.ComposeView
import androidx.compose.ui.unit.IntRect
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.ViewModelStoreOwner
import androidx.lifecycle.setViewTreeLifecycleOwner
import androidx.lifecycle.setViewTreeViewModelStoreOwner
import androidx.savedstate.SavedStateRegistryOwner
import androidx.savedstate.setViewTreeSavedStateRegistryOwner
import com.google.android.gms.common.ConnectionResult
import com.google.android.gms.common.GoogleApiAvailability
import expo.modules.mpvplayer.DeviceKind
import expo.modules.mpvplayer.cast.engine.mainLooperSchedule
import expo.modules.mpvplayer.cast.target.RemoteTargetConstants
import expo.modules.mpvplayer.cast.target.RemoteTargetHub
import expo.modules.mpvplayer.cast.target.RemoteTargetListener
import expo.modules.mpvplayer.cast.target.RemoteTargetSnapshot
import expo.modules.mpvplayer.cast.target.TargetDevice
import expo.modules.mpvplayer.nativeplayer.ui.PlayerTheme

/**
 * Presents the output sheet over the current activity, as the native chrome is presented, so it shows
 * above React Native and above the native players alike. One sheet at a time; its controller lives here
 * for as long as the sheet does, across rotations. Main thread only.
 */
object OutputPickerPresenter {
    private const val TAG = "OutputPickerPresenter"

    private var host: ComposeView? = null
    private var controller: OutputSheetController? = null
    private var onRemote: (() -> Unit)? = null
    private var onHandOff: (() -> Unit)? = null
    private var hostLifecycle: Lifecycle? = null
    // Where the popover points, in the window's pixels; the host reads it, so a new value moves the popover.
    private val anchorBounds = mutableStateOf<IntRect?>(null)
    private var anchorView: View? = null
    private var removeTargetWatch: (() -> Unit)? = null

    // A session that ends or starts changes what the receiver plays before any media status says so.
    private val targetWatcher =
        object : RemoteTargetListener {
            override fun targetChanged(snapshot: RemoteTargetSnapshot) = refresh()

            override fun devicesChanged(devices: List<TargetDevice>) = Unit
        }

    // A rotation lays the screen out again and moves the button: the popover goes with it.
    private val anchorWatcher =
        ViewTreeObserver.OnGlobalLayoutListener {
            anchorView?.let(::windowBounds)?.let { bounds -> if (bounds != anchorBounds.value) anchorBounds.value = bounds }
        }

    private val hostWatcher =
        LifecycleEventObserver { source, event ->
            when (event) {
                // The system recreates the activity on a change the manifest leaves to it, a font size among them,
                // and the sheet's view goes with the old one: the sheet closes, instead of staying presented nowhere.
                Lifecycle.Event.ON_DESTROY -> dismiss()
                // Out of sight, the sheet stops scanning, as the app's own discovery does.
                Lifecycle.Event.ON_STOP -> controller?.pauseDiscovery()
                Lifecycle.Event.ON_START -> controller?.resumeDiscovery()
                // Back from the Play Store, the services may be there now.
                Lifecycle.Event.ON_RESUME ->
                    (source as? Activity)?.let { activity ->
                        controller?.let { sheet ->
                            val status = playServicesStatus(activity)
                            // Installed from the sheet, the services start no Cast context on their own.
                            val cameBack = status == PlayServicesStatus.AVAILABLE && sheet.environment.playServices != status
                            sheet.environment = sheet.environment.copy(playServices = status)
                            if (cameBack) onPlayServicesAvailable()
                        }
                    }
                else -> Unit
            }
        }

    /** The texts JS sent last; English when the sheet opens from native. */
    var strings = OutputPickerStrings()

    /** What the receiver plays, from the media status the module follows. */
    var receiverTitle: () -> String? = { null }

    /** Whether something plays on the receiver, with a title or without. */
    var receiverPlaying: () -> Boolean = { false }

    /** Called once the sheet is gone, whichever way it went. */
    var onDismissed: (() -> Unit)? = null

    /** Called when the services come back with the sheet open, for the module to start its Cast context. */
    var onPlayServicesAvailable: () -> Unit = {}

    /** The activity the module runs in, for the debug probe, which has none of its own. */
    var currentActivity: () -> Activity? = { null }

    val isPresented: Boolean
        get() = host != null

    @VisibleForTesting
    internal val presentedController: OutputSheetController?
        get() = controller

    @VisibleForTesting
    internal val presentedAnchor: IntRect?
        get() = anchorBounds.value

    // Play Services' own check and dialog, which Robolectric has neither of.
    @VisibleForTesting
    internal val defaultCheckPlayServices: (Activity) -> Int = { GoogleApiAvailability.getInstance().isGooglePlayServicesAvailable(it) }

    @VisibleForTesting
    internal var checkPlayServices = defaultCheckPlayServices

    @VisibleForTesting
    internal val defaultResolvePlayServices: (Activity) -> Unit = { GoogleApiAvailability.getInstance().makeGooglePlayServicesAvailable(it) }

    @VisibleForTesting
    internal var resolvePlayServices = defaultResolvePlayServices

    /**
     * False on a TV, which has no sheet; true once presented, or already there. [handOff] is the player's: a receiver
     * connected from the sheet, or its panel's "Play on", closes the sheet and then calls [onHandOff].
     */
    @MainThread
    fun present(
        activity: Activity,
        anchor: Rect?,
        playingHere: String?,
        anchorView: View? = null,
        handOff: Boolean = false,
        onHandOff: (() -> Unit)? = null,
        onRemote: () -> Unit,
    ): Boolean {
        if (DeviceKind.isTelevision(activity)) return false
        this.onRemote = onRemote
        this.onHandOff = onHandOff
        controller?.let { sheet ->
            sheet.environment =
                sheet.environment.copy(
                    playingHere = playingHere,
                    receiverTitle = receiverTitle(),
                    receiverPlaying = receiverPlaying(),
                    handOff = handOff,
                )
            return true
        }
        val sheet = OutputSheetController(RemoteTargetHub.shared, mainLooperSchedule())
        sheet.environment =
            OutputSheetEnvironment(
                playServices = playServicesStatus(activity),
                thisDevice = thisDevice(activity),
                playingHere = playingHere,
                receiverTitle = receiverTitle(),
                receiverPlaying = receiverPlaying(),
                handOff = handOff,
            )
        sheet.onOutput = { output -> handle(activity, output) }
        anchorBounds.value = anchorView?.let(::windowBounds) ?: anchor?.let { IntRect(it.left, it.top, it.right, it.bottom) }
        anchorView?.takeIf { anchorBounds.value != null }?.let { button ->
            this.anchorView = button
            button.viewTreeObserver.addOnGlobalLayoutListener(anchorWatcher)
        }
        val view =
            ComposeView(activity).apply {
                // Compose needs the activity's owners on a view React Native's activity did not create.
                (activity as? LifecycleOwner)?.let { setViewTreeLifecycleOwner(it) }
                (activity as? ViewModelStoreOwner)?.let { setViewTreeViewModelStoreOwner(it) }
                (activity as? SavedStateRegistryOwner)?.let { setViewTreeSavedStateRegistryOwner(it) }
                setContent { PlayerTheme { OutputSheetHost(sheet, strings, anchorBounds.value, onDismiss = ::dismiss) } }
            }
        activity.addContentView(view, ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        host = view
        controller = sheet
        hostLifecycle = (activity as? LifecycleOwner)?.lifecycle?.also { it.addObserver(hostWatcher) }
        removeTargetWatch = RemoteTargetHub.shared.addListener(targetWatcher)
        sheet.open()
        return true
    }

    @MainThread
    fun dismiss() {
        val view = host ?: return
        host = null
        hostLifecycle?.removeObserver(hostWatcher)
        hostLifecycle = null
        removeTargetWatch?.invoke()
        removeTargetWatch = null
        controller?.close()
        controller = null
        onRemote = null
        onHandOff = null
        anchorView?.viewTreeObserver?.removeOnGlobalLayoutListener(anchorWatcher)
        anchorView = null
        anchorBounds.value = null
        (view.parent as? ViewGroup)?.removeView(view)
        onDismissed?.invoke()
    }

    /** The receiver started or changed what it plays: the panel's remote row follows. */
    @MainThread
    fun refresh() {
        controller?.let { sheet ->
            sheet.environment = sheet.environment.copy(receiverTitle = receiverTitle(), receiverPlaying = receiverPlaying())
        }
    }

    /** The debug probe's sheet, for its screenshots: over whatever the app shows, and never in place of the app's. */
    @MainThread
    fun presentForProbe(): Boolean {
        if (isPresented) return true
        val activity = currentActivity() ?: return false
        return present(activity, anchor = null, playingHere = null) {}
    }

    private fun handle(activity: Activity, output: OutputSheetOutput) {
        when (output) {
            // Once the sheet is gone, as on iOS: the remote opens over the screen.
            OutputSheetOutput.REMOTE -> {
                val remote = onRemote
                dismiss()
                remote?.invoke()
            }
            // The same way: the player hands its video off once the sheet is gone.
            OutputSheetOutput.HAND_OFF -> {
                val handOff = onHandOff
                dismiss()
                handOff?.invoke()
            }
            OutputSheetOutput.DISMISS -> dismiss()
            // Its first step is the check below, which can throw the same way.
            OutputSheetOutput.RESOLVE_PLAY_SERVICES ->
                try {
                    resolvePlayServices(activity)
                } catch (error: Exception) {
                    Log.w(TAG, "Play Services resolution failed", error)
                }
            // AirPlay is iOS only.
            OutputSheetOutput.OPEN_AIRPLAY -> Unit
        }
    }

    // The check throws where the app's manifest lacks the services version, as the engine's does: the sheet
    // then says the services are missing instead of not opening.
    private fun playServicesStatus(activity: Activity): PlayServicesStatus {
        val state =
            try {
                checkPlayServices(activity)
            } catch (error: Exception) {
                Log.w(TAG, "Play Services check failed", error)
                ConnectionResult.SERVICE_MISSING
            }
        return when (state) {
            ConnectionResult.SUCCESS -> PlayServicesStatus.AVAILABLE
            ConnectionResult.SERVICE_VERSION_UPDATE_REQUIRED, ConnectionResult.SERVICE_UPDATING -> PlayServicesStatus.UPDATE_REQUIRED
            else -> PlayServicesStatus.MISSING
        }
    }

    // Null for a view that is not laid out in a window, which then gives no position.
    private fun windowBounds(view: View): IntRect? {
        if (!view.isAttachedToWindow || view.width == 0) return null
        val origin = IntArray(2).also(view::getLocationInWindow)
        return IntRect(origin[0], origin[1], origin[0] + view.width, origin[1] + view.height)
    }

    // A tablet by its smallest width, which a rotation does not change.
    private fun thisDevice(activity: Activity) =
        if (activity.resources.configuration.smallestScreenWidthDp >= RemoteTargetConstants.REGULAR_WIDTH_DP) {
            ThisDeviceKind.TABLET
        } else {
            ThisDeviceKind.PHONE
        }
}

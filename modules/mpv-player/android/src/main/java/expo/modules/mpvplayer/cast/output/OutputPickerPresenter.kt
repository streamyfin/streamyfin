package expo.modules.mpvplayer.cast.output

import android.app.Activity
import android.graphics.Rect
import android.util.Log
import android.view.ViewGroup
import androidx.annotation.MainThread
import androidx.annotation.VisibleForTesting
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
    private var hostLifecycle: Lifecycle? = null

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
                        controller?.let { sheet -> sheet.environment = sheet.environment.copy(playServices = playServicesStatus(activity)) }
                    }
                else -> Unit
            }
        }

    /** The texts JS sent last; English when the sheet opens from native. */
    var strings = OutputPickerStrings()

    /** What the receiver plays, from the media status the module follows. */
    var receiverTitle: () -> String? = { null }

    /** Called once the sheet is gone, whichever way it went. */
    var onDismissed: (() -> Unit)? = null

    /** The activity the module runs in, for the debug probe, which has none of its own. */
    var currentActivity: () -> Activity? = { null }

    val isPresented: Boolean
        get() = host != null

    @VisibleForTesting
    internal val presentedController: OutputSheetController?
        get() = controller

    // Play Services' own check and dialog, which Robolectric has neither of.
    @VisibleForTesting
    internal val defaultCheckPlayServices: (Activity) -> Int = { GoogleApiAvailability.getInstance().isGooglePlayServicesAvailable(it) }

    @VisibleForTesting
    internal var checkPlayServices = defaultCheckPlayServices

    @VisibleForTesting
    internal val defaultResolvePlayServices: (Activity) -> Unit = { GoogleApiAvailability.getInstance().makeGooglePlayServicesAvailable(it) }

    @VisibleForTesting
    internal var resolvePlayServices = defaultResolvePlayServices

    /** False on a TV, which has no sheet; true once presented, or already there. */
    @MainThread
    fun present(activity: Activity, anchor: Rect?, playingHere: String?, onRemote: () -> Unit): Boolean {
        if (DeviceKind.isTelevision(activity)) return false
        this.onRemote = onRemote
        controller?.let { sheet ->
            sheet.environment = sheet.environment.copy(playingHere = playingHere, receiverTitle = receiverTitle())
            return true
        }
        val sheet = OutputSheetController(RemoteTargetHub.shared, mainLooperSchedule())
        sheet.environment =
            OutputSheetEnvironment(
                playServices = playServicesStatus(activity),
                thisDevice = thisDevice(activity),
                playingHere = playingHere,
                receiverTitle = receiverTitle(),
            )
        sheet.onOutput = { output -> handle(activity, output) }
        val anchorBounds = anchor?.let { IntRect(it.left, it.top, it.right, it.bottom) }
        val view =
            ComposeView(activity).apply {
                // Compose needs the activity's owners on a view React Native's activity did not create.
                (activity as? LifecycleOwner)?.let { setViewTreeLifecycleOwner(it) }
                (activity as? ViewModelStoreOwner)?.let { setViewTreeViewModelStoreOwner(it) }
                (activity as? SavedStateRegistryOwner)?.let { setViewTreeSavedStateRegistryOwner(it) }
                setContent { PlayerTheme { OutputSheetHost(sheet, strings, anchorBounds, onDismiss = ::dismiss) } }
            }
        activity.addContentView(view, ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        host = view
        controller = sheet
        hostLifecycle = (activity as? LifecycleOwner)?.lifecycle?.also { it.addObserver(hostWatcher) }
        sheet.open()
        return true
    }

    @MainThread
    fun dismiss() {
        val view = host ?: return
        host = null
        hostLifecycle?.removeObserver(hostWatcher)
        hostLifecycle = null
        controller?.close()
        controller = null
        onRemote = null
        (view.parent as? ViewGroup)?.removeView(view)
        onDismissed?.invoke()
    }

    /** The receiver started or changed what it plays: the panel's remote row follows. */
    @MainThread
    fun refresh() {
        controller?.let { sheet -> sheet.environment = sheet.environment.copy(receiverTitle = receiverTitle()) }
    }

    /** The debug probe's sheet, for its screenshots: over whatever the app shows. */
    @MainThread
    fun presentForProbe(): Boolean {
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

    // A tablet by its smallest width, which a rotation does not change.
    private fun thisDevice(activity: Activity) =
        if (activity.resources.configuration.smallestScreenWidthDp >= RemoteTargetConstants.REGULAR_WIDTH_DP) {
            ThisDeviceKind.TABLET
        } else {
            ThisDeviceKind.PHONE
        }
}

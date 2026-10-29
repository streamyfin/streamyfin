package expo.modules.systemvolume

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.database.ContentObserver
import android.media.AudioManager
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.util.Log
import android.view.KeyEvent
import android.view.Window
import java.lang.ref.WeakReference
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlin.math.roundToInt

/**
 * Undocumented but stable since API 1, and the only broadcast that fires for a
 * hardware volume key press. The framework declares it as a protected system
 * broadcast, which is why RECEIVER_NOT_EXPORTED is the correct flag on API 33+.
 */
private const val VOLUME_CHANGED_ACTION = "android.media.VOLUME_CHANGED_ACTION"
private const val EXTRA_VOLUME_STREAM_TYPE = "android.media.EXTRA_VOLUME_STREAM_TYPE"

private const val TAG = "SystemVolume"

/**
 * The device's media volume, for Android and Android TV: read, follow, set, and
 * keep the system volume panel away while the app shows its own slider.
 */
class SystemVolumeModule : Module() {
  private val context: Context
    get() = requireNotNull(appContext.reactContext)

  private val audioManager: AudioManager
    get() = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager

  private var receiver: BroadcastReceiver? = null
  private var observer: ContentObserver? = null
  private var lastEmitted = Double.NaN
  private var indicatorHidden = false
  private var keyHandler: VolumeKeyCallback? = null
  private var keyHandlerWindow: WeakReference<Window>? = null

  override fun definition() = ModuleDefinition {
    Name("SystemVolume")

    Events("onVolumeChange")

    Function("getVolume") { currentVolume() }

    // Off the JS thread: each AudioManager read is a binder call.
    AsyncFunction("getVolumeAsync") { currentVolume() }

    // True on devices whose output volume the app cannot follow, typically a TV
    // box wired to an AV receiver. Callers must then rely on the player mute.
    Function("isVolumeFixed") { audioManager.isVolumeFixed }

    // No system panel: the app shows its own slider wherever it sets the volume.
    Function("setVolume") { volume: Double -> setVolume(volume) }

    AsyncFunction("setVolumeIndicatorHidden") { hidden: Boolean ->
      indicatorHidden = hidden
      applyIndicatorHidden()
    }.runOnQueue(Queues.MAIN)

    // A recreated activity comes with a new window, without the key handler.
    OnActivityEntersForeground { applyIndicatorHidden() }

    OnStartObserving { startObserving() }

    OnStopObserving { stopObserving() }

    OnDestroy {
      stopObserving()
      keyHandler?.active = false
    }
  }

  private fun currentVolume(): Double {
    val max = audioManager.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
    if (max <= 0) return 0.0
    if (audioManager.isStreamMute(AudioManager.STREAM_MUSIC)) return 0.0
    return audioManager.getStreamVolume(AudioManager.STREAM_MUSIC).toDouble() / max
  }

  private fun setVolume(volume: Double) {
    val max = audioManager.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
    // Rounded, not truncated: a volume read back as index / max must land on
    // the same index, and 7 / 15 * 15 truncates to 6.
    val index = (volume.coerceIn(0.0, 1.0) * max).roundToInt()
    try {
      audioManager.setStreamVolume(AudioManager.STREAM_MUSIC, index, 0)
    } catch (e: SecurityException) {
      // Do Not Disturb refuses a change that would silence the device.
      Log.w(TAG, "setStreamVolume refused", e)
    }
  }

  private fun applyIndicatorHidden() {
    val window = appContext.currentActivity?.window ?: return
    if (keyHandlerWindow?.get() !== window) {
      // Installed on the first hide only, once per window.
      if (!indicatorHidden) return
      keyHandler = VolumeKeyCallback(window.callback, audioManager).also { window.callback = it }
      keyHandlerWindow = WeakReference(window)
    }
    keyHandler?.active = indicatorHidden
  }

  private fun emitIfChanged() {
    val volume = currentVolume()
    if (volume == lastEmitted) return
    lastEmitted = volume
    sendEvent("onVolumeChange", mapOf("volume" to volume))
  }

  private fun startObserving() {
    lastEmitted = Double.NaN

    if (receiver == null) {
      val next = object : BroadcastReceiver() {
        override fun onReceive(ctx: Context?, intent: Intent?) {
          if (intent?.action != VOLUME_CHANGED_ACTION) return
          if (intent.getIntExtra(EXTRA_VOLUME_STREAM_TYPE, -1) != AudioManager.STREAM_MUSIC) return
          emitIfChanged()
        }
      }
      val filter = IntentFilter(VOLUME_CHANGED_ACTION)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        context.registerReceiver(next, filter, Context.RECEIVER_NOT_EXPORTED)
      } else {
        context.registerReceiver(next, filter)
      }
      receiver = next
    }

    if (observer == null) {
      // Safety net: the broadcast above is not public API and some OEM builds
      // skip it. Settings.System carries the volume rows on every build.
      val next = object : ContentObserver(Handler(Looper.getMainLooper())) {
        override fun onChange(selfChange: Boolean, uri: Uri?) = emitIfChanged()
      }
      context.contentResolver.registerContentObserver(Settings.System.CONTENT_URI, true, next)
      observer = next
    }
  }

  private fun stopObserving() {
    receiver?.let {
      runCatching { context.unregisterReceiver(it) }
      receiver = null
    }
    observer?.let {
      runCatching { context.contentResolver.unregisterContentObserver(it) }
      observer = null
    }
    lastEmitted = Double.NaN
  }
}

/**
 * Takes the volume keys while the app shows its own volume slider: they still
 * change the media volume, one step per press, without the system panel on top
 * of the player. Stays installed once there and passes everything through when
 * inactive, so a callback another library wraps around it is never cut off.
 */
private class VolumeKeyCallback(
  private val wrapped: Window.Callback,
  private val audioManager: AudioManager,
) : Window.Callback by wrapped {
  var active = false

  override fun dispatchKeyEvent(event: KeyEvent): Boolean {
    val direction = when (event.keyCode) {
      KeyEvent.KEYCODE_VOLUME_UP -> AudioManager.ADJUST_RAISE
      KeyEvent.KEYCODE_VOLUME_DOWN -> AudioManager.ADJUST_LOWER
      else -> return wrapped.dispatchKeyEvent(event)
    }
    if (!active) return wrapped.dispatchKeyEvent(event)
    if (event.action == KeyEvent.ACTION_DOWN) {
      try {
        audioManager.adjustStreamVolume(AudioManager.STREAM_MUSIC, direction, 0)
      } catch (e: SecurityException) {
        // As in setVolume: Do Not Disturb can refuse the change, and thrown
        // from key dispatch it would crash the app.
        Log.w(TAG, "adjustStreamVolume refused", e)
      }
    }
    return true
  }
}

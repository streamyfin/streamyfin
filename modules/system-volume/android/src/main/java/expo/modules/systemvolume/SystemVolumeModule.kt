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
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Undocumented but stable since API 1, and the only broadcast that fires for a
 * hardware volume key press. The framework declares it as a protected system
 * broadcast, which is why RECEIVER_NOT_EXPORTED is the correct flag on API 33+.
 */
private const val VOLUME_CHANGED_ACTION = "android.media.VOLUME_CHANGED_ACTION"
private const val EXTRA_VOLUME_STREAM_TYPE = "android.media.EXTRA_VOLUME_STREAM_TYPE"

/**
 * Read-only view of the device output volume, for Android and Android TV.
 *
 * Deliberately never changes the volume: this module only observes. Volume
 * writing already goes through react-native-volume-manager on mobile.
 */
class SystemVolumeModule : Module() {
  private val context: Context
    get() = requireNotNull(appContext.reactContext)

  private val audioManager: AudioManager
    get() = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager

  private var receiver: BroadcastReceiver? = null
  private var observer: ContentObserver? = null
  private var lastEmitted = Double.NaN

  override fun definition() = ModuleDefinition {
    Name("SystemVolume")

    Events("onVolumeChange")

    Function("getVolume") { currentVolume() }

    // True on devices whose output volume the app cannot follow, typically a TV
    // box wired to an AV receiver. Callers must then rely on the player mute.
    Function("isVolumeFixed") { audioManager.isVolumeFixed }

    OnStartObserving { startObserving() }

    OnStopObserving { stopObserving() }

    OnDestroy { stopObserving() }
  }

  private fun currentVolume(): Double {
    val max = audioManager.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
    if (max <= 0) return 0.0
    if (audioManager.isStreamMute(AudioManager.STREAM_MUSIC)) return 0.0
    return audioManager.getStreamVolume(AudioManager.STREAM_MUSIC).toDouble() / max
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

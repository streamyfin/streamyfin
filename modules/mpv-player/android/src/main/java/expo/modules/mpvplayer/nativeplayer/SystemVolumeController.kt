package expo.modules.mpvplayer.nativeplayer

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.media.AudioManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.setValue
import kotlin.math.roundToInt

class SystemVolumeController(private val context: Context) {

    private val audioManager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    private val mainHandler = Handler(Looper.getMainLooper())

    var isUserInteracting: Boolean = false
    var onExternalChange: (() -> Unit)? = null
    var onMuteStateChanged: ((Boolean) -> Unit)? = null

    var volume by mutableFloatStateOf(readCurrentVolumeFraction())
        private set

    private var lastSelfWriteAt: Long = 0L
    private var lastVolumeForMuteDetection: Float = volume
    private var receiverRegistered: Boolean = false

    private val volumeReceiver = object : BroadcastReceiver() {
        override fun onReceive(ctx: Context?, intent: Intent?) {
            if (intent?.action == "android.media.VOLUME_CHANGED_ACTION") {
                val streamType = intent.getIntExtra("android.media.EXTRA_VOLUME_STREAM_TYPE", -1)
                if (streamType == AudioManager.STREAM_MUSIC) {
                    val now = System.currentTimeMillis()
                    if (isUserInteracting || (now - lastSelfWriteAt) < PlayerConstants.ECHO_SUPPRESSION_WINDOW_MS) {
                        return
                    }
                    val newVol = readCurrentVolumeFraction()
                    volume = newVol
                    checkMuteTransition(newVol)
                    onExternalChange?.invoke()
                }
            }
        }
    }

    init {
        registerReceiver()
    }

    private fun registerReceiver() {
        if (receiverRegistered) return
        try {
            val filter = IntentFilter("android.media.VOLUME_CHANGED_ACTION")
            context.registerReceiver(volumeReceiver, filter)
            receiverRegistered = true
        } catch (e: Exception) {
            // Some devices restrict VOLUME_CHANGED_ACTION
        }
    }

    fun unregister() {
        if (!receiverRegistered) return
        try {
            context.unregisterReceiver(volumeReceiver)
            receiverRegistered = false
        } catch (e: Exception) {
            // Ignored
        }
    }

    private fun readCurrentVolumeFraction(): Float {
        val max = audioManager.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
        val min = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            audioManager.getStreamMinVolume(AudioManager.STREAM_MUSIC)
        } else 0
        val current = audioManager.getStreamVolume(AudioManager.STREAM_MUSIC)
        val range = (max - min).coerceAtLeast(1)
        return ((current - min).toFloat() / range.toFloat()).coerceIn(0.0f, 1.0f)
    }

    @JvmName("applyVolume")
    fun setVolume(fraction: Float) {
        val clamped = fraction.coerceIn(0.0f, 1.0f)
        volume = clamped
        lastSelfWriteAt = System.currentTimeMillis()

        val max = audioManager.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
        val min = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            audioManager.getStreamMinVolume(AudioManager.STREAM_MUSIC)
        } else 0
        val targetIndex = min + (clamped * (max - min)).roundToInt()

        try {
            audioManager.setStreamVolume(AudioManager.STREAM_MUSIC, targetIndex, 0)
        } catch (e: Exception) {
            // Ignored
        }
        checkMuteTransition(clamped)
    }

    private fun checkMuteTransition(newVol: Float) {
        val isMuted = newVol <= 0.001f
        val wasMuted = lastVolumeForMuteDetection <= 0.001f
        lastVolumeForMuteDetection = newVol
        if (isMuted != wasMuted) {
            onMuteStateChanged?.invoke(isMuted)
        }
    }
}

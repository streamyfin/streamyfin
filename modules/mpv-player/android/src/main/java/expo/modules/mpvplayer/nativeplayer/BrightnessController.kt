package expo.modules.mpvplayer.nativeplayer

import android.app.Activity
import android.view.WindowManager
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.setValue

class BrightnessController(private val activity: Activity) {

    var isUserInteracting: Boolean = false
    var brightness by mutableFloatStateOf(resolveInitialBrightness())
        private set

    private fun resolveInitialBrightness(): Float {
        val windowBrightness = activity.window.attributes.screenBrightness
        return if (windowBrightness in 0.0f..1.0f) {
            windowBrightness
        } else {
            0.5f
        }
    }

    @JvmName("applyBrightness")
    fun setBrightness(value: Float) {
        val clamped = value.coerceIn(0.01f, 1.0f)
        brightness = clamped
        activity.runOnUiThread {
            val layoutParams: WindowManager.LayoutParams = activity.window.attributes
            layoutParams.screenBrightness = clamped
            activity.window.attributes = layoutParams
        }
    }

    fun restore() {
        activity.runOnUiThread {
            val layoutParams: WindowManager.LayoutParams = activity.window.attributes
            layoutParams.screenBrightness = WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE
            activity.window.attributes = layoutParams
        }
    }
}

package expo.modules.mpvplayer.nativeplayer

import android.view.Display
import kotlin.math.abs

/**
 * Picks the display mode whose refresh rate matches the content's frame rate.
 *
 * Why the app has to do this: direct-played MKV carries no frame rate the
 * demuxer can hand to the platform, so the codec starts on its built-in
 * default (30) and the vendor's HDMI frame-rate adaptation fires before the
 * real rate is known — 25fps content then stays on a 60Hz panel and judders
 * in an uneven 2:2:3 cadence. Window-level preferredDisplayModeId is the API
 * Android's docs prescribe for TV boxes: Surface.setFrameRate() only drives
 * seamless switches, and TV panels switch non-seamlessly.
 */
object RefreshRateMatcher {

    // A mode matches when its refresh rate is a near-integer multiple of the
    // content rate (25 → 50, 23.976 → 24). The tolerance grows with the
    // multiple because the content clock's drift does too (23.976 × 2 vs a
    // 48 Hz mode). Half a Hz at k=1 is far above any clock drift and far
    // below any real rate difference — deliberately NOT nearest-match, which
    // would pull 25fps onto a 24 Hz mode (1 Hz away) and judder worse than
    // the 50 Hz two steps away.
    private fun tolerance(multiple: Int) = 0.5f + 0.02f * multiple

    /**
     * The supported mode to switch to for `contentFrameRate`, or null when no
     * mode matches or the best match is already active. Considers only modes
     * at the current resolution: switching resolution is a bigger promise
     * than removing judder (jellyfin-androidtv #1482).
     */
    fun pickMode(display: Display, contentFrameRate: Double): Display.Mode? {
        if (contentFrameRate <= 0.0) return null
        val current = display.mode
        var best: Display.Mode? = null
        var bestMultiple = Int.MAX_VALUE
        for (mode in display.supportedModes) {
            if (mode.physicalWidth != current.physicalWidth ||
                mode.physicalHeight != current.physicalHeight
            ) {
                continue
            }
            // Lowest multiple wins: the panel divides it back down to the
            // content rate, and lower multiples drift less. First hit at a
            // multiple stops the scan for this mode.
            for (multiple in 1..4) {
                val target = contentFrameRate * multiple
                if (abs(mode.refreshRate - target.toFloat()) <= tolerance(multiple)) {
                    if (multiple < bestMultiple) {
                        best = mode
                        bestMultiple = multiple
                    }
                    break
                }
            }
        }
        return best?.takeIf { it.modeId != current.modeId }
    }
}

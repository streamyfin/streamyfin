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
 * seamless switches, and TV panels switch non-seamlessly. This is the same
 * mechanism jellyfin-androidtv's PlaybackController uses, and it demonstrably
 * works on the affected box.
 */
object RefreshRateMatcher {

    // Content rate and its 2x / 2.5x / 3x / 4x multiples; 2.5 is what maps
    // 24 fps onto a 60 Hz panel (jellyfin-androidtv qualifies the same set).
    // 1.5x covers no broadcast rate a TV panel carries.
    private val MULTIPLES = floatArrayOf(1f, 2f, 2.5f, 3f, 4f)

    // A mode matches when its refresh rate is a near-integer multiple of the
    // content rate (25 → 50, 23.976 → 24). The tolerance grows with the
    // multiple because the content clock's drift does too (23.976 × 2 vs a
    // 48 Hz mode). Half a Hz at k=1 is far above any clock drift and far
    // below any real rate difference — deliberately NOT nearest-match, which
    // would pull 25fps onto a 24 Hz mode (1 Hz away) and judder worse than
    // the 50 Hz two steps away.
    private fun tolerance(multiple: Float) = 0.5f + 0.02f * multiple

    /**
     * The best supported mode for `contentFrameRate`, or null when no mode
     * qualifies. The caller decides between switching and keeping what is
     * active: a tie at the lowest multiple prefers the active mode and then
     * the closest rate, so a matching active mode is never switched away from
     * and 59.94 fps content does not land on a 60 Hz mode that merely lists
     * earlier. Considers only modes at the current resolution: switching
     * resolution is a bigger promise than removing judder
     * (jellyfin-androidtv #1482).
     */
    fun pickMode(display: Display, contentFrameRate: Double): Display.Mode? {
        if (contentFrameRate <= 0.0) return null
        val current = display.mode
        var best: Display.Mode? = null
        var bestMultiple = Float.MAX_VALUE
        var bestDistance = Float.MAX_VALUE
        var bestIsCurrent = false
        for (mode in display.supportedModes) {
            if (mode.physicalWidth != current.physicalWidth ||
                mode.physicalHeight != current.physicalHeight
            ) {
                continue
            }
            // Lowest multiple wins: the panel divides it back down to the
            // content rate, and lower multiples drift less. First hit at a
            // multiple stops the scan for this mode.
            for (multiple in MULTIPLES) {
                val target = (contentFrameRate * multiple).toFloat()
                val distance = abs(mode.refreshRate - target)
                if (distance > tolerance(multiple)) continue
                val isCurrent = mode.modeId == current.modeId
                val better =
                    multiple < bestMultiple ||
                        (multiple == bestMultiple &&
                            (distance < bestDistance ||
                                (distance == bestDistance &&
                                    isCurrent && !bestIsCurrent)))
                if (better) {
                    best = mode
                    bestMultiple = multiple
                    bestDistance = distance
                    bestIsCurrent = isCurrent
                }
                break
            }
        }
        return best
    }
}

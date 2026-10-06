package expo.modules.mpvplayer.nativeplayer

import kotlin.math.abs

/** An old progress tick cannot acknowledge a newer seek's requested position. */
internal class PendingSeekReport {
    private var target: Double? = null

    fun request(position: Double) { target = position }
    fun reset() { target = null }

    fun consume(position: Double): Boolean {
        val expected = target ?: return false
        if (abs(position - expected) > 0.5) return false
        target = null
        return true
    }
}

package expo.modules.mpvplayer.nativeplayer.ui

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class SeekIconTest {
    @Test
    fun countsWholeSecondsAndRejectsSkipTimesThatAreNotNumbers() {
        assertEquals(20, seekCount(20.0))
        assertEquals(20, seekCount(19.6))
        assertEquals(3, seekCount(2.5))
        assertEquals(0, seekCount(0.0))
        assertNull("-0.4 rounds to -0 and must not pass as 0", seekCount(-0.4))
        assertNull(seekCount(Double.NaN))
        assertNull(seekCount(Double.POSITIVE_INFINITY))
    }

    /**
     * A numbered Material arrow only for the count it shows (the phone drew
     * Replay10 for every skip time), and always that arrow when Material ships
     * one, so drawn digits never stand in for a native glyph.
     */
    @Test
    fun picksMaterialsNumberedArrowExactlyWhenOneShowsThatCount() {
        for (count in 0..120 step 5) {
            for ((forward, prefix) in listOf(false to "Replay", true to "Forward")) {
                val icon = "$prefix$count"
                val expected = if (materialShips(icon)) "Filled.$icon" else null
                assertEquals(icon, expected, numberedSeekIcon(forward, count)?.name)
            }
        }
    }

    private fun materialShips(icon: String): Boolean = runCatching {
        Class.forName("androidx.compose.material.icons.filled.${icon}Kt", false, javaClass.classLoader)
    }.isSuccess
}

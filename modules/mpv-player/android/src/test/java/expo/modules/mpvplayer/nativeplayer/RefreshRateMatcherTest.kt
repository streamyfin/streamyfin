package expo.modules.mpvplayer.nativeplayer

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class RefreshRateMatcherTest {
    private fun mode(id: Int, hz: Float, width: Int = 3840, height: Int = 2160) =
        ModeCandidate(id, width, height, hz)

    private val hz60 = mode(1, 60f)
    private val hz5994 = mode(2, 59.94f)
    private val hz50 = mode(3, 50f)
    private val hz24 = mode(4, 24f)

    // Both qualify at 1x: switching to the closer 59.94 Hz is a visible blank on a TV panel for
    // a cadence that 60 Hz already carries, which the KDoc rules out.
    @Test
    fun keepsAnActiveModeThatAlreadySuits() {
        assertEquals(1, RefreshRateMatcher.pickModeId(hz60, listOf(hz60, hz5994), 59.94))
        assertEquals(1, RefreshRateMatcher.pickModeId(hz60, listOf(hz5994, hz60), 59.94))
    }

    @Test
    fun takesTheClosestRateWhenTheActiveModeDoesNotSuit() {
        assertEquals(2, RefreshRateMatcher.pickModeId(hz50, listOf(hz60, hz5994, hz50), 59.94))
    }

    @Test
    fun prefersTheLowestMultiple() {
        // 25 fps: 50 Hz is 2x, 60 Hz is no multiple at all.
        assertEquals(3, RefreshRateMatcher.pickModeId(hz60, listOf(hz60, hz50), 25.0))
        // 23.976 fps: 24 Hz (1x) over 60 Hz (2.5x), though 60 Hz is active.
        assertEquals(4, RefreshRateMatcher.pickModeId(hz60, listOf(hz60, hz24), 23.976))
    }

    @Test
    fun keepsToTheActiveResolutionAndAKnownRate() {
        val hd50 = mode(5, 50f, 1920, 1080)
        assertNull(RefreshRateMatcher.pickModeId(hz60, listOf(hz60, hd50), 25.0))
        assertNull(RefreshRateMatcher.pickModeId(hz60, listOf(hz60), 0.0))
    }
}

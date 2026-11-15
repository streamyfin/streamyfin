package expo.modules.mpvplayer.nativeplayer.ui

import expo.modules.mpvplayer.nativeplayer.PlayerConstants
import org.junit.Assert.assertEquals
import org.junit.Test

class PlaybackLabelsTest {
    // The Android TV menu showed these as "0.250000×" … "2.00000×" (String.format("%g×")).
    @Test
    fun labelsEveryPresetWithoutTrailingZeros() {
        assertEquals(
            listOf("0.25×", "0.5×", "0.75×", "1×", "1.25×", "1.5×", "1.75×", "2×"),
            PlayerConstants.SPEED_PRESETS.map(::speedLabel),
        )
    }

    // The phone menu and the hold pill showed a whole rate as "2.0×" or "3.0×".
    @Test
    fun labelsAWholeHoldRateWithoutItsDecimal() {
        assertEquals("3×", speedLabel(3.0))
        assertEquals("10×", speedLabel(10.0))
    }

    // The TV sync menus showed "-5.00000 s" and "+0.250000 s" (String.format("%+g s")), the
    // phone ones "-5.0 s" and an unsigned "0.5 s". iOS reads "-5 s" and "+0.5 s".
    @Test
    fun labelsEverySyncOffsetSignedAndTrimmed() {
        assertEquals(
            listOf("-5 s", "-2 s", "-1 s", "-0.5 s", "-0.25 s", "0 s", "+0.25 s", "+0.5 s", "+1 s", "+2 s", "+5 s"),
            PlayerConstants.SYNC_OFFSET_PRESETS.map(::syncOffsetLabel),
        )
    }

    // The hold rate comes from the JS settings unchecked: a label must not take the player down.
    @Test
    fun labelsAValueThatIsNotFiniteWithoutThrowing() {
        assertEquals("NaN×", speedLabel(Double.NaN))
        assertEquals("Infinity×", speedLabel(Double.POSITIVE_INFINITY))
    }
}

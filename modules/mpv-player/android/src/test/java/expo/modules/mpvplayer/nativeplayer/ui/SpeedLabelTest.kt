package expo.modules.mpvplayer.nativeplayer.ui

import expo.modules.mpvplayer.nativeplayer.PlayerConstants
import org.junit.Assert.assertEquals
import org.junit.Test

class SpeedLabelTest {
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
}

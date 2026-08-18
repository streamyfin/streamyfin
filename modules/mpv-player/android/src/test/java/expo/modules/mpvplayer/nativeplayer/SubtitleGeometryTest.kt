package expo.modules.mpvplayer.nativeplayer

import org.junit.Assert.assertEquals
import org.junit.Test

class SubtitleGeometryTest {
    @Test
    fun keepsBaseCalibrationWithoutSurfaceGeometry() {
        assertEquals(1.035, calculateSubtitleScale(1.0, 1.035, 0, 0, 0, 0, false), 0.0001)
    }

    @Test
    fun compensatesForDownscaledVideoAndCoverZoom() {
        assertEquals(2.07, calculateSubtitleScale(1.0, 1.035, 1920, 1080, 960, 540, false), 0.0001)
        assertEquals(0.41, calculateSubtitleScale(1.0, 1.035, 1920, 960, 1080, 2400, true), 0.0001)
    }

    @Test
    fun reducesOnlyPhonePortraitMarginOutsidePip() {
        assertEquals(25, calculateSubtitleMargin(35, false, false, 1080, 2400))
        assertEquals(35, calculateSubtitleMargin(35, false, true, 1080, 2400))
        assertEquals(35, calculateSubtitleMargin(35, true, false, 1080, 2400))
        assertEquals(35, calculateSubtitleMargin(35, false, false, 2400, 1080))
    }
}

package expo.modules.mpvplayer.nativeplayer

import expo.modules.mpvplayer.normalizeVideoDimensions
import org.junit.Assert.assertEquals
import org.junit.Test

class SubtitleGeometryTest {
    @Test
    fun normalizesRotatedVideoDimensions() {
        assertEquals(1920 to 1080, normalizeVideoDimensions(1920, 1080, 0))
        assertEquals(1080 to 1920, normalizeVideoDimensions(1920, 1080, 90))
        assertEquals(1080 to 1920, normalizeVideoDimensions(1920, 1080, -90))
    }

    @Test
    fun keepsBaseCalibrationWithoutSurfaceGeometry() {
        assertEquals(1.035, calculateSubtitleScale(1.0, 1.035, 0, 0, 0, 0), 0.0001)
    }

    @Test
    fun fitBoostDoesNotDependOnCoverZoom() {
        assertEquals(2.07, calculateSubtitleScale(1.0, 1.035, 1920, 1080, 960, 540), 0.0001)
        // A portrait surface still uses the contain fit boost.  mpv's panscan
        // controls the video crop independently, so no portrait-only shrink
        // or zoom compensation is applied to subtitles.
        assertEquals(1.84, calculateSubtitleScale(1.0, 1.035, 1920, 960, 1080, 2400), 0.0001)
    }
}

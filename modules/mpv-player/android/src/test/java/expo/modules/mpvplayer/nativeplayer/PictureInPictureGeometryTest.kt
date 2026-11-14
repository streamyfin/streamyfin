package expo.modules.mpvplayer.nativeplayer

import android.graphics.Rect
import android.util.Rational
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** The picture in picture window's shape, and the picture it grows from. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class PictureInPictureGeometryTest {
    @Test
    fun theWindowTakesTheVideosShape() {
        assertEquals(Rational(4, 3), pictureInPictureGeometry(1440, 1080, 0, 0).aspectRatio)
    }

    @Test
    fun withNoSizeYetTheWindowIsSixteenByNine() {
        val geometry = pictureInPictureGeometry(0, 0, 2400, 1080)

        assertEquals(Rational(16, 9), geometry.aspectRatio)
        assertNull(geometry.sourceRectHint)
    }

    // Android refuses a window past 2.39:1 either way: setting it throws.
    @Test
    fun aScopeFilmGetsTheWidestWindowAndroidAllows() {
        assertEquals(Rational(239, 100), pictureInPictureGeometry(1920, 800, 0, 0).aspectRatio)
    }

    @Test
    fun aTallVideoGetsTheTallestWindowAndroidAllows() {
        assertEquals(Rational(100, 239), pictureInPictureGeometry(800, 1920, 0, 0).aspectRatio)
    }

    // The system grows the window out of this rectangle: the whole view would start it from the
    // black bars.
    @Test
    fun theWindowGrowsFromThePictureBetweenTheBars() {
        // 4:3 on a wide phone: bars left and right.
        assertEquals(Rect(480, 0, 1920, 1080), pictureInPictureGeometry(1440, 1080, 2400, 1080).sourceRectHint)
        // 2:1 on a 4:3 tablet: bars above and below.
        assertEquals(Rect(0, 200, 1600, 1000), pictureInPictureGeometry(2000, 1000, 1600, 1200).sourceRectHint)
    }

    @Test
    fun beforeTheViewIsLaidOutThereIsNoPictureToGrowFrom() {
        assertNull(pictureInPictureGeometry(1440, 1080, 0, 0).sourceRectHint)
    }
}

package expo.modules.mpvplayer.cast.output

import androidx.compose.ui.unit.IntRect
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.LayoutDirection
import org.junit.Assert.assertEquals
import org.junit.Test

// Where the popover opens next to its button, in window pixels.
class AnchorPositionTest {
    // A landscape phone at 2.625 px per dp: the popover keeps 16 dp from the window's edge and opens 8 dp
    // under the button, not 16 and 8 pixels.
    @Test
    fun theMarginsAreInDpAtAnyDensity() {
        val window = IntSize(2400, 1080)
        val content = IntSize(1000, 600)
        val button = IntRect(2300, 40, 2380, 120)

        val position = AnchorPosition(button, density = 2.625f).calculatePosition(IntRect.Zero, window, LayoutDirection.Ltr, content)

        assertEquals(2400 - 1000 - 42, position.x)
        assertEquals(120 + 21, position.y)
    }

    // Too tall to open under the button, the popover opens above it, its bottom edge inside the window whatever its
    // height; one that fits above stays where it was.
    @Test
    fun aPopoverAboveTheButtonKeepsItsBottomInsideTheWindow() {
        val window = IntSize(2400, 1080)
        fun y(button: IntRect, height: Int) =
            AnchorPosition(button, density = 2.625f).calculatePosition(IntRect.Zero, window, LayoutDirection.Ltr, IntSize(1000, height)).y

        assertEquals(1080 - 42 - 1000, y(IntRect(2300, 40, 2380, 120), 1000))
        assertEquals(900 - 21 - 600, y(IntRect(2300, 900, 2380, 980), 600))
    }

    // A landscape phone is 360 to 410 dp high, under the 640 dp the list may take: the popover scrolls instead.
    @Test
    fun thePopoverIsNoTallerThanTheWindowLessItsMargins() {
        assertEquals(360 - 32, popoverMaxHeightDp(360))
        assertEquals(1200 - 32, popoverMaxHeightDp(1200))
    }
}

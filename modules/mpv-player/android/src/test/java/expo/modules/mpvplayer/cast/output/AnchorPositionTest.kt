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
}

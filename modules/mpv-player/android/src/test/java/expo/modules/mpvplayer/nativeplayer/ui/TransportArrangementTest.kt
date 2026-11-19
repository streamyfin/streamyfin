package expo.modules.mpvplayer.nativeplayer.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Test

// The remote transport: previous, back, play, forward, next at 44, 52, 68, 52, 44. A row narrower than the
// buttons and their gaps closes the gaps; it never squeezes a button, as spacedBy did with the last one.
class TransportArrangementTest {
    private val five = intArrayOf(44, 52, 68, 52, 44)

    private fun place(arrangement: Arrangement.Horizontal, total: Int, sizes: IntArray): IntArray {
        val out = IntArray(sizes.size)
        with(arrangement) { Density(1f).arrange(total, sizes, LayoutDirection.Ltr, out) }
        return out
    }

    @Test
    fun theRowIsMeasuredWithoutReservingTheGaps() {
        // A Row hands each button the width left after the gaps it reserves: a reserved gap is what squeezed
        // the last one.
        assertEquals(0.dp, FittingGapArrangement(20.dp).spacing)
    }

    @Test
    fun aNarrowRowClosesTheGapsAndKeepsEveryButtonWhole() {
        // 312, the column of a 360dp phone: 52 left for four gaps, 13 each, from edge to edge.
        assertArrayEquals(intArrayOf(0, 57, 122, 203, 268), place(FittingGapArrangement(20.dp), 312, five))
    }

    @Test
    fun aRowWithRoomCentersTheButtonsAtTheirGap() {
        // 340 in 360: 10 on each side.
        assertArrayEquals(intArrayOf(10, 74, 146, 234, 306), place(FittingGapArrangement(20.dp), 360, five))
    }
}

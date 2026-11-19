package expo.modules.mpvplayer.nativeplayer.ui

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class TechInfoRowTest {
    // The weights are the remote screen's compact card's; the local player's panel and the TV's keep the line they
    // had before it, its value pushed to the edge. Review of the 19/11: the weights had reached every caller.
    @Test
    fun onlyTheCompactCardSharesALineByWeight() {
        assertNull(techInfoRowWeights(compact = false))
        assertEquals(0.4f to 0.6f, techInfoRowWeights(compact = true))
    }
}

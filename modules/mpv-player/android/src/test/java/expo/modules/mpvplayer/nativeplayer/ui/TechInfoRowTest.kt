package expo.modules.mpvplayer.nativeplayer.ui

import expo.modules.mpvplayer.nativeplayer.PlayerConstants
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

    // The card's width and the label's share are the iPhone's too: its check asserts the same two numbers
    // (theTechnicalInfoCardIsAndroids in RemoteLayoutTests.swift).
    @Test
    fun theCardKeepsTheSizesTheIphoneMirrors() {
        assertEquals(320.0, PlayerConstants.TECHNICAL_INFO_WIDTH_DP, 0.0)
        assertEquals(0.4, PlayerConstants.REMOTE_TECHNICAL_INFO_LABEL_SHARE, 0.0)
    }
}

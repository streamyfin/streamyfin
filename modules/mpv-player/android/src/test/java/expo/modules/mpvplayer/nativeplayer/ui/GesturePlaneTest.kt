package expo.modules.mpvplayer.nativeplayer.ui

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class GesturePlaneTest {
    // A phone in landscape, in px: 48 dp at density 2.75.
    private val height = 1080f
    private val edge = 132f

    /**
     * Pulling the notification shade down over the player changed the volume
     * or the brightness, because the drag took a swipe that began at the top
     * edge. The strips at both edges are left to the system.
     */
    @Test
    fun leavesDragsFromTheTopAndBottomEdgeToTheSystem() {
        assertTrue("the very top edge", startsAtScreenEdge(0f, height, edge))
        assertTrue("a finger coming in over the top bezel", startsAtScreenEdge(40f, height, edge))
        assertTrue("the last px of the top strip", startsAtScreenEdge(edge - 1f, height, edge))
        assertTrue("the first px of the bottom strip", startsAtScreenEdge(height - edge, height, edge))
        assertTrue("the very bottom edge", startsAtScreenEdge(height, height, edge))
    }

    @Test
    fun dragsFromEverywhereBetweenTheStrips() {
        assertFalse("the first px below the top strip", startsAtScreenEdge(edge, height, edge))
        assertFalse("the middle of the video", startsAtScreenEdge(height / 2, height, edge))
        assertFalse("the last px above the bottom strip", startsAtScreenEdge(height - edge - 1f, height, edge))
    }

    @Test
    fun ignoresEveryDragOnAPlaneShorterThanBothStrips() {
        assertTrue(startsAtScreenEdge(100f, 200f, edge))
    }
}

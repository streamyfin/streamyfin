package expo.modules.mpvplayer.nativeplayer.ui

import expo.modules.mpvplayer.nativeplayer.UIOptionsRecord
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

    private val everyGesture = UIOptionsRecord()

    // A sideways drag scrubs, and a live stream has no timeline to scrub.
    @Test
    fun aSidewaysDragScrubsAFilmAndNotALiveStream() {
        assertTrue(dragIsAllowed(DragAxis.HORIZONTAL, onLeftHalf = true, everyGesture, isLive = false))
        assertFalse(dragIsAllowed(DragAxis.HORIZONTAL, onLeftHalf = true, everyGesture, isLive = true))
    }

    @Test
    fun aLiveStreamKeepsItsBrightnessAndVolumeDrags() {
        assertTrue("brightness, on the left", dragIsAllowed(DragAxis.VERTICAL, onLeftHalf = true, everyGesture, isLive = true))
        assertTrue("volume, on the right", dragIsAllowed(DragAxis.VERTICAL, onLeftHalf = false, everyGesture, isLive = true))
    }

    @Test
    fun aDragWhoseGestureIsSwitchedOffIsNotAllowed() {
        val noSeek = UIOptionsRecord().apply { horizontalSwipeSeekEnabled = false }
        val noBrightness = UIOptionsRecord().apply { brightnessSwipeEnabled = false }
        val noVolume = UIOptionsRecord().apply { volumeSwipeEnabled = false }

        assertFalse(dragIsAllowed(DragAxis.HORIZONTAL, onLeftHalf = false, noSeek, isLive = false))
        assertFalse(dragIsAllowed(DragAxis.VERTICAL, onLeftHalf = true, noBrightness, isLive = false))
        assertTrue("volume is on the other half", dragIsAllowed(DragAxis.VERTICAL, onLeftHalf = false, noBrightness, isLive = false))
        assertFalse(dragIsAllowed(DragAxis.VERTICAL, onLeftHalf = false, noVolume, isLive = false))
        assertTrue("brightness is on the other half", dragIsAllowed(DragAxis.VERTICAL, onLeftHalf = true, noVolume, isLive = false))
    }
}

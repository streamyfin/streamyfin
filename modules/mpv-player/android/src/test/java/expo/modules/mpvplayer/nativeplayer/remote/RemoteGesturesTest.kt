package expo.modules.mpvplayer.nativeplayer.remote

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

// The remote screen's two gestures (design §3.8): a drag down closes it like the chevron, a double tap on a half
// of the artwork seeks. Same cases as iOS's RemoteGesturesTests.
class RemoteGesturesTest {
    private val height = 800.0

    @Test
    fun aShortSlowDragStays() {
        assertFalse(RemoteGestures.shouldDismissOnDrag(distanceDp = 60.0, velocityDpPerSec = 300.0, heightDp = height))
        assertFalse(RemoteGestures.shouldDismissOnDrag(distanceDp = 199.0, velocityDpPerSec = 0.0, heightDp = height))
    }

    @Test
    fun aQuarterScreenDragCloses() {
        assertTrue(RemoteGestures.shouldDismissOnDrag(distanceDp = 200.0, velocityDpPerSec = 0.0, heightDp = height))
        assertTrue(RemoteGestures.shouldDismissOnDrag(distanceDp = 500.0, velocityDpPerSec = -100.0, heightDp = height))
    }

    @Test
    fun aFastFlickCloses() {
        assertTrue(RemoteGestures.shouldDismissOnDrag(distanceDp = 40.0, velocityDpPerSec = 1200.0, heightDp = height))
        assertFalse(RemoteGestures.shouldDismissOnDrag(distanceDp = 40.0, velocityDpPerSec = 1199.0, heightDp = height))
        // Ended above where it started: a flick back down to it is not a drag down.
        assertFalse(RemoteGestures.shouldDismissOnDrag(distanceDp = -40.0, velocityDpPerSec = 2000.0, heightDp = height))
    }

    @Test
    fun aDoubleTapOnTheLeftHalfSeeksBack() {
        assertEquals(-1, RemoteGestures.artworkTapSeek(0.0))
        assertEquals(-1, RemoteGestures.artworkTapSeek(0.49))
        assertEquals(1, RemoteGestures.artworkTapSeek(0.5))
        assertEquals(1, RemoteGestures.artworkTapSeek(1.0))
    }

    @Test
    fun theHalvesDoNotMirrorInRightToLeft() {
        // The fraction runs from the physical left edge, as the screen reads the tap; time runs left to right in
        // every language, so nothing here takes a writing direction and the halves never swap.
        val sides = listOf(0.1, 0.3, 0.7, 0.9).map { RemoteGestures.artworkTapSeek(it) }
        assertEquals(listOf(-1, -1, 1, 1), sides)
    }
}

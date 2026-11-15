package expo.modules.mpvplayer.nativeplayer.remote

import expo.modules.mpvplayer.nativeplayer.PlayerConstants
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

// The remote screen picks its layout from the window's size class, never from the device model, and the
// artwork gives up its height before any text or control is cut. Same cases as iOS's RemoteLayoutTests.
class RemoteLayoutTest {
    @Test
    fun aTallNarrowScreenTakesThePortraitLayout() {
        assertEquals(RemoteLayout.PORTRAIT, RemoteLayout.of(390.0, 844.0))
    }

    @Test
    fun aShortScreenTakesTheLandscapeLayout() {
        assertEquals(RemoteLayout.LANDSCAPE, RemoteLayout.of(844.0, 390.0))
        // A short window stays landscape however wide it is: a tablet's split view at the bottom.
        assertEquals(RemoteLayout.LANDSCAPE, RemoteLayout.of(1180.0, 400.0))
    }

    @Test
    fun aWideScreenPutsTheArtworkBesideTheControls() {
        assertEquals(RemoteLayout.WIDE, RemoteLayout.of(820.0, 1180.0))
        assertEquals(RemoteLayout.WIDE, RemoteLayout.of(1180.0, 820.0))
    }

    @Test
    fun aFoldedThenUnfoldedPhoneChangesLayout() {
        assertEquals(RemoteLayout.PORTRAIT, RemoteLayout.of(360.0, 800.0))
        assertEquals(RemoteLayout.WIDE, RemoteLayout.of(673.0, 841.0))
        assertEquals(RemoteLayout.PORTRAIT, RemoteLayout.of(360.0, 800.0))
    }

    @Test
    fun aNarrowSplitViewOnATabletIsPortrait() {
        assertEquals(RemoteLayout.PORTRAIT, RemoteLayout.of(400.0, 1024.0))
    }

    @Test
    fun theArtworkShrinksBeforeAnythingIsCut() {
        val default = RemoteMetrics.artworkHeight(RemoteLayout.PORTRAIT, 360.0, 640.0, 1.0)
        val large = RemoteMetrics.artworkHeight(RemoteLayout.PORTRAIT, 360.0, 640.0, 2.0)
        assertTrue("artwork $large at 2.0 is not under $default at 1.0", large < default)
        // Above its minimum, the artwork leaves room for everything else: the column does not scroll.
        for ((scale, artwork) in listOf(1.0 to default, 2.0 to large)) {
            assertTrue(artwork > PlayerConstants.REMOTE_ARTWORK_MIN_DP)
            val rest = RemoteMetrics.chromeHeight(RemoteLayout.PORTRAIT, scale)
            assertTrue("$artwork + $rest overflows 640 at $scale", artwork + rest <= 640.0)
        }
        // The same holds couched, where the bar and the top bar share the height with the artwork.
        val couched = RemoteMetrics.artworkHeight(RemoteLayout.LANDSCAPE, 640.0, 360.0, 1.0)
        val couchedLarge = RemoteMetrics.artworkHeight(RemoteLayout.LANDSCAPE, 640.0, 360.0, 1.5)
        assertTrue(couchedLarge < couched)
        assertTrue(couched + RemoteMetrics.chromeHeight(RemoteLayout.LANDSCAPE, 1.0) <= 360.0)
    }

    @Test
    fun theArtworkNeverGoesUnderItsMinimum() {
        val min = PlayerConstants.REMOTE_ARTWORK_MIN_DP
        assertEquals(min, RemoteMetrics.artworkHeight(RemoteLayout.PORTRAIT, 320.0, 480.0, 3.0), 0.0)
        assertEquals(min, RemoteMetrics.artworkHeight(RemoteLayout.LANDSCAPE, 568.0, 200.0, 2.0), 0.0)
        assertEquals(min, RemoteMetrics.artworkHeight(RemoteLayout.WIDE, 600.0, 120.0, 1.0), 0.0)
        // Nor over its maximum, on the largest tablet.
        val max = PlayerConstants.REMOTE_ARTWORK_MAX_DP
        assertEquals(max, RemoteMetrics.artworkHeight(RemoteLayout.WIDE, 1366.0, 1024.0, 1.0), 0.0)
        assertEquals(max, RemoteMetrics.artworkHeight(RemoteLayout.PORTRAIT, 480.0, 1600.0, 1.0), 0.0)
    }

    @Test
    fun theArtworkIsNeverWiderThanItsColumn() {
        val portrait = RemoteMetrics.artworkHeight(RemoteLayout.PORTRAIT, 360.0, 1200.0, 1.0)
        assertEquals(360.0 - 2 * PlayerConstants.REMOTE_HORIZONTAL_PADDING_DP, portrait, 0.0)
        val wide = RemoteMetrics.artworkHeight(RemoteLayout.WIDE, 673.0, 841.0, 1.0)
        assertTrue("wide artwork $wide takes more than its share of 673", wide <= 673.0 * PlayerConstants.REMOTE_WIDE_ARTWORK_FRACTION)
    }
}

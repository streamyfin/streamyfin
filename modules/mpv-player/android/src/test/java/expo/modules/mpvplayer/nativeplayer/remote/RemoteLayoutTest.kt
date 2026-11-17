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

    // Measured at the probe on a 1080x2400 phone at 420 dpi, default text size, every slot filled: header 44, five
    // gaps of 16, titles 50 (title 26, subtitle 24), bar block 123 (chapter 24, times 24, the track and its margins
    // 75), transport 68, bottom row 44 = 409. At font scale 1.3 the chrome grew by 25: the text is 83 of it. Compose's
    // line heights make it taller than iOS's 378 (Swift's RemoteLayoutTests).
    @Test
    fun theUprightChromeMatchesTheMeasuredScreen() {
        val one = RemoteMetrics.chromeHeight(RemoteLayout.PORTRAIT, 1.0)
        val two = RemoteMetrics.chromeHeight(RemoteLayout.PORTRAIT, 2.0)
        assertEquals(409.0, one, 0.0)
        assertEquals(83.0, two - one, 0.0)
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

    // Five buttons and their gaps (340 upright) are wider than the column of a 360dp phone (312): the gap gives
    // way, never a button. Wide from 600, the column is 0.55w - 48, 282 there, under the 372 the 28 gap asks for.
    @Test
    fun theTransportGapGivesWayOnANarrowColumn() {
        val upright = RemoteTransport.of(RemoteLayout.PORTRAIT)
        val five = 2 * upright.sideDp + 2 * upright.seekDp + upright.playDp
        assertEquals(13.0, upright.fittingGap(312.0, five, 5), 1e-9)
        assertEquals(5.5, RemoteTransport.of(RemoteLayout.WIDE).fittingGap(282.0, five, 5), 1e-9)
        // With room, the design's gap; never below zero; one button has no gap to fit.
        assertEquals(PlayerConstants.REMOTE_TRANSPORT_GAP_PORTRAIT_DP, upright.fittingGap(363.0, five, 5), 0.0)
        assertEquals(0.0, upright.fittingGap(200.0, five, 5), 0.0)
        assertEquals(upright.gapDp, upright.fittingGap(10.0, upright.playDp, 1), 0.0)
    }

    @Test
    fun theWideArtworkGetsItsShareOfTheWholeWidth() {
        // Its box is the share of the screen's width the artwork is sized against, whatever the column beside it
        // takes; a weight against the column's would leave it 0.45 / 1.45 of the row, under a third.
        for (width in listOf(673.0, 800.0, 1280.0)) {
            val box = RemoteMetrics.besideWidth(RemoteLayout.WIDE, width)
            assertEquals(width * PlayerConstants.REMOTE_WIDE_ARTWORK_FRACTION, box!!, 0.0)
            val artwork = RemoteMetrics.artworkHeight(RemoteLayout.WIDE, width, 800.0, 1.0)
            assertTrue("wide artwork $artwork does not fit its box $box at $width", artwork <= box)
        }
        // Couched, the artwork's box wraps it; upright, nothing stands beside the column.
        assertEquals(null, RemoteMetrics.besideWidth(RemoteLayout.LANDSCAPE, 844.0))
        assertEquals(null, RemoteMetrics.besideWidth(RemoteLayout.PORTRAIT, 390.0))
    }
}

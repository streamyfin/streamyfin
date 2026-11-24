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

    // Wide only when wider than tall: a tablet held upright takes the phone's layout, the artwork above the controls.
    @Test
    fun aWideScreenPutsTheArtworkBesideTheControls() {
        assertEquals(RemoteLayout.WIDE, RemoteLayout.of(1180.0, 820.0))
        assertEquals(RemoteLayout.PORTRAIT, RemoteLayout.of(820.0, 1180.0))
    }

    // Unfolded, a phone held upright keeps the phone's layout; on its side, it is wide.
    @Test
    fun aFoldedThenUnfoldedPhoneChangesLayout() {
        assertEquals(RemoteLayout.PORTRAIT, RemoteLayout.of(360.0, 800.0))
        assertEquals(RemoteLayout.PORTRAIT, RemoteLayout.of(673.0, 841.0))
        assertEquals(RemoteLayout.WIDE, RemoteLayout.of(841.0, 673.0))
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
        assertEquals(min, RemoteMetrics.artworkHeight(RemoteLayout.WIDE, 600.0, 120.0, 1.0), 0.0)
        // Nor over its maximum, on the largest tablet.
        val max = PlayerConstants.REMOTE_ARTWORK_MAX_DP
        assertEquals(max, RemoteMetrics.artworkHeight(RemoteLayout.WIDE, 1366.0, 1024.0, 1.0), 0.0)
        assertEquals(432.0, RemoteMetrics.artworkHeight(RemoteLayout.PORTRAIT, 480.0, 1600.0, 1.0), 0.0)
    }

    // Upright, a tablet's artwork grows with its screen as a phone's does: on a Pixel Tablet (800 x 1232 under the
    // bars) it stopped at 420; it now takes 90 % of the width, the share the widest phone's margins leave it. Every
    // phone keeps its size, and the wide layout its maximum.
    @Test
    fun uprightTheArtworkGrowsWithTheScreen() {
        assertEquals(720.0, RemoteMetrics.artworkHeight(RemoteLayout.PORTRAIT, 800.0, 1232.0, 1.0), 1e-9)
        for ((width, height, side) in listOf(Triple(360.0, 740.0, 312.0), Triple(411.0, 860.0, 363.0), Triple(448.0, 900.0, 400.0))) {
            assertEquals("phone $width", side, RemoteMetrics.artworkHeight(RemoteLayout.PORTRAIT, width, height, 1.0), 0.0)
        }
        val couched = RemoteMetrics.artworkHeight(RemoteLayout.WIDE, 1280.0, 752.0, 1.0)
        assertEquals(PlayerConstants.REMOTE_ARTWORK_MAX_DP, couched, 0.0)
    }

    @Test
    fun theArtworkIsNeverWiderThanItsColumn() {
        val portrait = RemoteMetrics.artworkHeight(RemoteLayout.PORTRAIT, 360.0, 1200.0, 1.0)
        assertEquals(360.0 - 2 * PlayerConstants.REMOTE_HORIZONTAL_PADDING_DP, portrait, 0.0)
        val wide = RemoteMetrics.artworkHeight(RemoteLayout.WIDE, 673.0, 841.0, 1.0)
        assertTrue("wide artwork $wide takes more than its share of 673", wide <= 673.0 * PlayerConstants.REMOTE_WIDE_ARTWORK_FRACTION)
    }

    // Wide, the artwork is centered in its share of the width. Sized to the whole share, it touched the titles beside
    // it on a tablet upright or an unfolded phone; it keeps the side margin on each side of its box.
    @Test
    fun theWideArtworkKeepsAMarginBesideTheColumn() {
        for (width in listOf(673.0, 800.0, 841.0)) {
            val box = RemoteMetrics.besideWidth(RemoteLayout.WIDE, width)!!
            val artwork = RemoteMetrics.artworkHeight(RemoteLayout.WIDE, width, 1280.0, 1.0)
            val margin = (box - artwork) / 2
            assertTrue("wide artwork $artwork leaves $margin beside the column at $width", margin >= PlayerConstants.REMOTE_HORIZONTAL_PADDING_DP)
        }
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
        // Upright, nothing stands beside the column.
        assertEquals(null, RemoteMetrics.besideWidth(RemoteLayout.PORTRAIT, 390.0))
    }

    // Couched (validated by Gauvain on the 19/11 captures): two equal halves between the side margins and the
    // gutter, the image in its own shape, as large as its half and the band under the top bar leave it (an inset
    // above and below). Measured on the Medium_Phone emulator lying down, 914 x 363 within the system bars.
    @Test
    fun couchedTheImageTakesItsShapeInTheLeftHalf() {
        assertEquals(421.0, RemoteMetrics.besideWidth(RemoteLayout.LANDSCAPE, 914.0)!!, 1e-9)
        val cases = listOf(
            // An episode's wide image is as wide as its half.
            16.0 / 9.0 to RemoteBox(421.0, 421.0 * 9 / 16),
            // A poster is as tall as the band leaves: 363 - 44 - 2 x 16.
            2.0 / 3.0 to RemoteBox(287.0 * 2 / 3, 287.0),
            // No shape known, another server's media: the square the artwork always had.
            null to RemoteBox(287.0, 287.0),
        )
        for ((ratio, expected) in cases) {
            val box = RemoteMetrics.artworkBox(RemoteLayout.LANDSCAPE, 914.0, 363.0, 1.0, ratio)
            assertEquals("width at $ratio", expected.widthDp, box.widthDp, 1e-9)
            assertEquals("height at $ratio", expected.heightDp, box.heightDp, 1e-9)
        }
        // A small phone, 640 x 360: halves of 284.
        assertEquals(284.0, RemoteMetrics.artworkBox(RemoteLayout.LANDSCAPE, 640.0, 360.0, 1.0, 16.0 / 9.0).widthDp, 1e-9)
    }

    // Couched, the band is what the top bar leaves as it is measured: at an accessibility font the target button
    // outgrows the 44 of the other buttons, and a fixed 44 pushed the image past its band (review of the 19/11).
    // Before the first measure, the 44 of its buttons.
    @Test
    fun couchedTheBandIsWhatTheMeasuredTopBarLeaves() {
        val poster = 2.0 / 3.0
        assertEquals(271.0, RemoteMetrics.artworkBox(RemoteLayout.LANDSCAPE, 914.0, 363.0, 2.0, poster, 60.0).heightDp, 1e-9)
        assertEquals(287.0, RemoteMetrics.artworkBox(RemoteLayout.LANDSCAPE, 914.0, 363.0, 2.0, poster, null).heightDp, 1e-9)
    }

    // Couched, the text stands beside the image, not above or below it: a larger font leaves the image as it is
    // (the column scrolls instead). A shape that cannot be one is the square too.
    @Test
    fun couchedTheImageIgnoresTheFontScaleAndAShapeThatIsNone() {
        val one = RemoteMetrics.artworkBox(RemoteLayout.LANDSCAPE, 914.0, 363.0, 1.0, 2.0 / 3.0)
        assertEquals(one, RemoteMetrics.artworkBox(RemoteLayout.LANDSCAPE, 914.0, 363.0, 2.0, 2.0 / 3.0))
        val square = RemoteMetrics.artworkBox(RemoteLayout.LANDSCAPE, 914.0, 363.0, 1.0, null)
        for (bad in listOf(0.0, -1.0, Double.NaN, Double.POSITIVE_INFINITY)) {
            assertEquals("shape $bad", square, RemoteMetrics.artworkBox(RemoteLayout.LANDSCAPE, 914.0, 363.0, 1.0, bad))
        }
    }

    // Upright and wide, the artwork keeps its square, whatever the image's shape: those layouts are unchanged.
    @Test
    fun uprightAndWideTheArtworkStaysASquare() {
        for ((layout, w, h) in listOf(Triple(RemoteLayout.PORTRAIT, 390.0, 844.0), Triple(RemoteLayout.WIDE, 1180.0, 820.0))) {
            val side = RemoteMetrics.artworkHeight(layout, w, h, 1.0)
            assertEquals(RemoteBox(side, side), RemoteMetrics.artworkBox(layout, w, h, 1.0, 16.0 / 9.0))
        }
    }

    // The failure and skip bands lie on the image, not on the square it sits in: a poster is narrower than its square,
    // a wide episode image shorter. Couched the box has the image's shape already; an unknown shape fills the box.
    @Test
    fun theBandsLieOnTheImageNotOnItsSquare() {
        val square = RemoteBox(300.0, 300.0)
        assertEquals(RemoteBox(200.0, 300.0), RemoteMetrics.imageSize(square, 2.0 / 3.0))
        assertEquals(RemoteBox(300.0, 168.75), RemoteMetrics.imageSize(square, 16.0 / 9.0))
        for (bad in listOf(null, 0.0, -1.0, Double.NaN, Double.POSITIVE_INFINITY)) {
            assertEquals("shape $bad", square, RemoteMetrics.imageSize(square, bad))
        }
        val couched = RemoteMetrics.artworkBox(RemoteLayout.LANDSCAPE, 914.0, 363.0, 1.0, 2.0 / 3.0)
        val image = RemoteMetrics.imageSize(couched, 2.0 / 3.0)
        assertEquals(couched.widthDp, image.widthDp, 1e-9)
        assertEquals(couched.heightDp, image.heightDp, 1e-9)
    }

    // The top bar's ink meets the margins: the chevron's 44 box has 14 of air on its left, the dots of "more" 20 on
    // their right, a track button's 22 icon 11; the TV button's pill ends at its box.
    @Test
    fun couchedTheTopBarsInkMeetsTheMargins() {
        assertEquals(14.0 to 20.0, RemoteMetrics.topBarInkInsets(RemoteTopBarEnd.MORE))
        assertEquals(14.0 to 11.0, RemoteMetrics.topBarInkInsets(RemoteTopBarEnd.TRACK_BUTTON))
        assertEquals(14.0 to 0.0, RemoteMetrics.topBarInkInsets(RemoteTopBarEnd.TARGET))
        // What ends the bar: "more" when it has a menu, else the last track button, else the TV.
        assertEquals(RemoteTopBarEnd.MORE, RemoteTopBarEnd.of(showsMore = true, trackButtons = 3))
        assertEquals(RemoteTopBarEnd.TRACK_BUTTON, RemoteTopBarEnd.of(showsMore = false, trackButtons = 1))
        assertEquals(RemoteTopBarEnd.TARGET, RemoteTopBarEnd.of(showsMore = false, trackButtons = 0))
    }
}

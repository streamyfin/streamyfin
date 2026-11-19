package expo.modules.mpvplayer.nativeplayer.remote

import expo.modules.mpvplayer.nativeplayer.remote.RemoteSlot.ARTWORK
import expo.modules.mpvplayer.nativeplayer.remote.RemoteSlot.BAR
import expo.modules.mpvplayer.nativeplayer.remote.RemoteSlot.BOTTOM_ROW
import expo.modules.mpvplayer.nativeplayer.remote.RemoteSlot.HEADER
import expo.modules.mpvplayer.nativeplayer.remote.RemoteSlot.TITLES
import expo.modules.mpvplayer.nativeplayer.remote.RemoteSlot.TRANSPORT
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

// Where each layout puts the six slots of the remote screen (design §3.1, §3.2), and the transport's sizes.
// Same cases as iOS's RemoteArrangementTests.
class RemoteArrangementTest {
    @Test
    fun uprightStacksTheSixSlotsTopToBottom() {
        val a = RemoteArrangement.of(RemoteLayout.PORTRAIT)
        assertEquals(listOf(HEADER, ARTWORK, TITLES, BAR, TRANSPORT, BOTTOM_ROW), a.column)
        assertEquals(emptyList<RemoteSlot>(), a.topBar)
        assertNull(a.beside)
        assertEquals(emptyList<RemoteSlot>(), a.bottom)
    }

    @Test
    fun couchedPutsTheTitlesAndMenusInTheTopBar() {
        val a = RemoteArrangement.of(RemoteLayout.LANDSCAPE)
        assertEquals(listOf(HEADER, TITLES, BOTTOM_ROW), a.topBar)
        assertEquals(ARTWORK, a.beside)
        assertEquals(listOf(TRANSPORT), a.column)
        assertEquals(listOf(BAR), a.bottom)
    }

    @Test
    fun wideKeepsTheUprightColumnBesideTheArtwork() {
        val a = RemoteArrangement.of(RemoteLayout.WIDE)
        assertEquals(ARTWORK, a.beside)
        assertEquals(RemoteArrangement.of(RemoteLayout.PORTRAIT).column - ARTWORK, a.column)
        assertEquals(emptyList<RemoteSlot>(), a.topBar)
        assertEquals(emptyList<RemoteSlot>(), a.bottom)
    }

    @Test
    fun everyLayoutPlacesEachSlotOnce() {
        RemoteLayout.entries.forEach { layout ->
            val a = RemoteArrangement.of(layout)
            val placed = a.topBar + listOfNotNull(a.beside) + a.column + a.bottom
            assertEquals("$layout", RemoteSlot.entries.sorted(), placed.sorted())
        }
    }

    // The column's free height, when the screen is taller than its slots: upright it splits above and below the
    // artwork, which floats in the middle of its zone while the titles, the bar, the transport and the TV's row
    // stay together at the bottom (as Spotify's player does); couched and wide it splits around the middle, so the
    // transport sits level with the artwork.
    @Test
    fun uprightLeavesTheFreeHeightAroundTheArtwork() {
        val a = RemoteArrangement.of(RemoteLayout.PORTRAIT)
        assertEquals(listOf(a.column.indexOf(ARTWORK), a.column.indexOf(TITLES)), a.spaces)
    }

    @Test
    fun couchedCentersTheTransportBesideTheArtwork() {
        val a = RemoteArrangement.of(RemoteLayout.LANDSCAPE)
        assertEquals(listOf(0, a.column.size), a.spaces)
    }

    @Test
    fun wideCentersTheMiddleBetweenTheHeaderAndTheBottomRow() {
        val a = RemoteArrangement.of(RemoteLayout.WIDE)
        assertEquals(listOf(a.column.indexOf(TITLES), a.column.indexOf(BOTTOM_ROW)), a.spaces)
    }

    @Test
    fun theTransportKeepsTheChromeSizes() {
        RemoteLayout.entries.forEach { layout ->
            val t = RemoteTransport.of(layout)
            assertEquals("$layout", listOf(44.0, 52.0, 68.0), listOf(t.sideDp, t.seekDp, t.playDp))
        }
    }

    @Test
    fun theTransportGapNarrowsOnlyUpright() {
        assertEquals(20.0, RemoteTransport.of(RemoteLayout.PORTRAIT).gapDp, 0.0)
        assertEquals(28.0, RemoteTransport.of(RemoteLayout.LANDSCAPE).gapDp, 0.0)
        assertEquals(28.0, RemoteTransport.of(RemoteLayout.WIDE).gapDp, 0.0)
    }

    @Test
    fun subtitlesLightUpOnlyForARealTrack() {
        assertEquals(true, RemoteActive.subtitlesOn(selectedIndex = 3))
        assertEquals(true, RemoteActive.subtitlesOn(selectedIndex = 0))
        assertEquals(false, RemoteActive.subtitlesOn(selectedIndex = -1))
        assertEquals(false, RemoteActive.subtitlesOn(selectedIndex = null))
    }

    // The remote "more" menu holds what the remote capabilities leave of the local one: quality and chapters. An
    // item with neither opened an empty menu, so the button is not drawn.
    @Test
    fun theMoreButtonShowsOnlyWithChaptersOrQualities() {
        assertEquals(false, RemoteMore.shows(chapters = 0, qualities = 0))
        assertEquals(true, RemoteMore.shows(chapters = 3, qualities = 0))
        assertEquals(true, RemoteMore.shows(chapters = 0, qualities = 2))
    }
}

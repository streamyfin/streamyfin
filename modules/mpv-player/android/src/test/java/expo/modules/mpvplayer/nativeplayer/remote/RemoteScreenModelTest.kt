package expo.modules.mpvplayer.nativeplayer.remote

import expo.modules.mpvplayer.cast.playback.RemotePlaybackSnapshot
import expo.modules.mpvplayer.nativeplayer.engine.RemotePhase
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

// What the remote screen shows for each state of the TV (the design's table of states). Twin:
// tests/native/RemoteScreenModelTests.swift.
class RemoteScreenModelTest {
    private fun tv(phase: RemotePhase, connected: Boolean = true, reconnecting: Boolean = false) =
        RemotePlaybackSnapshot.NONE.copy(connected = connected, phase = phase, reconnecting = reconnecting, itemId = "episode-1")

    private fun model(
        snapshot: RemotePlaybackSnapshot,
        hasNext: Boolean = false,
        reduced: Boolean = false,
        failure: String? = null,
    ) = RemoteScreenModel.of(snapshot, targetName = "Bench TV", hasNext = hasNext, reduced = reduced, failure = failure)

    @Test
    fun aPlayingTvLeavesEveryControlOn() {
        val screen = model(tv(RemotePhase.PLAYING))

        assertEquals(TargetLabel.Name("Bench TV"), screen.targetLabel)
        assertFalse(screen.controlsDimmed)
        assertTrue(screen.transportEnabled)
        assertTrue(screen.seekEnabled)
        assertTrue(screen.trackMenusEnabled)
        assertFalse(screen.playShowsSpinner)
        assertFalse(screen.nextUpVisible)
        assertNull(screen.closes)
    }

    @Test
    fun aLoadingTvSpinsInThePlayButton() {
        val screen = model(tv(RemotePhase.LOADING))

        assertTrue(screen.playShowsSpinner)
        assertTrue(screen.transportEnabled)
        assertTrue(screen.seekEnabled)
        assertNull(screen.closes)
    }

    @Test
    fun aReconnectingTvDimsTheControlsAndSaysSo() {
        val screen = model(tv(RemotePhase.PLAYING, reconnecting = true))

        assertEquals(TargetLabel.Reconnecting, screen.targetLabel)
        assertTrue(screen.controlsDimmed)
        assertFalse(screen.transportEnabled)
        assertFalse(screen.seekEnabled)
        assertFalse(screen.trackMenusEnabled)
        assertFalse(screen.playShowsSpinner)
        assertNull(screen.closes)
    }

    @Test
    fun betweenTwoItemsTheBarAndTrackMenusAreInactive() {
        val screen = model(tv(RemotePhase.BETWEEN))

        assertFalse(screen.seekEnabled)
        assertFalse(screen.trackMenusEnabled)
        assertTrue(screen.playShowsSpinner)
        assertTrue(screen.transportEnabled)
        assertNull(screen.closes)
    }

    @Test
    fun theEndOfTheListOffersTheNextEpisode() {
        val screen = model(tv(RemotePhase.ENDED), hasNext = true)

        assertTrue(screen.nextUpVisible)
        assertNull(screen.closes)
    }

    @Test
    fun aFilmThatEndsClosesThePlayer() {
        val screen = model(tv(RemotePhase.ENDED), hasNext = false)

        assertFalse(screen.nextUpVisible)
        assertEquals(RemoteClose.PLAYBACK_ENDED, screen.closes)
    }

    @Test
    fun aTvStoppedFromItsRemoteKeepsThePlayerAndOffersToResume() {
        val screen = model(tv(RemotePhase.STOPPED))

        assertNull(screen.closes)
        assertTrue(screen.transportEnabled)
        assertFalse(screen.seekEnabled)
        assertFalse(screen.playShowsSpinner)
    }

    @Test
    fun aFinishedConnectionClosesThePlayer() {
        // Whatever the TV last said, and with a next episode known: the connection is over.
        val screen = model(tv(RemotePhase.PLAYING, connected = false), hasNext = true)

        assertEquals(RemoteClose.REMOTE_ENDED, screen.closes)
        assertFalse(screen.nextUpVisible)
    }

    @Test
    fun aFailureShowsItsMessage() {
        assertEquals("Could not play there", model(tv(RemotePhase.PLAYING), failure = "Could not play there").failure)
        assertEquals("Could not play there", model(tv(RemotePhase.STOPPED, reconnecting = true), failure = "Could not play there").failure)
        assertNull(model(tv(RemotePhase.PLAYING)).failure)
    }

    @Test
    fun aReducedPlayerHasNoTrackMenus() {
        val screen = model(tv(RemotePhase.PLAYING), reduced = true)

        assertFalse(screen.trackMenusEnabled)
        assertTrue(screen.seekEnabled)
        assertTrue(screen.transportEnabled)
    }

    @Test
    fun theReasonsAreTheJsOnes() {
        assertEquals("playbackEnded", RemoteClose.PLAYBACK_ENDED.reason)
        assertEquals("remoteEnded", RemoteClose.REMOTE_ENDED.reason)
    }
}

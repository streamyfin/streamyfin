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
        canPlayHere: Boolean = false,
        sawPlayback: Boolean = true,
    ) = RemoteScreenModel.of(
        snapshot,
        targetName = "Bench TV",
        hasNext = hasNext,
        reduced = reduced,
        failure = failure,
        canPlayHere = canPlayHere,
        sawPlayback = sawPlayback,
    )

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

    // A screen opened on a TV still on the end of the item before: that end is not this screen's.
    @Test
    fun anEndTheScreenNeverSawPlayKeepsItOpen() {
        val alone = model(tv(RemotePhase.ENDED), sawPlayback = false)
        val withNext = model(tv(RemotePhase.ENDED), hasNext = true, sawPlayback = false)

        assertNull(alone.closes)
        assertNull(withNext.closes)
        assertFalse(withNext.nextUpVisible)
    }

    @Test
    fun theScreenSeesPlaybackOnceTheTvHoldsTheItem() {
        assertTrue(RemoteScreenModel.sawPlayback(false, RemotePhase.PLAYING))
        assertTrue(RemoteScreenModel.sawPlayback(false, RemotePhase.PAUSED))
        assertFalse(RemoteScreenModel.sawPlayback(false, RemotePhase.LOADING))
        assertFalse(RemoteScreenModel.sawPlayback(false, RemotePhase.ENDED))
        // A load that fails falls back to the end before: still not this screen's.
        assertFalse(RemoteScreenModel.sawPlayback(false, RemotePhase.NONE))
        assertTrue(RemoteScreenModel.sawPlayback(true, RemotePhase.ENDED))
    }

    // A new config for the item the TV holds already (JS followed it through its list): no phase change comes before
    // that item's end, so the screen counts it seen. Another item waits for its playback.
    @Test
    fun aNewConfigForTheItemTheTvPlaysHasSeenItPlay() {
        assertTrue(RemoteScreenModel.sawPlaybackOnUpdate("episode-1", tv(RemotePhase.PLAYING)))
        assertTrue(RemoteScreenModel.sawPlaybackOnUpdate("episode-1", tv(RemotePhase.PAUSED)))
        assertFalse(RemoteScreenModel.sawPlaybackOnUpdate("episode-2", tv(RemotePhase.PLAYING)))
        assertFalse(RemoteScreenModel.sawPlaybackOnUpdate("episode-1", tv(RemotePhase.ENDED)))
        assertFalse(RemoteScreenModel.sawPlaybackOnUpdate("episode-1", tv(RemotePhase.LOADING)))
        assertFalse(RemoteScreenModel.sawPlaybackOnUpdate(null, tv(RemotePhase.PLAYING)))
    }

    // A reduced config is built from what the TV holds now and carries no item id: playing, its end is this screen's.
    @Test
    fun aReducedConfigHasSeenWhatTheTvPlays() {
        val foreign = tv(RemotePhase.PLAYING).copy(itemId = null, foreign = true)
        assertTrue(RemoteScreenModel.sawPlaybackOnUpdate(null, foreign, reduced = true))
        assertTrue(RemoteScreenModel.sawPlaybackOnUpdate(null, tv(RemotePhase.PAUSED), reduced = true))
        assertFalse(RemoteScreenModel.sawPlaybackOnUpdate(null, foreign.copy(phase = RemotePhase.ENDED), reduced = true))
        assertFalse(RemoteScreenModel.sawPlaybackOnUpdate(null, foreign.copy(phase = RemotePhase.LOADING), reduced = true))
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

    // Media our server does not know (PR 6): the title, the artwork, play, pause, both skips, the bar, the TV and the
    // volume; nothing that needs the item from the server, so no menu, no list, no next episode and no Play here.
    @Test
    fun aReducedPlayerShowsOnlyTransportBarAndVolume() {
        val screen = model(tv(RemotePhase.PLAYING), hasNext = true, reduced = true, failure = "Could not play there", canPlayHere = true)

        assertFalse(screen.showsEpisodes)
        assertFalse(screen.showsTrackMenus)
        assertFalse(screen.showsMoreMenu)
        assertFalse(screen.showsPreviousNext)
        assertFalse(screen.canPlayHere)
        assertTrue(screen.transportEnabled)
        assertTrue(screen.seekEnabled)
        assertEquals(TargetLabel.Name("Bench TV"), screen.targetLabel)
        // Its end offers nothing after it and closes the screen.
        val ended = model(tv(RemotePhase.ENDED), hasNext = true, reduced = true)
        assertFalse(ended.nextUpVisible)
        assertEquals(RemoteClose.PLAYBACK_ENDED, ended.closes)
    }

    @Test
    fun aFullPlayerShowsEverything() {
        listOf(tv(RemotePhase.PLAYING), tv(RemotePhase.LOADING), tv(RemotePhase.PLAYING, reconnecting = true)).forEach { snapshot ->
            val screen = model(snapshot)
            // A TV that loads or reconnects rests the controls; it never takes them away.
            assertTrue(screen.showsEpisodes)
            assertTrue(screen.showsTrackMenus)
            assertTrue(screen.showsMoreMenu)
            assertTrue(screen.showsPreviousNext)
        }
        assertTrue(model(tv(RemotePhase.STOPPED), failure = "Could not play there", canPlayHere = true).canPlayHere)
        assertTrue(model(tv(RemotePhase.ENDED), hasNext = true).nextUpVisible)
    }

    // Play here goes with a failure that offers it, never alone.
    @Test
    fun aFailureOffersPlayHereOnlyWhenItSaysSo() {
        assertTrue(model(tv(RemotePhase.STOPPED), failure = "Could not play there", canPlayHere = true).canPlayHere)
        assertFalse(model(tv(RemotePhase.STOPPED), failure = "Could not play there").canPlayHere)
        assertFalse(model(tv(RemotePhase.STOPPED), canPlayHere = true).canPlayHere)
    }

    // A failure stays until the TV loads again or plays again: a change into loading or playing, not a TV that was
    // already there when the failure came (a timed out load still loading).
    @Test
    fun aFailureClearsWhenTheTvLoadsOrPlaysAgain() {
        assertTrue(RemoteScreenModel.failureClears(RemotePhase.STOPPED, RemotePhase.LOADING))
        assertTrue(RemoteScreenModel.failureClears(RemotePhase.PAUSED, RemotePhase.PLAYING))
        assertTrue(RemoteScreenModel.failureClears(RemotePhase.LOADING, RemotePhase.PLAYING))
        assertTrue(RemoteScreenModel.failureClears(RemotePhase.NONE, RemotePhase.LOADING))
        assertFalse(RemoteScreenModel.failureClears(RemotePhase.LOADING, RemotePhase.LOADING))
        assertFalse(RemoteScreenModel.failureClears(RemotePhase.PLAYING, RemotePhase.PLAYING))
        assertFalse(RemoteScreenModel.failureClears(RemotePhase.PLAYING, RemotePhase.PAUSED))
        assertFalse(RemoteScreenModel.failureClears(RemotePhase.LOADING, RemotePhase.STOPPED))
        assertFalse(RemoteScreenModel.failureClears(RemotePhase.PLAYING, RemotePhase.BETWEEN))
    }

    @Test
    fun theReasonsAreTheJsOnes() {
        assertEquals("playbackEnded", RemoteClose.PLAYBACK_ENDED.reason)
        assertEquals("remoteEnded", RemoteClose.REMOTE_ENDED.reason)
    }
}

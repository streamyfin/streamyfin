package expo.modules.mpvplayer.nativeplayer.remote

import org.junit.Assert.assertEquals
import org.junit.Test

// The receiver never goes back to the start of what it plays, and its queue is not the series: previous on a
// remote screen restarts the episode on the engine or asks JS for the one before, which the episode list names.
class RemoteNavigationTest {
    @Test
    fun previousPastTheFirstSecondsRestartsTheEpisode() {
        assertEquals(PreviousAction.RESTART, previousAction(positionSec = 3.5, hasPrevious = true))
        assertEquals(PreviousAction.RESTART, previousAction(positionSec = 1_200.0, hasPrevious = true))
    }

    @Test
    fun previousAtTheStartAsksForTheEpisodeBefore() {
        assertEquals(PreviousAction.PREVIOUS_ITEM, previousAction(positionSec = 0.0, hasPrevious = true))
        assertEquals(PreviousAction.PREVIOUS_ITEM, previousAction(positionSec = 3.0, hasPrevious = true))
    }

    @Test
    fun previousOnTheFirstEpisodeRestartsIt() {
        assertEquals(PreviousAction.RESTART, previousAction(positionSec = 0.0, hasPrevious = false))
    }

    @Test
    fun theNeighboursComeFromTheEpisodeList() {
        val ids = listOf("e1", "e2", "e3")
        assertEquals(EpisodeNeighbours(hasPrevious = false, hasNext = true), EpisodeNeighbours.of(ids, "e1"))
        assertEquals(EpisodeNeighbours(hasPrevious = true, hasNext = true), EpisodeNeighbours.of(ids, "e2"))
        assertEquals(EpisodeNeighbours(hasPrevious = true, hasNext = false), EpisodeNeighbours.of(ids, "e3"))
        // An item the list does not hold, or no item yet, has no neighbours: nothing to move to.
        assertEquals(EpisodeNeighbours(hasPrevious = false, hasNext = false), EpisodeNeighbours.of(ids, "film"))
        assertEquals(EpisodeNeighbours(hasPrevious = false, hasNext = false), EpisodeNeighbours.of(ids, null))
        assertEquals(EpisodeNeighbours(hasPrevious = false, hasNext = false), EpisodeNeighbours.of(emptyList(), "e1"))
    }
}

package expo.modules.mpvplayer

import org.junit.Assert.*
import org.junit.Test

class MpvLoadGenerationsTest {
    // A load as load() makes it: a generation, then the playlist entry loadfile created.
    private fun MpvLoadGenerations.load(entryId: Long): Long = begin().also { queue(it, entryId) }

    private fun playing(entryId: Long = 1): Pair<MpvLoadGenerations, Long> {
        val generations = MpvLoadGenerations()
        val generation = generations.load(entryId)
        generations.onStartFile(entryId)
        return generations to generation
    }

    @Test fun replacedFileValuesAreNotCurrentUntilTheNewFileStarts() {
        val (generations, first) = playing()
        assertEquals(first, generations.current)

        val second = generations.load(entryId = 2)
        assertNull(generations.current)
        generations.onStartFile(2)
        assertEquals(second, generations.current)
    }

    @Test fun valueReadBeforeALoadIsNotWrittenAfterIt() {
        val (generations, _) = playing()
        generations.begin()
        // load() seeded the cache with the new file's start position.
        var cachedPosition = 0.0
        val written = generations.ifCurrent { cachedPosition = 562.7 }
        assertNull(written)
        assertEquals(0.0, cachedPosition, 0.0)
    }

    @Test fun reportTakenBeforeALoadIsStaleOnDelivery() {
        val (generations, _) = playing()
        val stamped = generations.ifCurrent {}!!
        assertTrue(generations.isLatest(stamped))
        generations.begin()
        assertFalse(generations.isLatest(stamped))
    }

    @Test fun loadReplacedBeforeItsFileStartedDoesNotHoldTheNextOneBack() {
        val (generations, _) = playing()
        generations.load(entryId = 2)
        val third = generations.load(entryId = 3)
        // mpv dropped entry 2 for entry 3 before starting it: only 3 starts.
        generations.onStartFile(3)
        assertEquals(third, generations.current)

        val fourth = generations.load(entryId = 4)
        generations.onStartFile(4)
        assertEquals(fourth, generations.current)
    }

    @Test fun olderFileStartingWhileANewerLoadWaitsIsNotCurrent() {
        val (generations, _) = playing()
        generations.load(entryId = 2)
        val third = generations.load(entryId = 3)
        generations.onStartFile(2)
        assertNull(generations.current)
        generations.onStartFile(3)
        assertEquals(third, generations.current)
    }

    @Test fun startThatBeatsTheLoadToItsEntryStillCounts() {
        val (generations, _) = playing()
        val second = generations.begin()
        // The event thread saw mpv start entry 2 before load() recorded it.
        generations.onStartFile(2)
        generations.queue(second, 2)
        assertEquals(second, generations.current)
    }

    @Test fun startOfAFileNoLongerInThePlaylistChangesNothing() {
        val (generations, first) = playing()
        generations.onStartFile(null)
        assertEquals(first, generations.current)
    }

    @Test fun loadWithoutAnEntryIdStillBecomesCurrentAtTheNextStart() {
        val (generations, _) = playing()
        val second = generations.begin()
        // The entry id read after loadfile failed.
        generations.queue(second, null)
        assertNull(generations.current)
        assertTrue(generations.onStartFile(7))
        assertEquals(second, generations.current)
    }

    @Test fun startNamingAKnownLoadWinsOverOneWithoutAnEntryId() {
        val (generations, _) = playing()
        generations.queue(generations.begin(), null)
        val third = generations.load(entryId = 3)
        assertTrue(generations.onStartFile(3))
        assertEquals(third, generations.current)
    }

    @Test fun startNamingNoPendingLoadChangesNothingAndSaysSo() {
        val (generations, first) = playing()
        assertFalse(generations.onStartFile(42))
        assertEquals(first, generations.current)
    }

    @Test fun nothingIsCurrentAfterTeardownUntilTheNextLoadStarts() {
        val (generations, _) = playing()
        generations.reset()
        assertNull(generations.current)
        val next = generations.load(entryId = 2)
        assertNull(generations.current)
        generations.onStartFile(2)
        assertEquals(next, generations.current)
    }
}

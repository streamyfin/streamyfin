package expo.modules.mpvplayer

import org.junit.Assert.*
import org.junit.Test

class MpvLoadGenerationsTest {
    private fun playing(): Pair<MpvLoadGenerations, Long> {
        val generations = MpvLoadGenerations()
        val first = generations.begin()
        generations.queue(first)
        generations.onStartFile()
        return generations to first
    }

    @Test fun replacedFileValuesAreNotCurrentUntilTheNewFileStarts() {
        val (generations, first) = playing()
        assertEquals(first, generations.current)

        val second = generations.begin()
        assertNull(generations.current)
        generations.queue(second)
        assertNull(generations.current)
        generations.onStartFile()
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

    @Test fun twoLoadsBeforeAStartTakeTheirFilesInOrder() {
        val generations = MpvLoadGenerations()
        val first = generations.begin()
        generations.queue(first)
        val second = generations.begin()
        generations.queue(second)
        // mpv started the first file, but the second is already asked for.
        generations.onStartFile()
        assertNull(generations.current)
        generations.onStartFile()
        assertEquals(second, generations.current)
    }

    @Test fun startWithNoLoadQueuedKeepsTheCurrentFile() {
        val (generations, first) = playing()
        generations.onStartFile()
        assertEquals(first, generations.current)
    }

    @Test fun nothingIsCurrentAfterTeardownUntilTheNextLoadStarts() {
        val (generations, _) = playing()
        generations.reset()
        assertNull(generations.current)
        val next = generations.begin()
        generations.queue(next)
        assertNull(generations.current)
        generations.onStartFile()
        assertEquals(next, generations.current)
    }
}

package expo.modules.mpvplayer.nativeplayer.engine

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class StallWatchdogTest {
    private val watchdog = StallWatchdog(stallAfterMs = 10_000, maxReloads = 5)

    /** Starved for [ms] from [from], ticking once a second like the progress loop. */
    private fun starvedFor(from: Long, ms: Long): Boolean {
        var reloaded = false
        var now = from
        while (now <= from + ms) {
            reloaded = watchdog.shouldReload(starved = true, nowMs = now) || reloaded
            now += 1_000
        }
        return reloaded
    }

    @Test
    fun aStreamThatNeverDeliveredIsADeadServerNotAStall() {
        watchdog.onLoad(forced = false)

        assertFalse(starvedFor(from = 0, ms = 60_000))
    }

    @Test
    fun rebuildsOnceTheStallOutlastsItsDelay() {
        watchdog.onLoad(forced = false)
        watchdog.onReady()

        assertFalse(starvedFor(from = 0, ms = 9_000))
        assertTrue(watchdog.shouldReload(starved = true, nowMs = 10_000))
        assertEquals(1, watchdog.reloads)
    }

    @Test
    fun aReloadThatLandsInTheSameWedgeIsRetriedUntilTheBudgetIsSpent() {
        watchdog.onLoad(forced = false)
        watchdog.onReady()
        var now = 0L
        repeat(5) {
            assertTrue("attempt ${it + 1}", starvedFor(from = now, ms = 10_000))
            // The rebuilt player never reaches READY: the wedge holds.
            watchdog.onLoad(forced = true)
            now += 11_000
        }

        assertFalse(starvedFor(from = now, ms = 60_000))
        assertEquals(5, watchdog.reloads)
    }

    @Test
    fun aNewLoadEarnsAFreshBudget() {
        watchdog.onLoad(forced = false)
        watchdog.onReady()
        repeat(5) { starvedFor(from = it * 11_000L, ms = 10_000) }

        watchdog.onLoad(forced = false)
        watchdog.onReady()

        assertTrue(starvedFor(from = 100_000, ms = 10_000))
        assertEquals(1, watchdog.reloads)
    }

    @Test
    fun aSlowSeekIsLeftToFinishUntilMediaFlowsAgain() {
        watchdog.onLoad(forced = false)
        watchdog.onReady()

        watchdog.onSeek()
        assertFalse(starvedFor(from = 0, ms = 60_000))

        watchdog.onReady()
        assertTrue(starvedFor(from = 60_000, ms = 10_000))
    }

    @Test
    fun mediaFlowingAgainRestartsTheStallClock() {
        watchdog.onLoad(forced = false)
        watchdog.onReady()

        assertFalse(starvedFor(from = 0, ms = 8_000))
        assertFalse(watchdog.shouldReload(starved = false, nowMs = 9_000))
        assertFalse(starvedFor(from = 10_000, ms = 8_000))
    }
}

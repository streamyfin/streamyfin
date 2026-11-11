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
        watchdog.onNewLoad()

        assertFalse(starvedFor(from = 0, ms = 60_000))
    }

    @Test
    fun rebuildsOnceTheStallOutlastsItsDelay() {
        watchdog.onNewLoad()
        watchdog.onReady()

        assertFalse(starvedFor(from = 0, ms = 9_000))
        assertTrue(watchdog.shouldReload(starved = true, nowMs = 10_000))
        assertEquals(1, watchdog.reloads)
    }

    @Test
    fun aReloadThatLandsInTheSameWedgeIsRetriedUntilTheBudgetIsSpent() {
        watchdog.onNewLoad()
        watchdog.onReady()
        var now = 0L
        repeat(5) {
            assertTrue("attempt ${it + 1}", starvedFor(from = now, ms = 10_000))
            // The rebuilt player never reaches READY: the wedge holds.
            watchdog.onReload(retry = true)
            now += 11_000
        }

        assertFalse(starvedFor(from = now, ms = 60_000))
        assertEquals(5, watchdog.reloads)
    }

    @Test
    fun aNewLoadEarnsAFreshBudget() {
        watchdog.onNewLoad()
        watchdog.onReady()
        repeat(5) { starvedFor(from = it * 11_000L, ms = 10_000) }

        watchdog.onNewLoad()
        watchdog.onReady()

        assertTrue(starvedFor(from = 100_000, ms = 10_000))
        assertEquals(1, watchdog.reloads)
    }

    @Test
    fun aSlowSeekIsLeftToFinishUntilMediaFlowsAgain() {
        watchdog.onNewLoad()
        watchdog.onReady()

        watchdog.onSeek()
        assertFalse(starvedFor(from = 0, ms = 60_000))

        watchdog.onReady()
        assertTrue(starvedFor(from = 60_000, ms = 10_000))
    }

    @Test
    fun mediaFlowingAgainRestartsTheStallClock() {
        watchdog.onNewLoad()
        watchdog.onReady()

        assertFalse(starvedFor(from = 0, ms = 8_000))
        assertFalse(watchdog.shouldReload(starved = false, nowMs = 9_000))
        assertFalse(starvedFor(from = 10_000, ms = 8_000))
    }

    // Resume recovery rebuilds a pipeline that has no media yet: a slow first segment must not
    // be torn down as a stall, and the rebuild still spends no fresh budget.
    @Test
    fun aRecoveryReloadWaitsForItsFirstMedia() {
        watchdog.onNewLoad()
        watchdog.onReady()
        assertTrue(starvedFor(from = 0, ms = 10_000))

        watchdog.onReload(retry = false)
        assertFalse(starvedFor(from = 20_000, ms = 60_000))

        watchdog.onReady()
        assertTrue(starvedFor(from = 90_000, ms = 10_000))
        assertEquals(2, watchdog.reloads)
    }
}

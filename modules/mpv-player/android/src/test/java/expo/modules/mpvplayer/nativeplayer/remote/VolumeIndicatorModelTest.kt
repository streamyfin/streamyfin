package expo.modules.mpvplayer.nativeplayer.remote

import expo.modules.mpvplayer.nativeplayer.PlayerConstants
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

// The TV's level over the remote screen: shown for a moment after each change of the receiver's volume or mute,
// never for the level read as the screen opens nor without a level. Same cases as iOS's VolumeIndicatorModelTests.
class VolumeIndicatorModelTest {
    /** A clock the test moves by hand, with the delayed actions the model asked for. */
    private class FakeClock {
        var now = 0L
        private val pending = mutableListOf<Pair<Long, () -> Unit>>()

        fun schedule(delayMs: Long, action: () -> Unit): () -> Unit {
            val entry = (now + delayMs) to action
            pending += entry
            return { pending.remove(entry) }
        }

        fun advance(ms: Long) {
            now += ms
            pending.filter { it.first <= now }.forEach { entry ->
                pending.remove(entry)
                entry.second()
            }
        }
    }

    private val clock = FakeClock()
    private var shown: VolumeIndicator? = null
    private var shows = 0
    private val model = VolumeIndicatorModel(clock::schedule) {
        shown = it
        shows += 1
    }
    private val delay = PlayerConstants.REMOTE_VOLUME_INDICATOR_MS

    @Test
    fun aLevelChangeShowsTheIndicatorForAMoment() {
        model.update(0.30, muted = false)
        model.update(0.35, muted = false)
        assertEquals(VolumeIndicator(0.35, muted = false), shown)
        clock.advance(delay - 1)
        assertEquals(VolumeIndicator(0.35, muted = false), shown)
        clock.advance(1)
        assertNull(shown)
    }

    @Test
    fun anotherChangeRestartsItsDelay() {
        model.update(0.30, muted = false)
        model.update(0.35, muted = false)
        clock.advance(1000)
        model.update(0.40, muted = false)
        clock.advance(delay - 1)
        assertEquals(VolumeIndicator(0.40, muted = false), shown)
        clock.advance(1)
        assertNull(shown)
    }

    @Test
    fun aMutedTargetShowsMuted() {
        model.update(0.30, muted = false)
        model.update(0.30, muted = true)
        assertEquals(VolumeIndicator(0.30, muted = true), shown)
    }

    @Test
    fun noLevelShowsNothing() {
        model.update(null, muted = false)
        model.update(null, muted = true)
        assertNull(shown)
        assertEquals(0, shows)
        // A level lost while shown hides it at once: a fixed-volume receiver has nothing to show.
        model.update(0.30, muted = false)
        model.update(0.35, muted = false)
        model.update(null, muted = false)
        assertNull(shown)
        clock.advance(delay)
        assertNull(shown)
    }

    @Test
    fun theLevelReadAtOpeningShowsNothing() {
        model.update(0.30, muted = false)
        assertEquals(0, shows)
        // Republished unchanged (the snapshot changed for another reason): still nothing.
        model.update(0.30, muted = false)
        assertEquals(0, shows)
        // The first level after none is read like the one at opening.
        model.update(null, muted = false)
        model.update(0.50, muted = false)
        assertEquals(0, shows)
    }

    @Test
    fun closingCancelsThePendingHide() {
        model.update(0.30, muted = false)
        model.update(0.35, muted = false)
        model.close()
        val before = shows
        clock.advance(delay)
        assertEquals(before, shows)
    }

    // A hub hands a publish to a copy of its listeners: one removed while it runs is still called once.
    @Test
    fun aChangeAfterClosingShowsNothing() {
        model.update(0.30, muted = false)
        model.close()
        model.update(0.35, muted = false)
        model.update(0.40, muted = true)
        clock.advance(delay)
        assertEquals(0, shows)
        assertNull(shown)
    }
}

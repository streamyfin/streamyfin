package expo.modules.mpvplayer.nativeplayer.remote

import expo.modules.mpvplayer.cast.engine.CastEngineConstants
import expo.modules.mpvplayer.cast.engine.ManualScheduler
import expo.modules.mpvplayer.cast.engine.RecordingDelegate
import expo.modules.mpvplayer.nativeplayer.PlayerConstants
import expo.modules.mpvplayer.nativeplayer.engine.PlayerEngine
import expo.modules.mpvplayer.nativeplayer.engine.RemotePhase
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

// The fake stands in for a TV in the chrome's tests and the debug probe: a list of items on a clock that
// moves one second per progress step, with the Cast engine's transport and queue faces and no screen.
class FakeRemoteEngineTest {
    private val clock = ManualScheduler()
    private val delegate = RecordingDelegate()
    private val items = listOf(FakeRemoteItem("a", 3.0), FakeRemoteItem("b", 2.0))
    private val engine = FakeRemoteEngine(clock.schedule, { it() }, items).also { it.delegate = delegate }
    private val step = CastEngineConstants.PROGRESS_INTERVAL_MS

    // The manual clock runs only what was due when it moves: one progress step at a time.
    private fun tick(steps: Int = 1) = repeat(steps) { clock.advance(step) }

    private fun started(): FakeRemoteEngine {
        engine.start(PlayerEngine.Owner.NATIVE_SESSION) {}
        clock.advance(PlayerConstants.FAKE_REMOTE_LOAD_MS)
        return engine
    }

    @Test
    fun theFakeLoadsThenPlaysAndReportsItsPosition() {
        var started = 0
        engine.start(PlayerEngine.Owner.NATIVE_SESSION) { started += 1 }
        assertEquals(1, started)
        assertEquals(0, delegate.readyToSeek)

        clock.advance(PlayerConstants.FAKE_REMOTE_LOAD_MS)
        assertEquals(false, delegate.loadings.last())
        assertEquals(1, delegate.readyToSeek)
        assertEquals(listOf(false), delegate.pauses)
        assertEquals("a", engine.currentItemId)

        tick(2)
        assertEquals(2.0, engine.currentPosition, 0.0)
        assertEquals(3.0, engine.duration, 0.0)
        assertEquals(2.0, delegate.positions.last(), 0.0)
    }

    @Test
    fun aPauseStopsTheClock() {
        started()
        tick()
        engine.pause()
        tick(5)

        assertEquals(1.0, engine.currentPosition, 0.0)
        assertEquals(true, engine.isPausedState)
        assertEquals(listOf(false, true), delegate.pauses)

        engine.play()
        tick()
        assertEquals(2.0, engine.currentPosition, 0.0)
    }

    @Test
    fun aSeekMovesThePositionAndAnswersItsRequest() {
        started()
        engine.seekToTracked(2.5, exact = false, requestId = 7L)

        assertEquals(2.5, engine.currentPosition, 0.0)
        assertEquals(listOf(7L to 2.5), delegate.seeksCompleted)

        engine.seekBy(-1.0)
        assertEquals(1.5, engine.currentPosition, 0.0)
    }

    @Test
    fun theItemAfterTheLastEndsPlayback() {
        started()
        tick(3)
        assertEquals("b", engine.currentItemId)
        assertEquals(0.0, engine.currentPosition, 0.0)
        assertEquals(2.0, engine.duration, 0.0)
        assertEquals(0, delegate.ended)

        tick(2)
        assertEquals(1, delegate.ended)
        assertEquals(0, clock.pending)
    }

    @Test
    fun skippingMovesToTheNextItem() {
        started()
        tick()
        engine.skipToNext()
        assertEquals("b", engine.currentItemId)
        assertEquals(0.0, engine.currentPosition, 0.0)

        engine.skipToPrevious()
        assertEquals("a", engine.currentItemId)
    }

    @Test
    fun theFakeCannotChangeSpeed() {
        assertFalse(engine.canChangeSpeed)
        assertEquals(0.5, engine.targetVolume!!, 0.0)
    }

    @Test
    fun stoppingSendsNothingMore() {
        started()
        val heard = delegate.positions.size
        engine.stop()
        tick(10)
        engine.play()

        assertEquals(heard, delegate.positions.size)
        assertEquals(listOf(false), delegate.pauses)
        assertEquals(0, clock.pending)
    }

    // The phase and the scenes the remote screen is tried on.

    private fun countStateChanges(): () -> Int {
        var changes = 0
        engine.onStateChanged = { changes += 1 }
        return { changes }
    }

    @Test
    fun theFakePhaseFollowsItsList() {
        assertEquals(RemotePhase.NONE, engine.phase)
        engine.start(PlayerEngine.Owner.NATIVE_SESSION) {}
        assertEquals(RemotePhase.LOADING, engine.phase)
        clock.advance(PlayerConstants.FAKE_REMOTE_LOAD_MS)
        assertEquals(RemotePhase.PLAYING, engine.phase)
        assertEquals(listOf("a", "b"), engine.queueItemIds)
        assertEquals(0, engine.playingIndex)
        engine.pause()
        assertEquals(RemotePhase.PAUSED, engine.phase)
        engine.play()
        tick(3)
        assertEquals(1, engine.playingIndex)
        tick(2)
        assertEquals(RemotePhase.ENDED, engine.phase)
    }

    @Test
    fun theFakeTellsItsStateButNotItsTicks() {
        started()
        val changes = countStateChanges()
        tick()
        assertEquals(0, changes())
        engine.pause()
        assertEquals(1, changes())
        engine.skipToNext()
        assertEquals(2, changes())
    }

    @Test
    fun aSimulatedSuspensionSaysReconnectingUntilTheResume() {
        started()
        val changes = countStateChanges()
        engine.simulateSuspended()
        assertTrue(engine.reconnecting)
        assertEquals(1, changes())
        val heard = delegate.positions.size
        tick(2)
        assertEquals(heard, delegate.positions.size)
        engine.simulateResumed()
        assertFalse(engine.reconnecting)
        assertEquals(2, changes())
        assertEquals(2.0, delegate.positions.last(), 0.0)
    }

    @Test
    fun aSimulatedStopIsStoppedAndPlayResumesWhereItWas() {
        started()
        tick(2)
        engine.simulateStoppedFromReceiver()
        assertEquals(RemotePhase.STOPPED, engine.phase)
        assertTrue(engine.isPausedState)
        tick(3)
        assertEquals(2.0, engine.currentPosition, 0.0)
        engine.play()
        assertEquals(RemotePhase.PLAYING, engine.phase)
        assertEquals(2.0, engine.currentPosition, 0.0)
    }
}

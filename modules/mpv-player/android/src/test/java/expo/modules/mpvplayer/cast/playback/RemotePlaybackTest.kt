package expo.modules.mpvplayer.cast.playback

import expo.modules.mpvplayer.cast.engine.CastEngineConstants
import expo.modules.mpvplayer.cast.engine.ManualScheduler
import expo.modules.mpvplayer.cast.engine.RecordingDelegate
import expo.modules.mpvplayer.cast.receiver.ReceiverServer
import expo.modules.mpvplayer.cast.target.RemoteTarget
import expo.modules.mpvplayer.cast.target.RemoteTargetSnapshot
import expo.modules.mpvplayer.cast.target.TargetPhase
import expo.modules.mpvplayer.nativeplayer.PlayerConstants
import expo.modules.mpvplayer.nativeplayer.engine.PlayerEngine
import expo.modules.mpvplayer.nativeplayer.engine.RemoteEngine
import expo.modules.mpvplayer.nativeplayer.engine.RemotePhase
import expo.modules.mpvplayer.nativeplayer.remote.FakeRemoteEngine
import expo.modules.mpvplayer.nativeplayer.remote.FakeRemoteItem
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test

/** The fake TV, with every call that could reach a real one written down. */
private class RecordingRemoteEngine(private val inner: FakeRemoteEngine) : RemoteEngine by inner {
    val calls = mutableListOf<String>()

    override fun start(owner: PlayerEngine.Owner, onStarted: () -> Unit) {
        calls += "start"
        inner.start(owner, onStarted)
    }

    override fun stop() {
        calls += "stop"
        inner.stop()
    }

    override fun play() { calls += "play"; inner.play() }
    override fun pause() { calls += "pause"; inner.pause() }
    override fun togglePause() { calls += "togglePause"; inner.togglePause() }
    override fun seekTo(seconds: Double) { calls += "seekTo"; inner.seekTo(seconds) }
    override fun seekBy(seconds: Double) { calls += "seekBy"; inner.seekBy(seconds) }
    override fun skipToNext() { calls += "skipToNext"; inner.skipToNext() }
    override fun skipToPrevious() { calls += "skipToPrevious"; inner.skipToPrevious() }
    override fun setTargetVolume(level: Double) { calls += "setTargetVolume"; inner.setTargetVolume(level) }

    /** What reached the TV: everything but binding to it and letting go of it. */
    val sent get() = calls - setOf("start", "stop")
}

// The holder keeps the Cast engine with the session, not with a screen: it is born with a session and a server,
// lives through a suspension and a closed screen, and goes with the session or the account, sending nothing.
class RemotePlaybackTest {
    private val clock = ManualScheduler()
    private val made = mutableListOf<RecordingRemoteEngine>()
    private val servers = mutableListOf<ReceiverServer>()
    private val playback = RemotePlayback(engineFactory = { server ->
        servers += server
        RecordingRemoteEngine(FakeRemoteEngine(clock.schedule, { it() }, listOf(FakeRemoteItem("a", 60.0), FakeRemoteItem("b", 60.0))))
            .also { made += it }
    })
    private val published = mutableListOf<RemotePlaybackSnapshot>().also { list -> playback.addListener { list += it } }
    private val screen = RecordingDelegate()

    // The manual clock runs only what was due when it moves: one progress step at a time.
    private fun tick(steps: Int) = repeat(steps) { clock.advance(CastEngineConstants.PROGRESS_INTERVAL_MS) }

    private fun connected(): RemoteEngine {
        playback.setServer(SERVER)
        playback.targetChanged(connected = true, suspended = false)
        clock.advance(PlayerConstants.FAKE_REMOTE_LOAD_MS)
        return playback.engine!!
    }

    @Test
    fun anEngineIsBornWithTheSessionAndTheServer() {
        playback.setServer(SERVER)
        assertNull(playback.engine)
        playback.targetChanged(connected = true, suspended = false)
        assertSame(made.single(), playback.engine)
        assertEquals(listOf(SERVER), servers)
        assertEquals(listOf("start"), made.single().calls)
        assertTrue(playback.snapshot.connected)
    }

    @Test
    fun noServerMeansNoEngine() {
        playback.targetChanged(connected = true, suspended = false)
        assertNull(playback.engine)
        assertTrue(made.isEmpty())
        assertFalse(playback.snapshot.connected)
        assertEquals(RemotePhase.NONE, playback.snapshot.phase)
    }

    @Test
    fun theEngineDiesWithTheSession() {
        connected()
        playback.targetChanged(connected = false, suspended = false)
        assertNull(playback.engine)
        assertEquals(listOf("start", "stop"), made.single().calls)
        assertFalse(playback.snapshot.connected)
        assertEquals(RemotePhase.NONE, playback.snapshot.phase)
        assertFalse(published.last().connected)
    }

    @Test
    fun aSuspensionKeepsTheEngine() {
        val engine = connected()
        playback.targetChanged(connected = true, suspended = true)
        assertSame(engine, playback.engine)
        assertTrue(playback.snapshot.connected)
        assertTrue(playback.snapshot.reconnecting)
        assertTrue(published.last().reconnecting)
        playback.targetChanged(connected = true, suspended = false)
        assertSame(engine, playback.engine)
        assertFalse(playback.snapshot.reconnecting)
        assertEquals(1, made.size)
        assertEquals(listOf("start"), made.single().calls)
    }

    @Test
    fun closingTheScreenSendsNothingAndKeepsTheEngine() {
        val engine = connected()
        assertSame(engine, playback.attachScreen(screen))
        playback.detachScreen(screen)
        assertSame(engine, playback.engine)
        assertEquals(emptyList<String>(), made.single().sent)
        assertEquals(listOf("start"), made.single().calls)
        // Detached, the screen hears nothing more.
        val heard = screen.positions.size
        tick(5)
        assertEquals(heard, screen.positions.size)
    }

    @Test
    fun anAttachedScreenIsBroughtUpToDateAtOnce() {
        connected()
        tick(3)
        playback.attachScreen(screen)
        assertEquals(listOf(false), screen.loadings)
        assertEquals(listOf(false), screen.pauses)
        assertEquals(listOf(3.0), screen.positions)
        assertEquals(1, screen.readyToSeek)
        tick(1)
        assertEquals(4.0, screen.positions.last(), 0.0)
    }

    @Test
    fun theSnapshotFollowsTheEngineState() {
        val engine = connected()
        assertEquals(RemotePhase.PLAYING, published.last().phase)
        assertEquals("a", published.last().itemId)
        assertEquals(listOf("a", "b"), published.last().queueItemIds)
        assertEquals(0, published.last().playingIndex)
        tick(2)
        engine.pause()
        assertEquals(RemotePhase.PAUSED, published.last().phase)
        assertEquals(2.0, published.last().positionSec, 0.0)
        assertEquals(60.0, published.last().durationSec, 0.0)
        assertTrue(published.last().connected)
    }

    @Test
    fun aPositionTickPublishesNoSnapshot() {
        connected()
        val count = published.size
        tick(5)
        assertEquals(count, published.size)
        assertEquals(5.0, playback.snapshot.positionSec, 0.0)
    }

    @Test
    fun aSignOutDropsTheEngineWithoutStoppingTheTv() {
        connected()
        playback.attachScreen(screen)
        playback.setServer(null)
        assertNull(playback.engine)
        assertEquals(listOf("start", "stop"), made.single().calls)
        assertFalse(playback.snapshot.connected)
        assertFalse(published.last().connected)
    }

    // The hub's state, read as a session: connected, or suspended while the SDK tries to resume it.
    @Test
    fun theHubStateTellsWhetherASessionHolds() {
        val target = RemoteTarget(kind = "cast", id = "tv", name = "TV", volume = true)
        fun of(phase: TargetPhase, reconnecting: Boolean) =
            RemotePlayback.sessionOf(RemoteTargetSnapshot(phase, target, reconnecting = reconnecting, error = null))
        assertEquals(true to false, of(TargetPhase.CONNECTED, reconnecting = false))
        assertEquals(true to true, of(TargetPhase.CONNECTING, reconnecting = true))
        assertEquals(false to false, of(TargetPhase.CONNECTING, reconnecting = false))
        assertEquals(false to false, of(TargetPhase.ENDING, reconnecting = false))
        assertEquals(false to false, RemotePlayback.sessionOf(RemoteTargetSnapshot.NONE))
    }

    // A tier 1 build's fake receivers have no TV behind them: the fake engine plays for them.
    @Test
    fun theFakeReceiversPlayOnTheFakeEngine() {
        val fake = RecordingRemoteEngine(FakeRemoteEngine(clock.schedule, { it() }))
        val real = RecordingRemoteEngine(FakeRemoteEngine(clock.schedule, { it() }))
        assertSame(fake, RemotePlayback.factoryFor(fake = true, real = { real }, fakeEngine = { fake })(SERVER))
        assertSame(real, RemotePlayback.factoryFor(fake = false, real = { real }, fakeEngine = { fake })(SERVER))
    }

    private companion object {
        val SERVER = ReceiverServer("https://jellyfin.example.test", "tok-123", "user-1", "Living Room TV")
    }
}

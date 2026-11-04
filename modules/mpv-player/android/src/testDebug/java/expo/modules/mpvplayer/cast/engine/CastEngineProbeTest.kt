package expo.modules.mpvplayer.cast.engine

import expo.modules.mpvplayer.cast.FakeChannelPort
import expo.modules.mpvplayer.cast.ReceiverChannelHub
import expo.modules.mpvplayer.cast.receiver.ReceiverItem
import expo.modules.mpvplayer.cast.receiver.ReceiverPlayRequest
import expo.modules.mpvplayer.cast.receiver.ReceiverProtocol
import expo.modules.mpvplayer.cast.receiver.ReceiverServer
import expo.modules.mpvplayer.nativeplayer.engine.PlayerEngine
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

// The debug probe on the real engine and fake ports: each step reaches the receiver through the
// channel the engine picks for it, in the order and at the offsets the device proof reads them
// (e2e/suites/cast/README.md, "Cast engine probe").
@RunWith(RobolectricTestRunner::class)
class CastEngineProbeTest {
    private val ns = ReceiverProtocol.NAMESPACE
    private val hub = ReceiverChannelHub()
    private val port = FakeChannelPort()
    private val media = FakeMedia()
    private val session = FakeSession(media = media)
    private val source = FakeSource(session)
    private val scheduler = ManualScheduler()
    private val logs = mutableListOf<String>()

    private fun engine(server: ReceiverServer = SERVER) = CastEngine(server, source, hub, scheduler.schedule, { it() }, logs::add)

    // A second at a time, as the device runs it: what a step schedules falls due on the way.
    private fun runFor(ms: Long) = repeat((ms / 1_000).toInt()) { scheduler.advance(1_000) }

    @Test
    fun runsEveryStepOnTheRealEngineInOrder() {
        hub.attach(port)
        val engine = engine().also { it.start(PlayerEngine.Owner.NATIVE_SESSION) {} }
        media.report(snapshot(), 42_500)
        CastEngineProbeScript(engine, SERVER, scheduler.schedule, logs::add).run()
        runFor(80_000)

        assertEquals(listOf("pause", "play"), media.calls)
        // No status follows the reloads, so the position they hold stays at 42.5.
        assertEquals(listOf(72_500L, 72_500L), media.seeks)
        assertEquals(2, session.volumes.size)
        assertEquals(0.4, session.volumes[0], 1e-9)
        assertEquals(0.5, session.volumes[1], 1e-9)
        val sent = port.sent.map { (_, text) -> JSONObject(text) }
        assertEquals(listOf("SetAudioStreamIndex", "SetSubtitleStreamIndex", "PlayNow", "NextTrack"), sent.map { it.getString("command") })
        assertEquals(192_000L, sent[2].getLong("maxBitrate"))
        assertEquals("ms-1", sent[2].getJSONObject("options").getString("mediaSourceId"))
        assertNull(media.listener)
        assertEquals(CastEngineProbeScript.STEPS.map { "step ${it.second}" }, logs.filter { it.startsWith("step ") })
        assertFalse(logs.any { "tok-123" in it })
    }

    // Without an item in the PlayNow, nothing tells the TV's media from what JS loaded: no script.
    @Test
    fun aPlayNowWithoutAnItemNeverStartsTheScript() {
        hub.attach(port)
        CastEngineProbe(hub, { server -> engine(server) }, scheduler.schedule, logs::add).arm()
        hub.send(ns, ReceiverProtocol.message("PlayNow", SERVER, JSONObject().put("items", JSONArray())).toString()) {}
        scheduler.advance(0)
        media.report(snapshot(customData = null), 10_000)
        runFor(10_000)
        assertFalse(logs.any { it.startsWith("step ") })
    }

    @Test
    fun theFirstPlayNowJsSendsBindsOneEngineThatRunsTheScriptAtThatItem() {
        hub.attach(port)
        val made = mutableListOf<ReceiverServer>()
        CastEngineProbe(hub, { server -> made += server; engine(server) }, scheduler.schedule, logs::add).arm()
        val playNow = ReceiverProtocol.playNow(SERVER, ReceiverPlayRequest(items = listOf(ReceiverItem(id = "item-1")))).toString()
        hub.send(ns, playNow) {}
        hub.send(ns, playNow) {}
        scheduler.advance(0)

        // One engine per arming, on the server the message named.
        assertEquals(listOf(SERVER), made)
        assertTrue(media.listener != null)
        // What the TV played before is not the item JS loads.
        media.report(snapshot(customData = ours("itemId" to "item-0", "playSessionId" to "ps-0")), 10_000)
        scheduler.advance(5_000)
        assertEquals(emptyList<String>(), media.calls)
        media.report(snapshot(), 42_500)
        scheduler.advance(5_000)
        assertEquals(listOf("pause"), media.calls)
        runFor(75_000)

        // The detach step ends the run: the engine lets go and the hub stops reporting sends.
        assertNull(media.listener)
        assertNull(hub.sendObserver)
        assertEquals(
            listOf("PlayNow", "PlayNow", "SetAudioStreamIndex", "SetSubtitleStreamIndex", "PlayNow", "NextTrack").map { "bus sent $it" },
            logs.filter { it.startsWith("bus sent ") },
        )
        assertFalse(logs.any { "tok-123" in it })
    }

    // An item the receiver never plays (a PlaybackInfo error, a TV that cannot reach the server) left
    // the probe armed, its engine bound, until the session ended: every later arming said so.
    @Test
    fun anItemThatNeverPlaysDisarmsTheProbe() {
        hub.attach(port)
        val probe = CastEngineProbe(hub, { server -> engine(server) }, scheduler.schedule, logs::add)
        probe.arm()
        hub.send(ns, ReceiverProtocol.playNow(SERVER, ReceiverPlayRequest(items = listOf(ReceiverItem(id = "item-1")))).toString()) {}
        scheduler.advance(0)
        runFor(CastEngineConstants.LOAD_TIMEOUT_MS + 5_000)

        assertFalse(probe.isActive)
        assertNull(media.listener)
        assertTrue("item never played" in logs)
    }
}

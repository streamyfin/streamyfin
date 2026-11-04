package expo.modules.mpvplayer.cast.target

import expo.modules.mpvplayer.cast.engine.ManualScheduler
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

// The debug probe on the real hub and a fake port: the lines it logs are what the device proof reads
// (e2e/suites/cast/README.md, "Remote target probe"), so their order and their end matter.
class CastTargetProbeTest {
    private val livingRoom = TargetDevice("device-a", "Living room", "Chromecast")
    private val bedroom = TargetDevice("device-b", "Bedroom", "Google TV Streamer")
    private val scheduler = ManualScheduler()
    private val logs = mutableListOf<String>()

    private fun probe(hub: RemoteTargetHub, name: String, keep: Boolean = false, holdMs: Long = CastTargetProbe.CONNECTED_HOLD_MS) =
        CastTargetProbe(hub, name, keep, holdMs, scheduler.schedule, logs::add)

    private fun hubWith(port: FakeTargetPort) = RemoteTargetHub().also { it.install(port) }

    @Test
    fun connectsHoldsThenDisconnectsTheNamedDevice() {
        val port = FakeTargetPort()
        val hub = hubWith(port)
        val probe = probe(hub, "bed")

        probe.start()
        assertTrue(port.discovering)
        port.discover(listOf(livingRoom, bedroom))
        scheduler.advance(CastTargetProbe.PARTIAL_MATCH_SETTLE_MS)
        port.emit("starting", bedroom)
        port.emit("started", bedroom)
        scheduler.advance(CastTargetProbe.CONNECTED_HOLD_MS)
        port.emit("ending", bedroom)
        port.emit("ended", bedroom)

        assertEquals(listOf(bedroom), port.connects)
        assertEquals(listOf(true), port.disconnects)
        assertEquals(
            listOf(
                "armed for \"bed\" state=none target=- reconnecting=false error=-",
                "found Bedroom",
                "state=connecting target=Bedroom reconnecting=false error=-",
                "state=connected target=Bedroom reconnecting=false error=-",
                "disconnecting",
                "state=ending target=Bedroom reconnecting=false error=-",
                "state=none target=- reconnecting=false error=-",
                "done",
            ),
            logs,
        )
        assertFalse(probe.isActive)
        assertFalse(port.discovering)
    }

    // The bench has "Salon" and "Salon - Chromecast": a name that is a whole device name means that device.
    @Test
    fun aWholeNameWinsOverAPartOfAnother() {
        val chromecast = TargetDevice("device-c", "Salon - Chromecast")
        val streamer = TargetDevice("device-s", "Salon")
        val port = FakeTargetPort()
        probe(hubWith(port), "salon").start()

        port.discover(listOf(chromecast, streamer))

        assertEquals(listOf(streamer), port.connects)
    }

    // iOS lists receivers one at a time: a part of a name waits for the whole name to show up.
    @Test
    fun aPartOfANameWaitsForTheWholeName() {
        val chromecast = TargetDevice("device-c", "Salon - Chromecast")
        val streamer = TargetDevice("device-s", "Salon")
        val port = FakeTargetPort()
        probe(hubWith(port), "salon").start()

        port.discover(listOf(chromecast))
        assertTrue(port.connects.isEmpty())
        port.discover(listOf(chromecast, streamer))

        assertEquals(listOf(streamer), port.connects)
    }

    @Test
    fun aPartOfANameConnectsOnceDiscoverySettles() {
        val port = FakeTargetPort()
        probe(hubWith(port), "living").start()

        port.discover(listOf(livingRoom))
        assertTrue(port.connects.isEmpty())
        scheduler.advance(CastTargetProbe.PARTIAL_MATCH_SETTLE_MS)

        assertEquals(listOf(livingRoom), port.connects)
    }

    // On iOS the SDK resumed the session after a relaunch while a probe watched for another name.
    @Test
    fun aConnectionToAnotherReceiverIsNotTheProbes() {
        val port = FakeTargetPort()
        val probe = probe(hubWith(port), "kitchen")

        probe.start()
        port.emit("started", livingRoom)
        scheduler.advance(CastTargetProbe.DISCOVERY_TIMEOUT_MS)

        assertTrue(port.disconnects.isEmpty())
        assertEquals("failed: no device named \"kitchen\"", logs.last())
        assertFalse(probe.isActive)
    }

    @Test
    fun aDeviceDiscoveryNeverListsFails() {
        val port = FakeTargetPort()
        val probe = probe(hubWith(port), "kitchen")

        probe.start()
        port.discover(listOf(livingRoom))
        scheduler.advance(CastTargetProbe.DISCOVERY_TIMEOUT_MS)

        assertEquals("failed: no device named \"kitchen\"", logs.last())
        assertTrue(port.connects.isEmpty())
        assertFalse(probe.isActive)
        assertFalse(port.discovering)
    }

    @Test
    fun aConnectionTheSdkRefusesFailsWithItsError() {
        val port = FakeTargetPort()
        val probe = probe(hubWith(port), "Living room")

        probe.start()
        port.discover(listOf(livingRoom))
        port.emit("startFailed", livingRoom, "timeout")

        assertEquals("failed: connection failed error=timeout", logs.last())
        assertFalse(probe.isActive)
    }

    @Test
    fun aConnectionThatNeverLandsFails() {
        val port = FakeTargetPort()
        val probe = probe(hubWith(port), "Living room")

        probe.start()
        port.discover(listOf(livingRoom))
        scheduler.advance(CastTargetProbe.CONNECT_TIMEOUT_MS)

        assertEquals("failed: never connected", logs.last())
        assertFalse(probe.isActive)
    }

    @Test
    fun aSessionThatNeverEndsFails() {
        val port = FakeTargetPort()
        val probe = probe(hubWith(port), "Living room")

        probe.start()
        port.discover(listOf(livingRoom))
        port.emit("started", livingRoom)
        scheduler.advance(CastTargetProbe.CONNECTED_HOLD_MS)
        scheduler.advance(CastTargetProbe.END_TIMEOUT_MS)

        assertEquals("failed: never ended", logs.last())
        assertFalse(probe.isActive)
    }

    @Test
    fun keepLeavesTheSessionUp() {
        val port = FakeTargetPort()
        val probe = probe(hubWith(port), "Living room", keep = true)

        probe.start()
        port.discover(listOf(livingRoom))
        port.emit("started", livingRoom)
        scheduler.advance(CastTargetProbe.CONNECTED_HOLD_MS + CastTargetProbe.END_TIMEOUT_MS)

        assertTrue(port.disconnects.isEmpty())
        assertEquals("done, still connected", logs.last())
        assertFalse(probe.isActive)
    }

    // A switch: the old session ends, with no error, before the asked receiver starts.
    @Test
    fun aSwitchFromAnotherReceiverWaitsThroughItsEnd() {
        val port = FakeTargetPort(atStart = listOf(Triple("resumed", livingRoom, null)))
        val probe = probe(hubWith(port), "Bedroom", keep = true)

        probe.start()
        port.discover(listOf(livingRoom, bedroom))
        port.emit("ending", livingRoom)
        port.emit("ended", livingRoom)
        port.emit("starting", bedroom)
        port.emit("started", bedroom)

        assertEquals(listOf(bedroom), port.connects)
        assertEquals("done, still connected", logs.last())
        assertTrue(logs.none { it.startsWith("failed") })
    }

    // The receiver-loss proof: the hold leaves time to cut the network, and the run logs how it ends.
    @Test
    fun aSessionLostDuringALongHoldLogsItsEnd() {
        val port = FakeTargetPort()
        val probe = probe(hubWith(port), "Living room", holdMs = 60_000)

        probe.start()
        port.discover(listOf(livingRoom))
        port.emit("started", livingRoom)
        scheduler.advance(59_999)
        assertTrue(port.disconnects.isEmpty())
        port.emit("suspended", null)
        port.emit("ended", null, "network")

        assertEquals(
            listOf(
                "state=connecting target=Living room reconnecting=true error=-",
                "state=none target=- reconnecting=false error=network",
                "done",
            ),
            logs.takeLast(3),
        )
        assertFalse(probe.isActive)
    }

    // The relaunch proof: the SDK resumed the session before the probe, which reads it at once.
    @Test
    fun aSessionRunningAtArmingIsReadAsConnected() {
        val port = FakeTargetPort(atStart = listOf(Triple("resumed", livingRoom, null)))
        val probe = probe(hubWith(port), "Living room", keep = true)

        probe.start()

        assertEquals(
            listOf(
                "armed for \"Living room\" state=connected target=Living room reconnecting=false error=-",
                "already connected to Living room",
                "done, still connected",
            ),
            logs,
        )
        assertTrue(port.connects.isEmpty())
    }

    // On the bench: connected to "Salon - Chromecast", the probe asked for "Salon" switches to the Streamer.
    @Test
    fun aPartOfTheConnectedNameStillLooksForAWholeOne() {
        val chromecast = TargetDevice("device-c", "Salon - Chromecast")
        val streamer = TargetDevice("device-s", "Salon")
        val port = FakeTargetPort(atStart = listOf(Triple("resumed", chromecast, null)))
        probe(hubWith(port), "Salon", keep = true).start()

        port.discover(listOf(chromecast, streamer))

        assertEquals(listOf(streamer), port.connects)
        assertTrue(logs.none { it.startsWith("already connected") })
    }

    @Test
    fun aPartOfANameThatIsTheConnectedReceiverEndsAtOnce() {
        val port = FakeTargetPort(atStart = listOf(Triple("resumed", livingRoom, null)))
        probe(hubWith(port), "living", keep = true).start()

        port.discover(listOf(livingRoom))
        scheduler.advance(CastTargetProbe.PARTIAL_MATCH_SETTLE_MS)

        assertTrue(port.connects.isEmpty())
        assertEquals(listOf("found Living room", "already connected to Living room", "done, still connected"), logs.takeLast(3))
    }
}

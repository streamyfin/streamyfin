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

    private fun probe(
        hub: RemoteTargetHub,
        name: String,
        keep: Boolean = false,
        holdMs: Long = CastTargetProbe.CONNECTED_HOLD_MS,
        back: Boolean = false,
        stop: Boolean = true,
        volume: Double? = null,
        mute: Boolean? = null,
    ) = CastTargetProbe(hub, name, keep, holdMs, back, stop, volume, mute, scheduler.schedule, logs::add)

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

    // The header's Cast button starts discovery when it mounts and never stops it: a probe's end kept it off.
    @Test
    fun aProbeLeavesTheDiscoveryTheAppAsked() {
        val port = FakeTargetPort()
        val hub = hubWith(port)
        hub.startDiscovery(RemoteTargetHub.APP_DISCOVERY)
        val probe = probe(hub, "kitchen")

        probe.start()
        scheduler.advance(CastTargetProbe.DISCOVERY_TIMEOUT_MS)

        assertFalse(probe.isActive)
        assertTrue(port.discovering)
    }

    // The bench proof of a switch asked back: the receiver held when the probe started is asked again
    // before the switch has ended its session, and the probe ends connected to it.
    @Test
    fun aProbeAskedToGoBackEndsOnTheReceiverItLeft() {
        val port = FakeTargetPort(known = listOf(livingRoom, bedroom))
        val hub = hubWith(port)
        port.emit("started", livingRoom)
        val probe = probe(hub, "Bedroom", keep = true, back = true)

        probe.start()
        port.discover(listOf(livingRoom, bedroom))
        port.emit("ending", livingRoom)
        port.emit("ended", livingRoom, "Cast session status code 2155 (2155)")
        port.emit("starting", livingRoom)
        port.emit("started", livingRoom)

        assertEquals(listOf(bedroom, livingRoom), port.connects)
        assertEquals(
            listOf(
                "found Bedroom",
                "asking Living room again",
                "state=ending target=Living room reconnecting=false error=-",
                "state=connecting target=Living room reconnecting=false error=-",
                "state=connected target=Living room reconnecting=false error=-",
                "done, still connected",
            ),
            logs.drop(1),
        )
        assertFalse(probe.isActive)
    }

    // A refused switch used to publish nothing: the probe waited 30 s and said "never connected".
    @Test
    fun aRefusedSwitchFailsTheProbeWithItsCause() {
        val port = FakeTargetPort(known = listOf(livingRoom, bedroom), refuses = setOf(bedroom.id))
        val hub = hubWith(port)
        port.emit("started", livingRoom)
        val probe = probe(hub, "Bedroom")

        probe.start()
        port.discover(listOf(livingRoom, bedroom))

        assertFalse(probe.isActive)
        assertEquals("failed: connection failed error=refused", logs.last())
    }

    // Finished inside its first request, the probe must not go on to ask the receiver it was leaving.
    @Test
    fun aProbeThatFinishedInsideTheRequestAsksNothingMore() {
        val port = FakeTargetPort(known = listOf(livingRoom, bedroom), refuses = setOf(bedroom.id))
        val hub = hubWith(port)
        port.emit("started", livingRoom)
        val probe = probe(hub, "Bedroom", back = true)

        probe.start()
        port.discover(listOf(livingRoom, bedroom))

        assertEquals(listOf(bedroom), port.connects)
        assertFalse(probe.isActive)
    }

    @Test
    fun aBackWithTheHeldReceiverUnlistedAsksNothing() {
        val port = FakeTargetPort(known = listOf(livingRoom, bedroom))
        val hub = hubWith(port)
        port.emit("started", livingRoom)
        val probe = probe(hub, "Bedroom", back = true)

        probe.start()
        port.discover(listOf(bedroom))

        assertTrue(port.connects.isEmpty())
        assertEquals("failed: Living room is not listed, nothing to go back to", logs.last())
    }

    // The app switched receivers during the hold: the session is no longer the probe's to end.
    @Test
    fun theHoldLeavesASessionTheProbeDidNotOpen() {
        val port = FakeTargetPort(known = listOf(livingRoom, bedroom))
        val hub = hubWith(port)
        val probe = probe(hub, "Living room")

        probe.start()
        port.discover(listOf(livingRoom, bedroom))
        port.emit("started", livingRoom)
        hub.connect(bedroom.id)
        port.emit("ending", livingRoom)
        port.emit("ended", livingRoom, "Cast session status code 2155 (2155)")
        port.emit("started", bedroom)
        scheduler.advance(CastTargetProbe.CONNECTED_HOLD_MS)

        assertTrue(port.disconnects.isEmpty())
        assertEquals("failed: the session went to Bedroom", logs.last())
    }

    // Armed on the receiver already connected, the probe holds that session and ends it: the hold's check
    // took it for another receiver's session, since that path never named the probe's device (bench, 04/11).
    @Test
    fun aProbeArmedOnItsConnectedReceiverHoldsThenEndsIt() {
        val port = FakeTargetPort(known = listOf(livingRoom))
        val hub = hubWith(port)
        port.emit("started", livingRoom)
        val probe = probe(hub, "Living room")

        probe.start()
        scheduler.advance(CastTargetProbe.CONNECTED_HOLD_MS)

        assertEquals(listOf(true), port.disconnects)
        assertEquals("disconnecting", logs.last())
        assertTrue(probe.isActive)
    }

    // The output sheet's "Disconnect" leaves the TV playing: the probe ends a session the same way.
    @Test
    fun aProbeAskedNotToStopLeavesTheReceiver() {
        val port = FakeTargetPort(known = listOf(livingRoom))
        val hub = hubWith(port)
        port.emit("started", livingRoom)
        probe(hub, "Living room", stop = false).start()

        scheduler.advance(CastTargetProbe.CONNECTED_HOLD_MS)

        assertEquals(listOf(false), port.disconnects)
        assertEquals("disconnecting without stopping the receiver", logs.last())
    }

    @Test
    fun aProbeAskedToMuteMutes() {
        val port = FakeTargetPort(known = listOf(livingRoom))
        val hub = hubWith(port)
        port.emit("started", livingRoom)
        probe(hub, "Living room", mute = true).start()

        assertEquals(listOf(true), port.mutes)
        assertEquals("setting the mute to true", logs.last())
    }

    // The volume proof reads the level the receiver reports back, not the one asked.
    @Test
    fun aProbeAskedForAVolumeSetsIt() {
        val port = FakeTargetPort(known = listOf(livingRoom))
        val hub = hubWith(port)
        port.emit("started", livingRoom)
        probe(hub, "Living room", volume = 0.4).start()

        assertEquals(listOf(0.4), port.volumes)
        assertEquals("setting the volume to 0.40", logs.last())
        port.events?.volumeChanged(0.4, false)
        assertEquals("volume=0.40 muted=false", logs.last())
    }

    // A part of a name whose receiver left before the settle ended must not keep a later one waiting.
    @Test
    fun aPartialMatchThatLeftCanSettleAgain() {
        val port = FakeTargetPort()
        probe(hubWith(port), "living").start()

        port.discover(listOf(livingRoom))
        port.discover(emptyList())
        scheduler.advance(CastTargetProbe.PARTIAL_MATCH_SETTLE_MS)
        port.discover(listOf(livingRoom))
        scheduler.advance(CastTargetProbe.PARTIAL_MATCH_SETTLE_MS)

        assertEquals(listOf(livingRoom), port.connects)
    }

    // The SDK port lists the receivers it knows inside startDiscovery, so the probe connects there: the
    // discovery timeout set after it replaced the connection's, and a slow connection failed as an unknown name.
    @Test
    fun aReceiverListedWhileDiscoveryStartsKeepsTheConnectionWait() {
        val port = FakeTargetPort(known = listOf(bedroom), listsOnDiscovery = true)
        val probe = probe(hubWith(port), "Bedroom")

        probe.start()
        port.emit("starting", bedroom)
        scheduler.advance(CastTargetProbe.DISCOVERY_TIMEOUT_MS + 1_000)
        port.emit("started", bedroom)

        assertEquals(listOf(bedroom), port.connects)
        assertTrue(probe.isActive)
        assertTrue(logs.none { it.startsWith("failed") })
        assertTrue("state=connected target=Bedroom reconnecting=false error=-" in logs)
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

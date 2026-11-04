package expo.modules.mpvplayer.cast.target

import expo.modules.mpvplayer.cast.engine.ManualScheduler
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

// The fake receivers of a tier 1 build: they must walk the hub through the same states a real
// receiver does, at a pace the flows can see. The same cases as RemoteTargetTests.swift.
class FakeCastDevicesTest {
    private val scheduler = ManualScheduler()
    private val tv = FakeCastDevices.DEVICES[0]
    private val speaker = FakeCastDevices.DEVICES[1]

    private class Events : TargetPortEvents {
        val sessions = mutableListOf<String>()
        val deviceLists = mutableListOf<List<TargetDevice>>()

        override fun sessionEvent(event: String, device: TargetDevice?, error: String?) {
            sessions += "$event ${device?.name ?: "-"} ${error ?: "-"}"
        }

        override fun devicesChanged(devices: List<TargetDevice>) {
            deviceLists += devices
        }
    }

    private fun started(events: Events) = FakeCastDevices(scheduler.schedule).also { it.start(events) }

    @Test
    fun theFakeReceiverEchoesTheVolume() {
        val hub = RemoteTargetHub().also { it.install(FakeCastDevices(scheduler.schedule)) }
        hub.startDiscovery(RemoteTargetHub.APP_DISCOVERY)
        hub.connect(tv.id)
        scheduler.advance(RemoteTargetConstants.FAKE_CONNECT_DELAY_MS)

        hub.setVolume(0.4)
        val before = hub.snapshot.volume
        scheduler.advance(RemoteTargetConstants.FAKE_VOLUME_ECHO_MS)

        assertEquals(null, before)
        assertEquals(0.4, hub.snapshot.volume)
    }

    // A switch inside the echo's delay must not report the TV's level on the speaker's session.
    @Test
    fun aSwitchDropsThePendingVolumeEcho() {
        val hub = RemoteTargetHub().also { it.install(FakeCastDevices(scheduler.schedule)) }
        hub.startDiscovery(RemoteTargetHub.APP_DISCOVERY)
        hub.connect(tv.id)
        scheduler.advance(RemoteTargetConstants.FAKE_CONNECT_DELAY_MS)

        hub.setVolume(0.3)
        hub.connect(speaker.id)
        scheduler.advance(RemoteTargetConstants.FAKE_CONNECT_DELAY_MS)

        assertEquals(speaker.id, hub.snapshot.target?.id)
        assertEquals(null, hub.snapshot.volume)
    }

    @Test
    fun theBenchSpeakerHasNoScreen() {
        assertTrue(tv.videoOut)
        assertEquals(false, speaker.videoOut)
    }

    @Test
    fun discoveryListsTheTwoBenchDevices() {
        val events = Events()
        val port = started(events)

        port.startDiscovery()

        assertEquals(listOf("Bench TV", "Bench Speaker"), port.devices().map { it.name })
        assertEquals(listOf(FakeCastDevices.DEVICES), events.deviceLists)
    }

    @Test
    fun aConnectionStartsThenStartedAfterItsDelay() {
        val events = Events()
        val port = started(events)

        port.connect(tv)
        assertEquals(listOf("starting Bench TV -"), events.sessions)
        scheduler.advance(RemoteTargetConstants.FAKE_CONNECT_DELAY_MS - 1)
        assertEquals(1, events.sessions.size)
        scheduler.advance(1)

        assertEquals(listOf("starting Bench TV -", "started Bench TV -"), events.sessions)
    }

    @Test
    fun aDisconnectEndsWithoutError() {
        val events = Events()
        val port = started(events)
        port.connect(tv)
        scheduler.advance(RemoteTargetConstants.FAKE_CONNECT_DELAY_MS)

        port.disconnect(stopPlayback = true)
        scheduler.advance(RemoteTargetConstants.FAKE_END_DELAY_MS)

        assertEquals(listOf("ending Bench TV -", "ended Bench TV -"), events.sessions.drop(2))
    }

    @Test
    fun anotherDeviceEndsTheFirstBeforeItStarts() {
        val events = Events()
        val port = started(events)
        port.connect(tv)
        scheduler.advance(RemoteTargetConstants.FAKE_CONNECT_DELAY_MS)

        port.connect(speaker)
        scheduler.advance(RemoteTargetConstants.FAKE_CONNECT_DELAY_MS)

        assertEquals(
            listOf("ending Bench TV -", "ended Bench TV -", "starting Bench Speaker -", "started Bench Speaker -"),
            events.sessions.drop(2),
        )
    }

    @Test
    fun aDisconnectWhileConnectingNeverStarts() {
        val events = Events()
        val port = started(events)
        port.connect(tv)

        port.disconnect(stopPlayback = true)
        scheduler.advance(RemoteTargetConstants.FAKE_CONNECT_DELAY_MS + RemoteTargetConstants.FAKE_END_DELAY_MS)

        assertEquals(listOf("starting Bench TV -", "ending Bench TV -", "ended Bench TV -"), events.sessions)
    }

    @Test
    fun aDisconnectWithNothingConnectedEnds() {
        val events = Events()

        started(events).disconnect(stopPlayback = false)

        assertEquals(listOf("ended - -"), events.sessions)
    }

    @Test
    fun aDeviceOffTheBenchFailsToStart() {
        val events = Events()

        started(events).connect(TargetDevice("device-a", "Living room"))

        assertEquals(listOf("startFailed Living room ${FakeCastDevices.NOT_ON_THE_BENCH}"), events.sessions)
    }

    @Test
    fun aStoppedPortSendsNothingMore() {
        val events = Events()
        val port = started(events)
        port.connect(tv)

        port.stop()
        scheduler.advance(RemoteTargetConstants.FAKE_CONNECT_DELAY_MS)

        assertEquals(listOf("starting Bench TV -"), events.sessions)
    }

    // What a tier 1 flow does: the hub, the fake receivers, a connection by id.
    @Test
    fun theHubConnectsToAFakeReceiverById() {
        val hub = RemoteTargetHub()
        hub.install(FakeCastDevices(scheduler.schedule))

        hub.startDiscovery(RemoteTargetHub.APP_DISCOVERY)
        assertTrue(hub.connect("fake-cast-living-room"))
        val connecting = hub.snapshot.phase
        scheduler.advance(RemoteTargetConstants.FAKE_CONNECT_DELAY_MS)

        assertEquals(TargetPhase.CONNECTING, connecting)
        assertEquals(RemoteTargetSnapshot(TargetPhase.CONNECTED, RemoteTarget.cast(tv), false, null), hub.snapshot)
        assertEquals(FakeCastDevices.DEVICES, hub.devices)
    }
}

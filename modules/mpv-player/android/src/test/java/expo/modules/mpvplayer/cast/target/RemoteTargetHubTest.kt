package expo.modules.mpvplayer.cast.target

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

// The hub holds the target for the whole process and talks to the SDK through a port: what it
// publishes and what it asks the port are the contract the module, the probe and the fake devices
// rely on. The same cases as RemoteTargetTests.swift.
class RemoteTargetHubTest {
    private val livingRoom = TargetDevice("device-a", "Living room")
    private val bedroom = TargetDevice("device-b", "Bedroom")

    private class Recording : RemoteTargetListener {
        val targets = mutableListOf<RemoteTargetSnapshot>()
        val deviceLists = mutableListOf<List<TargetDevice>>()
        var onTarget: (RemoteTargetSnapshot) -> Unit = {}

        override fun targetChanged(snapshot: RemoteTargetSnapshot) {
            targets += snapshot
            onTarget(snapshot)
        }

        override fun devicesChanged(devices: List<TargetDevice>) {
            deviceLists += devices
        }
    }

    private fun connected(port: FakeTargetPort): RemoteTargetHub {
        val hub = RemoteTargetHub()
        hub.install(port)
        port.emit("started", livingRoom)
        return hub
    }

    @Test
    fun aSessionAlreadyRunningAtInstallIsConnected() {
        val hub = RemoteTargetHub()

        hub.install(FakeTargetPort(atStart = listOf(Triple("resumed", livingRoom, null))))

        assertEquals(TargetPhase.CONNECTED, hub.snapshot.phase)
        assertEquals(RemoteTarget.cast(livingRoom), hub.snapshot.target)
    }

    @Test
    fun anUnknownDeviceIsRefusedWithoutAStateChange() {
        val hub = RemoteTargetHub()
        val port = FakeTargetPort(known = listOf(livingRoom))
        hub.install(port)
        val listener = Recording()
        hub.addListener(listener)

        assertFalse(hub.connect("missing"))
        assertTrue(port.connects.isEmpty())
        assertTrue(listener.targets.isEmpty())
        assertEquals(RemoteTargetSnapshot.NONE, hub.snapshot)
    }

    @Test
    fun connectingAKnownDeviceAnnouncesItThenAsksThePort() {
        val hub = RemoteTargetHub()
        val port = FakeTargetPort(known = listOf(livingRoom, bedroom))
        hub.install(port)
        val listener = Recording()
        val askedBeforeTheAnnounce = mutableListOf<Int>()
        listener.onTarget = { askedBeforeTheAnnounce += port.connects.size }
        hub.addListener(listener)

        assertTrue(hub.connect(bedroom.id))

        assertEquals(listOf(RemoteTargetSnapshot(TargetPhase.CONNECTING, RemoteTarget.cast(bedroom), false, null)), listener.targets)
        assertEquals(listOf(0), askedBeforeTheAnnounce)
        assertEquals(listOf(bedroom), port.connects)
    }

    @Test
    fun anotherDeviceWhileConnectedGoesToThePortAndTheSdkEventsFollow() {
        val port = FakeTargetPort(known = listOf(livingRoom, bedroom))
        val hub = connected(port)

        assertTrue(hub.connect(bedroom.id))

        assertEquals(listOf(bedroom), port.connects)
        assertEquals(RemoteTarget.cast(livingRoom), hub.snapshot.target)
    }

    // Focus 4 on the order nothing guarantees: the old session's end lands after the new one started.
    @Test
    fun aSwitchWhoseOldEndArrivesLateLandsOnTheNewDevice() {
        val port = FakeTargetPort(known = listOf(livingRoom, bedroom))
        val hub = connected(port)
        val listener = Recording()
        hub.addListener(listener)

        port.emit("ending", livingRoom)
        port.emit("starting", bedroom)
        port.emit("ended", livingRoom)
        port.emit("started", bedroom)

        assertEquals(
            listOf(TargetPhase.ENDING, TargetPhase.CONNECTING, TargetPhase.CONNECTED),
            listener.targets.map { it.phase },
        )
        assertEquals(listOf(RemoteTarget.cast(livingRoom), RemoteTarget.cast(bedroom), RemoteTarget.cast(bedroom)), listener.targets.map { it.target })
    }

    // What a device does on a switch (Android, status 2155 on the old session): no none in between.
    @Test
    fun aSwitchPublishesNoNoneBetweenTheReceivers() {
        val port = FakeTargetPort(known = listOf(livingRoom, bedroom))
        val hub = connected(port)
        val listener = Recording()
        hub.addListener(listener)

        assertTrue(hub.connect(bedroom.id))
        port.emit("ending", livingRoom)
        port.emit("ended", livingRoom, "Cast session status code 2155 (2155)")
        port.emit("starting", bedroom)
        port.emit("started", bedroom)

        assertEquals(listOf(TargetPhase.ENDING, TargetPhase.CONNECTING, TargetPhase.CONNECTED), listener.targets.map { it.phase })
        assertTrue(listener.targets.all { it.error == null })
    }

    @Test
    fun aDisconnectDuringASwitchEndsForGood() {
        val port = FakeTargetPort(known = listOf(livingRoom, bedroom))
        val hub = connected(port)

        hub.connect(bedroom.id)
        hub.disconnect(stopPlayback = true)
        port.emit("ended", livingRoom)

        assertEquals(RemoteTargetSnapshot.NONE, hub.snapshot)
    }

    @Test
    fun theDeviceAlreadyConnectedAsksNothing() {
        val port = FakeTargetPort(known = listOf(livingRoom))
        val hub = connected(port)

        assertTrue(hub.connect(livingRoom.id))

        assertTrue(port.connects.isEmpty())
    }

    // The Android SDK selects the asked route back; the iOS port starts it once its session has ended.
    @Test
    fun askingTheConnectedReceiverAgainDuringASwitchReachesThePort() {
        val port = FakeTargetPort(known = listOf(livingRoom, bedroom))
        val hub = connected(port)

        hub.connect(bedroom.id)
        assertTrue(hub.connect(livingRoom.id))

        assertEquals(listOf(bedroom, livingRoom), port.connects)
    }

    @Test
    fun aReplacedPortForgetsTheOldPortsDevices() {
        val hub = RemoteTargetHub()
        val first = FakeTargetPort()
        hub.install(first)
        first.discover(listOf(livingRoom))
        val heard = Recording().also { hub.addListener(it) }

        hub.install(FakeTargetPort())

        assertTrue(hub.devices.isEmpty())
        assertEquals(listOf(emptyList<TargetDevice>()), heard.deviceLists)
    }

    @Test
    fun theHubBoundsTheLevelItSends() {
        val port = FakeTargetPort(known = listOf(livingRoom))
        val hub = connected(port)

        hub.setVolume(-0.2)
        hub.setVolume(1.4)
        hub.setMuted(true)

        assertEquals(listOf(0.0, 1.0), port.volumes)
        assertEquals(listOf(true), port.mutes)
    }

    @Test
    fun aVolumeAskedWithNoTargetReachesNoPort() {
        val port = FakeTargetPort(known = listOf(livingRoom))
        val hub = RemoteTargetHub().also { it.install(port) }

        hub.setVolume(0.5)
        hub.setMuted(true)

        assertTrue(port.volumes.isEmpty())
        assertTrue(port.mutes.isEmpty())
    }

    @Test
    fun aVolumeThePortReportsIsPublished() {
        val port = FakeTargetPort(known = listOf(livingRoom))
        val hub = connected(port)

        port.events?.volumeChanged(0.3, true)

        assertEquals(0.3, hub.snapshot.volume)
        assertTrue(hub.snapshot.muted)
    }

    @Test
    fun onlyChangesReachTheListeners() {
        val hub = RemoteTargetHub()
        val port = FakeTargetPort()
        hub.install(port)
        val listener = Recording()
        hub.addListener(listener)

        port.emit("starting", livingRoom)
        port.emit("starting", livingRoom)

        assertEquals(1, listener.targets.size)
    }

    @Test
    fun devicesFollowThePort() {
        val hub = RemoteTargetHub()
        val port = FakeTargetPort()
        hub.install(port)
        val listener = Recording()
        hub.addListener(listener)

        port.discover(listOf(livingRoom, bedroom))
        port.discover(listOf(livingRoom, bedroom))

        assertEquals(listOf(livingRoom, bedroom), hub.devices)
        assertEquals(listOf(listOf(livingRoom, bedroom)), listener.deviceLists)
    }

    // getDevices answered nothing before discovery ran, and still does.
    @Test
    fun noDeviceIsListedBeforeDiscovery() {
        val hub = RemoteTargetHub()

        hub.install(FakeTargetPort(known = listOf(livingRoom)))

        assertTrue(hub.devices.isEmpty())
    }

    @Test
    fun disconnectGoesToThePortAndWaitsForItsEvents() {
        val port = FakeTargetPort(known = listOf(livingRoom))
        val hub = connected(port)

        hub.disconnect(stopPlayback = true)

        assertEquals(listOf(true), port.disconnects)
        assertEquals(TargetPhase.CONNECTED, hub.snapshot.phase)
    }

    @Test
    fun discoveryGoesToThePort() {
        val hub = RemoteTargetHub()
        val port = FakeTargetPort()
        hub.install(port)

        hub.startDiscovery(RemoteTargetHub.APP_DISCOVERY)
        assertTrue(port.discovering)
        hub.stopDiscovery(RemoteTargetHub.APP_DISCOVERY)
        assertFalse(port.discovering)
    }

    // The probe used to stop the discovery the header's Cast button had started, and nothing started it again.
    @Test
    fun aStopFromOneOwnerKeepsAnotherOwnersDiscovery() {
        val hub = RemoteTargetHub()
        val port = FakeTargetPort()
        hub.install(port)

        hub.startDiscovery(RemoteTargetHub.APP_DISCOVERY)
        hub.startDiscovery(RemoteTargetHub.PROBE_DISCOVERY)
        hub.stopDiscovery(RemoteTargetHub.PROBE_DISCOVERY)
        assertTrue(port.discovering)
        hub.stopDiscovery(RemoteTargetHub.APP_DISCOVERY)
        assertFalse(port.discovering)
    }

    @Test
    fun anOwnerAskingTwiceStopsOnce() {
        val hub = RemoteTargetHub()
        val port = FakeTargetPort()
        hub.install(port)

        hub.startDiscovery(RemoteTargetHub.APP_DISCOVERY)
        hub.startDiscovery(RemoteTargetHub.APP_DISCOVERY)
        hub.stopDiscovery(RemoteTargetHub.APP_DISCOVERY)
        assertFalse(port.discovering)
    }

    @Test
    fun aNewPortRunsTheDiscoveryStillAsked() {
        val hub = RemoteTargetHub()
        hub.install(FakeTargetPort())
        hub.startDiscovery(RemoteTargetHub.APP_DISCOVERY)
        val next = FakeTargetPort()

        hub.install(next)

        assertTrue(next.discovering)
    }

    @Test
    fun aRemovedListenerHearsNothing() {
        val hub = RemoteTargetHub()
        val port = FakeTargetPort()
        hub.install(port)
        val listener = Recording()
        val remove = hub.addListener(listener)

        remove()
        port.emit("started", livingRoom)

        assertTrue(listener.targets.isEmpty())
    }

    @Test
    fun theSamePortInstalledTwiceStartsOnce() {
        val hub = RemoteTargetHub()
        val port = FakeTargetPort()

        hub.install(port)
        hub.install(port)

        assertEquals(1, port.starts)
    }

    @Test
    fun aNewPortReplacesTheOldOneAndItsTarget() {
        val first = FakeTargetPort(atStart = listOf(Triple("started", livingRoom, null)))
        val second = FakeTargetPort()
        val hub = RemoteTargetHub()
        hub.install(first)
        val listener = Recording()
        hub.addListener(listener)
        val stale = first.events

        hub.install(second)
        stale?.sessionEvent("started", bedroom, null)

        assertTrue(first.stopped)
        assertEquals(1, second.starts)
        assertEquals(RemoteTargetSnapshot.NONE, hub.snapshot)
        assertEquals(listOf(RemoteTargetSnapshot.NONE), listener.targets)
    }
}

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

    @Test
    fun theDeviceAlreadyConnectedAsksNothing() {
        val port = FakeTargetPort(known = listOf(livingRoom))
        val hub = connected(port)

        assertTrue(hub.connect(livingRoom.id))

        assertTrue(port.connects.isEmpty())
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

        hub.startDiscovery()
        assertTrue(port.discovering)
        hub.stopDiscovery()
        assertFalse(port.discovering)
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

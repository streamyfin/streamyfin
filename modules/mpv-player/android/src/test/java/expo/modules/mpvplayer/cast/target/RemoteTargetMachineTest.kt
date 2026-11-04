package expo.modules.mpvplayer.cast.target

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

// The output sheet reads where playback goes from this state alone, so every session event the SDK
// can send has to land on a state the sheet can draw. The same cases as RemoteTargetTests.swift.
class RemoteTargetMachineTest {
    private val livingRoom = TargetDevice("device-a", "Living room")
    private val bedroom = TargetDevice("device-b", "Bedroom")

    private fun cast(device: TargetDevice) = RemoteTarget("cast", device.id, device.name, volume = true)

    private fun connectedTo(device: TargetDevice) = RemoteTargetMachine().also { it.sessionEvent("started", device, null) }

    @Test
    fun aConnectionStartsThenConnects() {
        val machine = RemoteTargetMachine()

        assertTrue(machine.connectRequested(livingRoom))
        assertEquals(RemoteTargetSnapshot(TargetPhase.CONNECTING, cast(livingRoom), false, null), machine.snapshot)
        assertFalse(machine.sessionEvent("starting", livingRoom, null))
        assertTrue(machine.sessionEvent("started", livingRoom, null))
        assertEquals(RemoteTargetSnapshot(TargetPhase.CONNECTED, cast(livingRoom), false, null), machine.snapshot)
    }

    @Test
    fun aSuspendedSessionReconnectsThenEndsWithItsError() {
        val machine = connectedTo(livingRoom)

        assertTrue(machine.sessionEvent("suspended", null, null))
        assertEquals(RemoteTargetSnapshot(TargetPhase.CONNECTING, cast(livingRoom), true, null), machine.snapshot)
        assertTrue(machine.sessionEvent("ended", null, "network"))
        assertEquals(RemoteTargetSnapshot(TargetPhase.NONE, null, false, "network"), machine.snapshot)
    }

    @Test
    fun switchingDevicesEndsTheFirstBeforeTheSecond() {
        val machine = connectedTo(livingRoom)
        val seen = mutableListOf<RemoteTargetSnapshot>()

        listOf("ending" to livingRoom, "ended" to livingRoom, "starting" to bedroom, "started" to bedroom).forEach { (event, device) ->
            if (machine.sessionEvent(event, device, null)) seen += machine.snapshot
        }

        assertEquals(
            listOf(TargetPhase.ENDING, TargetPhase.NONE, TargetPhase.CONNECTING, TargetPhase.CONNECTED),
            seen.map { it.phase },
        )
        assertEquals(listOf(cast(livingRoom), null, cast(bedroom), cast(bedroom)), seen.map { it.target })
    }

    // Nothing promises the old session's end comes before the new one starts: a late end is the old session's.
    @Test
    fun anEndNamingAnotherDeviceLeavesTheNewOneAlone() {
        val machine = connectedTo(livingRoom)
        machine.sessionEvent("ending", livingRoom, null)
        machine.sessionEvent("starting", bedroom, null)

        assertFalse(machine.sessionEvent("ended", livingRoom, null))
        assertEquals(RemoteTargetSnapshot(TargetPhase.CONNECTING, cast(bedroom), false, null), machine.snapshot)
        assertTrue(machine.sessionEvent("started", bedroom, null))
        assertEquals(RemoteTargetSnapshot(TargetPhase.CONNECTED, cast(bedroom), false, null), machine.snapshot)
    }

    @Test
    fun aRefusedStartOfAnotherDeviceLeavesTheConnectedOne() {
        val machine = connectedTo(livingRoom)

        assertFalse(machine.sessionEvent("startFailed", bedroom, "refused"))
        assertFalse(machine.sessionEvent("ending", bedroom, null))
        assertEquals(RemoteTargetSnapshot(TargetPhase.CONNECTED, cast(livingRoom), false, null), machine.snapshot)
    }

    @Test
    fun anEndWithoutADeviceStillEnds() {
        val machine = connectedTo(livingRoom)

        assertTrue(machine.sessionEvent("ended", null, "network"))
        assertEquals(RemoteTargetSnapshot(TargetPhase.NONE, null, false, "network"), machine.snapshot)
    }

    @Test
    fun aSessionResumedWithoutStartingIsConnected() {
        val machine = RemoteTargetMachine()

        assertTrue(machine.sessionEvent("resumed", livingRoom, null))
        assertEquals(RemoteTargetSnapshot(TargetPhase.CONNECTED, cast(livingRoom), false, null), machine.snapshot)
    }

    @Test
    fun aResumeAtLaunchReconnectsBeforeItConnects() {
        val machine = RemoteTargetMachine()

        assertTrue(machine.sessionEvent("resuming", livingRoom, null))
        assertEquals(RemoteTargetSnapshot(TargetPhase.CONNECTING, cast(livingRoom), true, null), machine.snapshot)
        assertTrue(machine.sessionEvent("resumed", livingRoom, null))
        assertEquals(RemoteTargetSnapshot(TargetPhase.CONNECTED, cast(livingRoom), false, null), machine.snapshot)
    }

    @Test
    fun aRequestWhileConnectedChangesNothing() {
        val machine = connectedTo(livingRoom)

        assertFalse(machine.connectRequested(bedroom))
        assertEquals(RemoteTargetSnapshot(TargetPhase.CONNECTED, cast(livingRoom), false, null), machine.snapshot)
    }

    @Test
    fun aFailedStartEndsWithItsError() {
        val machine = RemoteTargetMachine()
        machine.connectRequested(livingRoom)

        assertTrue(machine.sessionEvent("startFailed", livingRoom, "timeout"))
        assertEquals(RemoteTargetSnapshot(TargetPhase.NONE, null, false, "timeout"), machine.snapshot)
    }

    @Test
    fun aNewConnectionClearsThePreviousError() {
        val machine = connectedTo(livingRoom)
        machine.sessionEvent("ended", livingRoom, "network")

        assertTrue(machine.connectRequested(bedroom))
        assertNull(machine.snapshot.error)
    }

    @Test
    fun anUnknownEventChangesNothing() {
        val machine = connectedTo(livingRoom)

        assertFalse(machine.sessionEvent("rebooted", bedroom, "odd"))
        assertEquals(RemoteTargetSnapshot(TargetPhase.CONNECTED, cast(livingRoom), false, null), machine.snapshot)
    }

    // onDevicesChanged kept its record when discovery moved into the port.
    @Test
    fun aDeviceKeepsTheRecordDiscoveryPublishes() {
        assertEquals(
            mapOf("deviceId" to "device-a", "friendlyName" to "Living room", "modelName" to "Chromecast"),
            TargetDevice("device-a", "Living room", "Chromecast").toMap(),
        )
        assertEquals(mapOf("deviceId" to "device-a", "friendlyName" to "Living room", "modelName" to null), livingRoom.toMap())
    }

    @Test
    fun theJsShapeNamesThePhaseAndTheTarget() {
        val target = mapOf("kind" to "cast", "id" to "device-a", "name" to "Living room", "capabilities" to mapOf("volume" to true))

        assertEquals(
            mapOf("state" to "connected", "target" to target, "reconnecting" to false, "error" to null),
            connectedTo(livingRoom).snapshot.toMap(),
        )
        assertEquals(
            mapOf("state" to "none", "target" to null, "reconnecting" to false, "error" to null),
            RemoteTargetSnapshot.NONE.toMap(),
        )
    }
}

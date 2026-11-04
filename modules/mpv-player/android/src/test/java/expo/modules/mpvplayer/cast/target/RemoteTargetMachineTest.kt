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
        assertEquals(RemoteTargetSnapshot(TargetPhase.NONE, null, false, "network", failedTarget = cast(livingRoom)), machine.snapshot)
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

    // On a device the Android SDK ends the old session with status 2155 when a switch selects another route.
    @Test
    fun aSwitchGoesFromTheOldReceiverToTheNewOneWithoutAnError() {
        val machine = connectedTo(livingRoom)
        val seen = mutableListOf<RemoteTargetSnapshot>()

        assertFalse(machine.connectRequested(bedroom))
        listOf(
            Triple("ending", livingRoom, null),
            Triple("ended", livingRoom, "Cast session status code 2155 (2155)"),
            Triple("starting", bedroom, null),
            Triple("started", bedroom, null),
        ).forEach { (event, device, error) -> if (machine.sessionEvent(event, device, error)) seen += machine.snapshot }

        assertEquals(
            listOf(
                RemoteTargetSnapshot(TargetPhase.ENDING, cast(livingRoom), false, null),
                RemoteTargetSnapshot(TargetPhase.CONNECTING, cast(bedroom), false, null),
                RemoteTargetSnapshot(TargetPhase.CONNECTED, cast(bedroom), false, null),
            ),
            seen,
        )
    }

    @Test
    fun aSwitchRefusedBeforeTheOldEndKeepsTheOldReceiverAndSaysWhy() {
        val machine = connectedTo(livingRoom)
        machine.connectRequested(bedroom)

        // A switch the port refuses at once (a disabled route, an end the SDK keeps) leaves the receiver
        // that holds the session, with the cause: silence there left the sheet, and the probe, waiting.
        assertTrue(machine.sessionEvent("startFailed", bedroom, "busy"))
        assertEquals(RemoteTargetSnapshot(TargetPhase.CONNECTED, cast(livingRoom), false, "busy", failedTarget = cast(bedroom)), machine.snapshot)
        assertTrue(machine.sessionEvent("ended", livingRoom, null))
        assertEquals(RemoteTargetSnapshot.NONE, machine.snapshot)
    }

    @Test
    fun aNewReceiverFailingAfterTheSwitchEndsWithItsError() {
        val machine = connectedTo(livingRoom)
        machine.connectRequested(bedroom)
        machine.sessionEvent("ended", livingRoom, null)

        assertTrue(machine.sessionEvent("startFailed", bedroom, "timeout"))
        assertEquals(RemoteTargetSnapshot(TargetPhase.NONE, null, false, "timeout", failedTarget = cast(bedroom)), machine.snapshot)
    }

    @Test
    fun aDisconnectDuringASwitchEndsForGood() {
        val machine = connectedTo(livingRoom)
        machine.connectRequested(bedroom)

        machine.disconnectRequested()
        machine.sessionEvent("ended", livingRoom, null)

        assertEquals(RemoteTargetSnapshot.NONE, machine.snapshot)
    }

    @Test
    fun anEndWithoutADeviceStillEnds() {
        val machine = connectedTo(livingRoom)

        assertTrue(machine.sessionEvent("ended", null, "network"))
        assertEquals(RemoteTargetSnapshot(TargetPhase.NONE, null, false, "network", failedTarget = cast(livingRoom)), machine.snapshot)
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

    // A late end of the receiver a switch left must not end the one that took over and is ending now.
    @Test
    fun aLateEndOfTheOldReceiverLeavesTheNewOneEnding() {
        val machine = connectedTo(livingRoom)
        machine.connectRequested(bedroom)
        machine.sessionEvent("ending", livingRoom, null)
        machine.sessionEvent("starting", bedroom, null)
        machine.sessionEvent("started", bedroom, null)
        machine.sessionEvent("ending", bedroom, null)

        assertFalse(machine.sessionEvent("ended", livingRoom, "Cast session status code 2155 (2155)"))
        assertEquals(RemoteTargetSnapshot(TargetPhase.ENDING, cast(bedroom), false, null), machine.snapshot)
    }

    // Asked again while a switch takes its session away: the end of that session leads back to it.
    @Test
    fun askingTheHeldReceiverAgainDuringASwitchLeadsBackToIt() {
        val machine = connectedTo(livingRoom)
        machine.connectRequested(bedroom)

        assertFalse(machine.connectRequested(livingRoom))
        machine.sessionEvent("ending", livingRoom, null)
        machine.sessionEvent("ended", livingRoom, "Cast session status code 2155 (2155)")
        assertEquals(RemoteTargetSnapshot(TargetPhase.CONNECTING, cast(livingRoom), false, null), machine.snapshot)
        machine.sessionEvent("starting", livingRoom, null)
        machine.sessionEvent("started", livingRoom, null)
        assertEquals(RemoteTargetSnapshot(TargetPhase.CONNECTED, cast(livingRoom), false, null), machine.snapshot)
    }

    @Test
    fun theHeldReceiverAskedBackThenFailingEndsWithItsError() {
        val machine = connectedTo(livingRoom)
        machine.connectRequested(bedroom)
        machine.connectRequested(livingRoom)
        machine.sessionEvent("ended", livingRoom, "Cast session status code 2155 (2155)")

        assertTrue(machine.sessionEvent("startFailed", livingRoom, "busy"))
        assertEquals(RemoteTargetSnapshot(TargetPhase.NONE, null, false, "busy", failedTarget = cast(livingRoom)), machine.snapshot)
    }

    // The only start in flight during a switch is the asked receiver's: a start failure without its device
    // is that one's, and ends the switch instead of leaving it connecting.
    @Test
    fun aDeviceLessStartFailureDuringASwitchEndsWithItsError() {
        val machine = connectedTo(livingRoom)
        machine.connectRequested(bedroom)
        machine.sessionEvent("ended", livingRoom, "Cast session status code 2155 (2155)")

        assertTrue(machine.sessionEvent("startFailed", null, "gone"))
        assertEquals(RemoteTargetSnapshot(TargetPhase.NONE, null, false, "gone", failedTarget = cast(bedroom)), machine.snapshot)
    }

    @Test
    fun aRefusedEndKeepsTheReceiverAndSaysWhy() {
        val machine = connectedTo(livingRoom)
        machine.disconnectRequested()

        assertTrue(machine.sessionEvent("endRefused", livingRoom, "kept"))
        assertEquals(RemoteTargetSnapshot(TargetPhase.CONNECTED, cast(livingRoom), false, "kept", failedTarget = cast(livingRoom)), machine.snapshot)
    }

    // The output sheet's slider and mute follow the receiver's own volume, as the SDK reports it.
    @Test
    fun aVolumeChangeWhileConnectedIsPublished() {
        val machine = connectedTo(livingRoom)

        assertTrue(machine.volumeChanged(0.62, false))
        assertEquals(0.62, machine.snapshot.volume)
        assertFalse(machine.snapshot.muted)
    }

    @Test
    fun aVolumeChangeWithNoTargetIsIgnored() {
        val machine = RemoteTargetMachine()

        assertFalse(machine.volumeChanged(0.62, false))
        assertNull(machine.snapshot.volume)
    }

    @Test
    fun anEndForgetsTheVolume() {
        val machine = connectedTo(livingRoom)
        machine.volumeChanged(0.62, true)

        machine.sessionEvent("ended", livingRoom, null)

        assertNull(machine.snapshot.volume)
        assertFalse(machine.snapshot.muted)
    }

    @Test
    fun theSameSessionKeepsItsVolume() {
        val machine = connectedTo(livingRoom)
        machine.volumeChanged(0.5, false)

        machine.sessionEvent("suspended", null, null)
        machine.sessionEvent("resumed", livingRoom, null)

        assertEquals(0.5, machine.snapshot.volume)
    }

    // The sheet writes the cause on the row of the receiver it belongs to, with the SDK's code for it.
    @Test
    fun aFailedEndNamesItsTargetAndCode() {
        val machine = connectedTo(livingRoom)

        machine.sessionEvent("ended", livingRoom, "Cast session status code 2155 (2155)", 2155)

        assertEquals(2155, machine.snapshot.errorCode)
        assertEquals(livingRoom.id, machine.snapshot.failedTarget?.id)
        machine.connectRequested(livingRoom)
        assertNull(machine.snapshot.errorCode)
        assertNull(machine.snapshot.failedTarget)
    }

    @Test
    fun aRefusedSwitchNamesTheReceiverThatFailed() {
        val machine = connectedTo(livingRoom)
        machine.connectRequested(bedroom)

        machine.sessionEvent("startFailed", bedroom, "busy", 2004)

        assertEquals(cast(livingRoom), machine.snapshot.target)
        assertEquals(cast(bedroom), machine.snapshot.failedTarget)
        assertEquals(2004, machine.snapshot.errorCode)
    }

    @Test
    fun anEndTheUserAskedForNamesNoFailure() {
        val machine = connectedTo(livingRoom)

        machine.sessionEvent("ended", livingRoom, null)

        assertNull(machine.snapshot.failedTarget)
        assertNull(machine.snapshot.errorCode)
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
        assertEquals(RemoteTargetSnapshot(TargetPhase.NONE, null, false, "timeout", failedTarget = cast(livingRoom)), machine.snapshot)
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
            mapOf("deviceId" to "device-a", "friendlyName" to "Living room", "modelName" to "Chromecast", "videoOut" to true),
            TargetDevice("device-a", "Living room", "Chromecast").toMap(),
        )
        assertEquals(
            mapOf("deviceId" to "device-a", "friendlyName" to "Living room", "modelName" to null, "videoOut" to true),
            livingRoom.toMap(),
        )
    }

    @Test
    fun theJsShapeCarriesTheNewFields() {
        val connected = connectedTo(livingRoom).also { it.volumeChanged(0.62, true) }.snapshot.toMap()
        val failed = connectedTo(livingRoom).also { it.sessionEvent("ended", livingRoom, "lost", 2155) }.snapshot.toMap()

        assertEquals(0.62, connected["volume"])
        assertEquals(true, connected["muted"])
        assertNull(connected["errorCode"])
        assertNull(connected["failedTarget"])
        assertEquals(2155, failed["errorCode"])
        assertEquals("device-a", (failed["failedTarget"] as Map<*, *>)["id"])
    }

    @Test
    fun theJsShapeNamesThePhaseAndTheTarget() {
        val target = mapOf("kind" to "cast", "id" to "device-a", "name" to "Living room", "capabilities" to mapOf("volume" to true))
        val noVolumeNoFailure = mapOf("volume" to null, "muted" to false, "errorCode" to null, "failedTarget" to null)

        assertEquals(
            mapOf("state" to "connected", "target" to target, "reconnecting" to false, "error" to null) + noVolumeNoFailure,
            connectedTo(livingRoom).snapshot.toMap(),
        )
        assertEquals(
            mapOf("state" to "none", "target" to null, "reconnecting" to false, "error" to null) + noVolumeNoFailure,
            RemoteTargetSnapshot.NONE.toMap(),
        )
    }
}

package expo.modules.mpvplayer.cast.output

import expo.modules.mpvplayer.cast.engine.ManualScheduler
import expo.modules.mpvplayer.cast.target.FakeTargetPort
import expo.modules.mpvplayer.cast.target.RemoteTargetConstants
import expo.modules.mpvplayer.cast.target.RemoteTargetHub
import expo.modules.mpvplayer.cast.target.TargetDevice
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

// The sheet's controller on the real hub and a fake port: what a tap asks the hub, and what the sheet
// shows while the SDK answers. The same cases as OutputSheetTests.swift.
class OutputSheetControllerTest {
    private val livingRoom = TargetDevice("device-a", "Living room")
    private val bedroom = TargetDevice("device-b", "Bedroom")
    private val scheduler = ManualScheduler()
    private val outputs = mutableListOf<OutputSheetOutput>()

    private fun hubWith(port: FakeTargetPort) = RemoteTargetHub().also { it.install(port) }

    private fun sheet(hub: RemoteTargetHub, receiverTitle: String? = "Big Buck Bunny") =
        OutputSheetController(hub, scheduler.schedule).also {
            it.environment =
                OutputSheetEnvironment(
                    receiverTitle = receiverTitle,
                    receiverPlaying = receiverTitle != null,
                    receiverGoesOnHere = receiverTitle != null,
                )
            it.onOutput = { output -> outputs += output }
            it.open()
        }

    private fun rows(sheet: OutputSheetController) = (sheet.state as OutputSheetState.List).rows

    private fun row(sheet: OutputSheetController, device: TargetDevice) =
        rows(sheet).filterIsInstance<OutputRow.Device>().first { it.id == device.id }

    private fun panel(sheet: OutputSheetController) = sheet.state as OutputSheetState.Connected

    private fun port() = FakeTargetPort(known = listOf(livingRoom, bedroom), listsOnDiscovery = true)

    // A failure is read once: the sheet that showed it clears it on closing, and the next one opens clean.
    @Test
    fun closingTheSheetClearsTheFailureItShowed() {
        val port = port()
        val hub = hubWith(port)
        val sheet = sheet(hub)
        port.emit("startFailed", bedroom, "timeout")
        val shown = row(sheet, bedroom).status

        sheet.close()

        assertTrue(shown is DeviceStatus.Failed)
        assertEquals(null, hub.snapshot.error)
        assertEquals(DeviceStatus.Idle, row(sheet(hub), bedroom).status)
    }

    // Opened from the player, the connection the sheet asks for hands the video off, once, instead of drawing the panel.
    @Test
    fun aConnectionMadeFromThePlayerHandsOff() {
        val port = port()
        val sheet = sheet(hubWith(port))
        sheet.environment = sheet.environment.copy(handOff = true)

        sheet.tap(row(sheet, livingRoom))
        port.emit("started", livingRoom)
        port.events?.volumeChanged(0.5, false)

        assertEquals(listOf(OutputSheetOutput.HAND_OFF), outputs)
    }

    // Opened from the player over a receiver already connected, the panel offers to play there.
    @Test
    fun aConnectedTargetOffersTheHandOffInThePanel() {
        val port = port()
        val hub = hubWith(port)
        port.emit("started", livingRoom)
        val sheet = sheet(hub)
        sheet.environment = sheet.environment.copy(handOff = true)

        val offered = panel(sheet).canHandOff
        sheet.handOff()

        assertTrue(offered)
        assertEquals(listOf(OutputSheetOutput.HAND_OFF), outputs)
    }

    // Opened anywhere else, the same connection draws the panel and hands nothing off.
    @Test
    fun outsideThePlayerNothingHandsOff() {
        val port = port()
        val sheet = sheet(hubWith(port))

        sheet.tap(row(sheet, livingRoom))
        port.emit("started", livingRoom)

        assertEquals("device-a", panel(sheet).target.id)
        assertFalse(panel(sheet).canHandOff)
        assertTrue(outputs.isEmpty())
    }

    @Test
    fun aConnectingTargetShowsItsIndicatorAndCancel() {
        val port = port()
        val sheet = sheet(hubWith(port))

        sheet.tap(row(sheet, bedroom))
        val connecting = row(sheet, bedroom).status
        sheet.cancel()

        assertEquals(listOf(bedroom), port.connects)
        assertEquals(DeviceStatus.Connecting, connecting)
        assertEquals(listOf(true), port.disconnects)
    }

    @Test
    fun aConnectedTargetShowsThePanelAndChangeShowsTheList() {
        val port = port()
        val sheet = sheet(hubWith(port))
        port.emit("started", livingRoom)
        val connectedTo = panel(sheet).target.id

        sheet.change()
        val listed = row(sheet, livingRoom).status
        sheet.tap(row(sheet, bedroom))

        assertEquals("device-a", connectedTo)
        assertEquals(DeviceStatus.Connected, listed)
        // The hub ends the first session before the second starts: the sheet only asks for the receiver.
        assertEquals(listOf(bedroom), port.connects)
        assertEquals(DeviceStatus.Connecting, row(sheet, bedroom).status)
    }

    @Test
    fun aLostTargetShowsItsCauseOnItsRow() {
        val port = port()
        val sheet = sheet(hubWith(port))
        port.emit("started", livingRoom)

        port.events?.sessionEvent("ended", livingRoom, "Cast session status code 2155 (2155)", 2155)

        assertEquals(DeviceStatus.Failed(FailureCause.Network), row(sheet, livingRoom).status)
    }

    @Test
    fun aRetryClearsTheError() {
        val port = port()
        val sheet = sheet(hubWith(port))
        port.emit("started", livingRoom)
        port.events?.sessionEvent("ended", livingRoom, "Cast session status code 2155 (2155)", 2155)

        sheet.tap(row(sheet, livingRoom))

        assertEquals(DeviceStatus.Connecting, row(sheet, livingRoom).status)
        assertEquals(listOf(livingRoom), port.connects)
    }

    @Test
    fun noDeviceAfterTheTimeoutSaysSo() {
        val port = FakeTargetPort(listsOnDiscovery = true)
        val sheet = sheet(hubWith(port))
        val searching = rows(sheet).last()

        scheduler.advance(RemoteTargetConstants.OUTPUT_SEARCH_TIMEOUT_MS)
        val nothing = rows(sheet).last()
        port.discover(listOf(bedroom))

        assertEquals(OutputRow.Status(SheetStatus.SEARCHING), searching)
        assertEquals(OutputRow.Status(SheetStatus.NO_DEVICES), nothing)
        assertEquals(listOf("device-b"), rows(sheet).filterIsInstance<OutputRow.Device>().map { it.id })
        assertTrue(rows(sheet).none { it is OutputRow.Status })
    }

    @Test
    fun aVolumeFromTheTvMovesTheSliderUnlessItIsDragged() {
        val port = port()
        val sheet = sheet(hubWith(port))
        port.emit("started", livingRoom)

        port.events?.volumeChanged(0.3, false)
        val fromTheTv = panel(sheet).volume
        sheet.dragVolume(0.7)
        port.events?.volumeChanged(0.5, false)

        assertEquals(0.3, fromTheTv!!, 0.0)
        assertEquals(0.7, panel(sheet).volume!!, 0.0)
        assertTrue(port.volumes.isEmpty())
    }

    // Android sets the level in the route's steps, so the echo comes back to the nearest one (0.05 away).
    @Test
    fun aReleasedSliderHoldsItsValueUntilTheReceiverEchoesIt() {
        val port = port()
        val sheet = sheet(hubWith(port))
        port.emit("started", livingRoom)
        port.events?.volumeChanged(0.3, false)

        sheet.releaseVolume(0.62)
        port.events?.volumeChanged(0.3, false)
        val beforeTheEcho = panel(sheet).volume
        port.events?.volumeChanged(0.6, false)
        val echoed = panel(sheet).volume
        sheet.releaseVolume(0.9)
        scheduler.advance(RemoteTargetConstants.VOLUME_SETTLE_MS)

        assertEquals(listOf(0.62, 0.9), port.volumes)
        assertEquals(0.62, beforeTheEcho!!, 0.0)
        assertEquals(0.6, echoed!!, 0.0)
        // No echo within the settle time: the slider goes back to what the receiver says.
        assertEquals(0.6, panel(sheet).volume!!, 0.0)
    }

    // The system can take a touch back without the slider hearing its end (a slow drag in the iOS sheet,
    // 04/11): a slider left still that long is sent as if released.
    @Test
    fun aSliderLeftStillIsSentAsReleased() {
        val port = port()
        val sheet = sheet(hubWith(port))
        port.emit("started", livingRoom)
        port.events?.volumeChanged(0.3, false)

        sheet.dragVolume(0.4)
        sheet.dragVolume(0.45)
        scheduler.advance(RemoteTargetConstants.VOLUME_DRAG_REST_MS - 1)
        val beforeTheRest = port.volumes.toList()
        scheduler.advance(1)

        assertEquals(emptyList<Double>(), beforeTheRest)
        assertEquals(listOf(0.45), port.volumes)
    }

    @Test
    fun aReleasedSliderIsSentOnce() {
        val port = port()
        val sheet = sheet(hubWith(port))
        port.emit("started", livingRoom)
        port.events?.volumeChanged(0.3, false)

        sheet.dragVolume(0.4)
        sheet.releaseVolume(0.4)
        scheduler.advance(RemoteTargetConstants.VOLUME_DRAG_REST_MS)

        assertEquals(listOf(0.4), port.volumes)
    }

    // The view still holds its drag when the rest sends it: the release it sends after asks nothing more.
    @Test
    fun aSliderReleasedAfterItsRestIsSentOnce() {
        val port = port()
        val sheet = sheet(hubWith(port))
        port.emit("started", livingRoom)
        port.events?.volumeChanged(0.3, false)

        sheet.dragVolume(0.45)
        scheduler.advance(RemoteTargetConstants.VOLUME_DRAG_REST_MS)
        sheet.releaseVolume(0.45)

        assertEquals(listOf(0.45), port.volumes)
    }

    // A port can refuse inside connect, as a disabled route does: the asked row shows the failure, not a wait.
    @Test
    fun aSwitchRefusedAtOnceShowsItsFailure() {
        val port = FakeTargetPort(known = listOf(livingRoom, bedroom), listsOnDiscovery = true, refuses = setOf(bedroom.id))
        val sheet = sheet(hubWith(port))
        port.emit("started", livingRoom)
        sheet.change()

        sheet.tap(row(sheet, bedroom))

        assertTrue(row(sheet, bedroom).status is DeviceStatus.Failed)
    }

    // Back to the receiver a switch was leaving: the asked one goes back to idle.
    @Test
    fun goingBackDuringASwitchForgetsTheAskedReceiver() {
        val port = port()
        val sheet = sheet(hubWith(port))
        port.emit("started", livingRoom)
        sheet.change()
        sheet.tap(row(sheet, bedroom))
        val asked = row(sheet, bedroom).status

        sheet.tap(row(sheet, livingRoom))
        sheet.change()

        assertEquals(DeviceStatus.Connecting, asked)
        assertEquals(DeviceStatus.Idle, row(sheet, bedroom).status)
    }

    // Discovery can lose the receiver a switch leaves: going back to it is refused, and the switch goes on.
    @Test
    fun aSwitchGoesOnWhenTheReceiverItLeavesIsLost() {
        val port = port()
        val sheet = sheet(hubWith(port))
        port.emit("started", livingRoom)
        sheet.change()
        sheet.tap(row(sheet, bedroom))
        port.discover(listOf(bedroom))

        sheet.tap(row(sheet, livingRoom))

        assertEquals(DeviceStatus.Connecting, row(sheet, bedroom).status)
    }

    // Asked for again once its session is ending, the receiver a switch leaves waits for that end: its row shows the
    // request meanwhile.
    @Test
    fun goingBackOnceTheSessionIsEndingShowsTheRequest() {
        val port = port()
        val sheet = sheet(hubWith(port))
        port.emit("started", livingRoom)
        sheet.change()
        sheet.tap(row(sheet, bedroom))
        port.emit("ending", livingRoom)

        sheet.tap(row(sheet, livingRoom))

        assertEquals(DeviceStatus.Connecting, row(sheet, livingRoom).status)
        assertEquals(DeviceStatus.Idle, row(sheet, bedroom).status)
    }

    // Discovery can lose the receiver that holds the session; its row still leads back to its panel.
    @Test
    fun theConnectedRowLeadsBackToItsPanelOnceDiscoveryLostIt() {
        val port = port()
        val sheet = sheet(hubWith(port))
        port.emit("started", livingRoom)
        sheet.change()
        port.discover(listOf(bedroom))

        sheet.tap(row(sheet, livingRoom))

        assertEquals(livingRoom.id, panel(sheet).target.id)
    }

    // An active scan costs battery: out of sight, the sheet stops looking, and looks again when the app comes back.
    @Test
    fun aPausedSheetStopsDiscoveringUntilItResumes() {
        val port = port()
        val sheet = sheet(hubWith(port))

        sheet.pauseDiscovery()
        val paused = port.discovering
        sheet.resumeDiscovery()
        val resumed = port.discovering
        sheet.close()

        assertFalse(paused)
        assertTrue(resumed)
        assertFalse(port.discovering)
    }

    // Nothing plays on the receiver: the one end action reads "Disconnect", the remote is not offered,
    // and it closes the receiver app like the stop does.
    @Test
    fun withNothingOnTheReceiverTheEndActionDisconnects() {
        val port = port()
        val sheet = sheet(hubWith(port), receiverTitle = null)
        port.emit("started", livingRoom)
        val canStop = panel(sheet).canStop

        sheet.stop()

        assertFalse(canStop)
        assertEquals(listOf(true), port.disconnects)
    }

    // While the receiver plays, outside the player, this phone takes its video over where it is: JS reads the
    // receiver before it stops it, so the sheet stops nothing itself.
    @Test
    fun thisDeviceWhileTheReceiverPlaysContinuesHere() {
        val port = port()
        val sheet = sheet(hubWith(port))
        port.emit("started", livingRoom)
        sheet.change()

        sheet.tap(rows(sheet).first())

        assertEquals(emptyList<Boolean>(), port.disconnects)
        assertEquals(listOf(OutputSheetOutput.PLAY_HERE), outputs)
    }

    @Test
    fun thisDeviceWithNothingOnTheReceiverStopsIt() {
        val port = port()
        val sheet = sheet(hubWith(port), receiverTitle = null)
        port.emit("started", livingRoom)
        sheet.change()

        sheet.tap(rows(sheet).first())

        assertEquals(listOf(true), port.disconnects)
        assertEquals(listOf(OutputSheetOutput.DISMISS), outputs)
    }

    // Music, live TV and media another sender loaded stay on the receiver: this phone stops it, as before.
    @Test
    fun thisDeviceWithMusicOnTheReceiverStopsIt() {
        val port = port()
        val sheet = sheet(hubWith(port))
        sheet.environment = sheet.environment.copy(receiverGoesOnHere = false)
        port.emit("started", livingRoom)
        sheet.change()

        sheet.tap(rows(sheet).first())

        assertEquals(listOf(true), port.disconnects)
        assertEquals(listOf(OutputSheetOutput.DISMISS), outputs)
    }

    // In the player, the phone already has its video: this phone stops the receiver, as before.
    @Test
    fun inThePlayerThisDeviceStillStopsTheReceiver() {
        val port = port()
        val sheet = sheet(hubWith(port))
        sheet.environment = sheet.environment.copy(handOff = true)
        port.emit("started", livingRoom)
        sheet.change()

        sheet.tap(rows(sheet).first())

        assertEquals(listOf(true), port.disconnects)
        assertEquals(listOf(OutputSheetOutput.DISMISS), outputs)
    }

    @Test
    fun closingTheSheetStopsDiscovery() {
        val port = port()
        val sheet = sheet(hubWith(port))
        val open = port.discovering

        sheet.close()

        assertTrue(open)
        assertFalse(port.discovering)
        assertEquals(0, scheduler.pending)
    }

}

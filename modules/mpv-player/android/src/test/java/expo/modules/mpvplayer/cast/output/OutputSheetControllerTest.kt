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
            it.environment = OutputSheetEnvironment(receiverTitle = receiverTitle)
            it.onOutput = { output -> outputs += output }
            it.open()
        }

    private fun rows(sheet: OutputSheetController) = (sheet.state as OutputSheetState.List).rows

    private fun row(sheet: OutputSheetController, device: TargetDevice) =
        rows(sheet).filterIsInstance<OutputRow.Device>().first { it.id == device.id }

    private fun panel(sheet: OutputSheetController) = sheet.state as OutputSheetState.Connected

    private fun port() = FakeTargetPort(known = listOf(livingRoom, bedroom), listsOnDiscovery = true)

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

    @Test
    fun thisDeviceChosenWhileCastingStopsTheTarget() {
        val port = port()
        val sheet = sheet(hubWith(port))
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

    // Rotating a tablet moves the sheet to a popover and back: what it shows stays as it was.
    @Test
    fun theStateSurvivesALayoutChange() {
        val port = port()
        val sheet = sheet(hubWith(port))
        port.emit("started", livingRoom)
        sheet.change()
        val before = sheet.state

        sheet.setWidth(720)
        val wide = sheet.layout
        sheet.setWidth(400)

        assertEquals(OutputLayout.POPOVER, wide)
        assertEquals(OutputLayout.SHEET, sheet.layout)
        assertEquals(before, sheet.state)
    }
}

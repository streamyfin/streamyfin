package expo.modules.mpvplayer.cast.output

import expo.modules.mpvplayer.cast.target.FakeCastDevices
import expo.modules.mpvplayer.cast.target.GoogleCastTargetPort
import expo.modules.mpvplayer.cast.target.RemoteTarget
import expo.modules.mpvplayer.cast.target.RemoteTargetSnapshot
import expo.modules.mpvplayer.cast.target.TargetDevice
import expo.modules.mpvplayer.cast.target.TargetPhase
import org.junit.Assert.assertEquals
import org.junit.Test

// What the output sheet draws, from the target state and from the screen that opened it. The same
// cases as OutputSheetTests.swift.
class OutputSheetModelTest {
    private val livingRoom = TargetDevice("device-a", "Living room", "Chromecast")
    private val bedroom = TargetDevice("device-b", "bedroom", "Google TV Streamer")
    private val attic = TargetDevice("device-c", "Attic speaker", "Google Home", videoOut = false)

    private fun input(
        snapshot: RemoteTargetSnapshot = RemoteTargetSnapshot.NONE,
        devices: List<TargetDevice> = listOf(livingRoom, bedroom, attic),
        searchTimedOut: Boolean = false,
        playServices: PlayServicesStatus = PlayServicesStatus.AVAILABLE,
        airPlay: AirPlayInput? = null,
        playingHere: String? = null,
    ) = OutputSheetInput(
        snapshot = snapshot,
        devices = devices,
        discovering = true,
        searchTimedOut = searchTimedOut,
        playServices = playServices,
        airPlay = airPlay,
        thisDevice = ThisDeviceKind.PHONE,
        playingHere = playingHere,
        receiverTitle = null,
        showingList = false,
        draggedVolume = null,
    )

    private fun rows(state: OutputSheetState) = (state as OutputSheetState.List).rows

    // A local order that ignores case: "bedroom" sorts between "Attic speaker" and "Living room".
    @Test
    fun theListPutsThisDeviceFirstThenTheDevicesByName() {
        val rows = rows(outputSheetState(input(playingHere = "Big Buck Bunny", airPlay = AirPlayInput(activeRoute = null))))

        assertEquals(
            listOf(
                OutputRow.ThisDevice(ThisDeviceKind.PHONE, playing = "Big Buck Bunny"),
                OutputRow.Device("device-c", "Attic speaker", videoOut = false, status = DeviceStatus.Idle),
                OutputRow.Device("device-b", "bedroom", videoOut = true, status = DeviceStatus.Idle),
                OutputRow.Device("device-a", "Living room", videoOut = true, status = DeviceStatus.Idle),
                OutputRow.AirPlay(activeRoute = null),
            ),
            rows,
        )
    }

    // Discovery can drop the receiver a session is on: its row stays, with its status.
    @Test
    fun aTargetMissingFromDiscoveryKeepsItsRow() {
        val connecting = RemoteTargetSnapshot(TargetPhase.CONNECTING, RemoteTarget.cast(livingRoom), reconnecting = false, error = null)

        val rows = rows(outputSheetState(input(snapshot = connecting, devices = listOf(bedroom))))

        assertEquals(
            listOf(
                OutputRow.ThisDevice(ThisDeviceKind.PHONE, playing = null),
                OutputRow.Device("device-b", "bedroom", videoOut = true, status = DeviceStatus.Idle),
                OutputRow.Device("device-a", "Living room", videoOut = true, status = DeviceStatus.Connecting),
            ),
            rows,
        )
    }

    @Test
    fun missingPlayServicesSaySoInsteadOfSearching() {
        val missing = rows(outputSheetState(input(devices = emptyList(), playServices = PlayServicesStatus.MISSING)))
        val outdated = rows(outputSheetState(input(devices = emptyList(), playServices = PlayServicesStatus.UPDATE_REQUIRED)))

        assertEquals(OutputRow.Status(SheetStatus.PLAY_SERVICES_MISSING), missing.last())
        assertEquals(OutputRow.Status(SheetStatus.PLAY_SERVICES_UPDATE), outdated.last())
        assertEquals(2, missing.size)
    }

    // The port's own refusals by their message, the SDK's by CastStatusCodes (2155 is what a network loss
    // ends a session with, bench 04/11); anything else keeps its message.
    @Test
    fun failureCausesMapToTheirFamilies() {
        assertEquals(FailureCause.DeviceGone, failureCause(GoogleCastTargetPort.RECEIVER_GONE, null))
        assertEquals(FailureCause.DeviceGone, failureCause(FakeCastDevices.NOT_ON_THE_BENCH, null))
        assertEquals(FailureCause.ReceiverUnavailable, failureCause(GoogleCastTargetPort.RECEIVER_BUSY, null))
        listOf(7, 15, 2016, 2155).forEach { code ->
            assertEquals("code $code", FailureCause.Network, failureCause("Cast session status code $code ($code)", code))
        }
        listOf(2004, 2005).forEach { code ->
            assertEquals("code $code", FailureCause.ReceiverUnavailable, failureCause("Cast session status code $code ($code)", code))
        }
        assertEquals(FailureCause.Other("Cast session status code 2100 (2100)"), failureCause("Cast session status code 2100 (2100)", 2100))
    }

    @Test
    fun theLayoutIsAPopoverFrom600dp() {
        assertEquals(OutputLayout.SHEET, outputLayout(599))
        assertEquals(OutputLayout.POPOVER, outputLayout(600))
    }
}

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
        receiverTitle: String? = null,
        receiverPlaying: Boolean = receiverTitle != null,
    ) = OutputSheetInput(
        snapshot = snapshot,
        devices = devices,
        discovering = true,
        searchTimedOut = searchTimedOut,
        playServices = playServices,
        airPlay = airPlay,
        thisDevice = ThisDeviceKind.PHONE,
        playingHere = playingHere,
        receiverTitle = receiverTitle,
        receiverPlaying = receiverPlaying,
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

    // A cause outside the families reads as a failed connection: the SDK's own text, untranslated and with its
    // code, is for the log.
    @Test
    fun anUnknownCauseReadsAsAFailedConnection() {
        val strings = OutputPickerStrings(mapOf("failed" to "La connexion a échoué"))

        assertEquals("La connexion a échoué", strings.cause(FailureCause.Other("Cast session status code 2100 (2100)")))
        assertEquals("The connection failed", OutputPickerStrings().cause(FailureCause.Other("")))
    }

    // A speaker draws as one: the panel takes the receiver's screen from discovery's record of it, and a
    // receiver discovery dropped draws as a TV.
    @Test
    fun thePanelKnowsASpeakerByItsRecord() {
        fun connectedTo(device: TargetDevice) =
            RemoteTargetSnapshot(TargetPhase.CONNECTED, RemoteTarget.cast(device), reconnecting = false, error = null, volume = 0.5)

        val speaker = outputSheetState(input(snapshot = connectedTo(attic))) as OutputSheetState.Connected
        val tv = outputSheetState(input(snapshot = connectedTo(livingRoom))) as OutputSheetState.Connected
        val unlisted = outputSheetState(input(snapshot = connectedTo(attic), devices = listOf(livingRoom))) as OutputSheetState.Connected

        assertEquals(false, speaker.videoOut)
        assertEquals(true, tv.videoOut)
        assertEquals(true, unlisted.videoOut)
    }

    // Android mutes the playing stream, as the device's mute through the session would freeze it: with nothing
    // playing the button would do nothing, so it waits for something to play.
    @Test
    fun theMuteWaitsForSomethingToPlay() {
        val connected =
            RemoteTargetSnapshot(TargetPhase.CONNECTED, RemoteTarget.cast(livingRoom), reconnecting = false, error = null, volume = 0.5)

        val idle = outputSheetState(input(snapshot = connected)) as OutputSheetState.Connected
        val playing = outputSheetState(input(snapshot = connected, receiverTitle = "Big Buck Bunny")) as OutputSheetState.Connected

        assertEquals(false, idle.canMute)
        assertEquals(true, playing.canMute)
    }

    // The receiver's media can come without a title: it still plays, so the stop, the remote and the mute stay.
    @Test
    fun aReceiverPlayingWithoutATitleCanStillBeStopped() {
        val connected =
            RemoteTargetSnapshot(TargetPhase.CONNECTED, RemoteTarget.cast(livingRoom), reconnecting = false, error = null, volume = 0.5)

        val playing = outputSheetState(input(snapshot = connected, receiverPlaying = true)) as OutputSheetState.Connected

        assertEquals(true, playing.canStop)
        assertEquals(true, playing.canMute)
        assertEquals(null, playing.receiverTitle)
    }

    // Android only: a mute set on the device by another sender (Google Home) is one the app's stream mute cannot
    // lift. The button shows it, held still, instead of offering an unmute that does nothing.
    @Test
    fun aMuteSetOnTheDeviceCannotBeLiftedHere() {
        val deviceMuted = RemoteTargetSnapshot(
            TargetPhase.CONNECTED, RemoteTarget.cast(livingRoom), reconnecting = false, error = null, volume = 0.5,
            muted = true, deviceMuted = true,
        )

        val panel = outputSheetState(input(snapshot = deviceMuted, receiverTitle = "Big Buck Bunny")) as OutputSheetState.Connected

        assertEquals(true, panel.showsVolume)
        assertEquals(true, panel.muted)
        assertEquals(false, panel.canMute)
    }

    // A suspended session is still the receiver's: its panel stays, reading Reconnecting, while the SDK reaches
    // it again, instead of a list whose Cancel would end it (bench 05/11, iOS back from the background).
    @Test
    fun aReconnectingTargetKeepsItsPanel() {
        val reconnecting =
            RemoteTargetSnapshot(TargetPhase.CONNECTING, RemoteTarget.cast(livingRoom), reconnecting = true, error = null, volume = 0.5)

        val panel = outputSheetState(input(snapshot = reconnecting, receiverTitle = "Big Buck Bunny")) as OutputSheetState.Connected

        assertEquals("device-a", panel.target.id)
        assertEquals(true, panel.reconnecting)
        assertEquals(true, panel.canStop)
    }

    // The hub sends no volume or mute until the session is back: the row stays, held still, so the panel keeps its
    // height and offers nothing that would do nothing.
    @Test
    fun aReconnectingPanelHoldsItsVolumeStill() {
        val reconnecting =
            RemoteTargetSnapshot(TargetPhase.CONNECTING, RemoteTarget.cast(livingRoom), reconnecting = true, error = null, volume = 0.5)

        val panel = outputSheetState(input(snapshot = reconnecting, receiverTitle = "Big Buck Bunny")) as OutputSheetState.Connected

        assertEquals(true, panel.showsVolume)
        assertEquals(false, panel.canSetVolume)
        assertEquals(false, panel.canMute)
    }

    // A suspended session loses its media client until it resumes, and the resumed client reports nothing until the
    // receiver sends: the last status heard stands in meanwhile, until the receiver reports again or the session ends.
    @Test
    fun aSuspendedSessionReadsItsLastStatusUntilTheReceiverReports() {
        val heard = LastHeardStatus<String>()

        heard.hold("playing")
        val suspended = heard.read(null)
        val reported = heard.read("paused")
        heard.forget()

        assertEquals("playing", suspended)
        assertEquals("paused", reported)
        assertEquals(null, heard.read(null))
    }

    // Resumed, the client may not have reported when the session is suspended again: the status from the first
    // suspension still stands.
    @Test
    fun aSecondSuspensionBeforeAnyReportKeepsTheStatus() {
        val heard = LastHeardStatus<String>()

        heard.hold("playing")
        heard.hold(null)

        assertEquals("playing", heard.read(null))
    }

    @Test
    fun theLayoutIsAPopoverFrom600dp() {
        assertEquals(OutputLayout.SHEET, outputLayout(599))
        assertEquals(OutputLayout.POPOVER, outputLayout(600))
    }
}

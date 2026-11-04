package expo.modules.mpvplayer.cast.output

import expo.modules.mpvplayer.cast.target.FakeCastDevices
import expo.modules.mpvplayer.cast.target.GoogleCastTargetPort
import expo.modules.mpvplayer.cast.target.RemoteTarget
import expo.modules.mpvplayer.cast.target.RemoteTargetConstants
import expo.modules.mpvplayer.cast.target.RemoteTargetSnapshot
import expo.modules.mpvplayer.cast.target.TargetDevice
import expo.modules.mpvplayer.cast.target.TargetPhase
import java.text.Collator

// The output sheet as a value: what it shows follows from the target state and from the screen that
// opened it, so both platforms draw the same sheet and the tests read it without a UI.

/** Whether discovery can run: Android needs Play Services; iOS always can. */
enum class PlayServicesStatus { AVAILABLE, MISSING, UPDATE_REQUIRED }

enum class ThisDeviceKind { PHONE, TABLET }

/** The AirPlay row of iOS, with the name of the route in use when there is one. */
data class AirPlayInput(val activeRoute: String?)

data class OutputSheetInput(
    val snapshot: RemoteTargetSnapshot,
    val devices: List<TargetDevice>,
    val discovering: Boolean,
    val searchTimedOut: Boolean,
    val playServices: PlayServicesStatus,
    val airPlay: AirPlayInput?,
    val thisDevice: ThisDeviceKind,
    /** What plays on this device, null when nothing does. */
    val playingHere: String?,
    /** What the receiver plays, null when it plays nothing or names nothing. */
    val receiverTitle: String?,
    /** Something plays on the receiver, with a title or without. */
    val receiverPlaying: Boolean = false,
    /** "Change" asked for the list over a connected target. */
    val showingList: Boolean,
    /** The level under the finger, or the one sent until the receiver echoes it. */
    val draggedVolume: Double?,
    /** The receiver tapped while another holds the session: the hub starts it once that session ends. */
    val requestedId: String? = null,
)

sealed interface FailureCause {
    data object DeviceGone : FailureCause

    data object ReceiverUnavailable : FailureCause

    data object Network : FailureCause

    data class Other(val message: String) : FailureCause
}

sealed interface DeviceStatus {
    data object Idle : DeviceStatus

    data object Connecting : DeviceStatus

    data object Connected : DeviceStatus

    data class Failed(val cause: FailureCause) : DeviceStatus
}

enum class SheetStatus { SEARCHING, NO_DEVICES, PLAY_SERVICES_MISSING, PLAY_SERVICES_UPDATE }

sealed interface OutputRow {
    data class ThisDevice(val kind: ThisDeviceKind, val playing: String?) : OutputRow

    data class Device(val id: String, val name: String, val videoOut: Boolean, val status: DeviceStatus) : OutputRow

    data class AirPlay(val activeRoute: String?) : OutputRow

    data class Status(val status: SheetStatus) : OutputRow
}

sealed interface OutputSheetState {
    data class List(val rows: kotlin.collections.List<OutputRow>) : OutputSheetState

    data class Connected(
        val target: RemoteTarget,
        /** From discovery's record of the target: a speaker has none. */
        val videoOut: Boolean,
        val volume: Double?,
        val muted: Boolean,
        val canSetVolume: Boolean,
        /** Android mutes the playing stream, as the SDK's expanded controls do: none while the receiver plays nothing. */
        val canMute: Boolean,
        val reconnecting: Boolean,
        val receiverTitle: String?,
        /**
         * The receiver plays something: the end action reads "Stop playback" and the remote is offered.
         * Otherwise it reads "Disconnect"; both close the receiver app, which the session that launched
         * it does at its end whatever it asks.
         */
        val canStop: Boolean,
    ) : OutputSheetState
}

enum class OutputLayout { SHEET, POPOVER }

fun outputLayout(widthDp: Int) = if (widthDp >= RemoteTargetConstants.REGULAR_WIDTH_DP) OutputLayout.POPOVER else OutputLayout.SHEET

// CastStatusCodes, from the play-services-cast reference. 2155 is not documented: the SDK ends a session
// with it on a network loss, and on a switch, which the machine never shows as a failure (bench, 04/11).
private val NETWORK_CODES = setOf(7, 15, 2016, 2155)
private val RECEIVER_CODES = setOf(2004, 2005)

/** The family of a failure, for the line under its row: the port's refusals by message, the SDK's by code. */
fun failureCause(error: String?, code: Int?): FailureCause =
    when {
        error == GoogleCastTargetPort.RECEIVER_GONE || error == FakeCastDevices.NOT_ON_THE_BENCH -> FailureCause.DeviceGone
        error == GoogleCastTargetPort.RECEIVER_BUSY -> FailureCause.ReceiverUnavailable
        code in NETWORK_CODES -> FailureCause.Network
        code in RECEIVER_CODES -> FailureCause.ReceiverUnavailable
        else -> FailureCause.Other(error.orEmpty())
    }

fun outputSheetState(input: OutputSheetInput): OutputSheetState {
    val snapshot = input.snapshot
    val target = snapshot.target
    if (snapshot.phase == TargetPhase.CONNECTED && target != null && !input.showingList) {
        return OutputSheetState.Connected(
            target = target,
            videoOut = input.devices.firstOrNull { it.id == target.id }?.videoOut ?: true,
            volume = input.draggedVolume ?: snapshot.volume,
            muted = snapshot.muted,
            canSetVolume = target.volume && snapshot.volume != null,
            canMute = target.volume && snapshot.volume != null && input.receiverPlaying,
            reconnecting = snapshot.reconnecting,
            receiverTitle = input.receiverTitle,
            canStop = input.receiverPlaying,
        )
    }
    val rows = mutableListOf<OutputRow>(OutputRow.ThisDevice(input.thisDevice, input.playingHere))
    when (input.playServices) {
        PlayServicesStatus.MISSING -> rows += OutputRow.Status(SheetStatus.PLAY_SERVICES_MISSING)
        PlayServicesStatus.UPDATE_REQUIRED -> rows += OutputRow.Status(SheetStatus.PLAY_SERVICES_UPDATE)
        PlayServicesStatus.AVAILABLE -> {
            val devices = withTargets(input.devices, snapshot)
            if (devices.isEmpty()) {
                rows += OutputRow.Status(if (input.searchTimedOut) SheetStatus.NO_DEVICES else SheetStatus.SEARCHING)
            }
            // The local order, case left out.
            val collator = Collator.getInstance().apply { strength = Collator.SECONDARY }
            devices.sortedWith { a, b -> collator.compare(a.name, b.name) }.forEach { device ->
                rows += OutputRow.Device(device.id, device.name, device.videoOut, statusOf(device, input))
            }
        }
    }
    input.airPlay?.let { rows += OutputRow.AirPlay(it.activeRoute) }
    return OutputSheetState.List(rows)
}

// The receiver a session or a failure names stays listed when discovery has dropped it.
private fun withTargets(devices: List<TargetDevice>, snapshot: RemoteTargetSnapshot): List<TargetDevice> {
    val named = listOfNotNull(snapshot.target, snapshot.failedTarget?.takeIf { snapshot.error != null })
    val missing = named.filter { target -> devices.none { it.id == target.id } }.distinctBy { it.id }
    return devices + missing.map { TargetDevice(it.id, it.name) }
}

private fun statusOf(device: TargetDevice, input: OutputSheetInput): DeviceStatus {
    val snapshot = input.snapshot
    val onIt = snapshot.target?.id == device.id
    return when {
        onIt && snapshot.phase == TargetPhase.CONNECTED -> DeviceStatus.Connected
        onIt && snapshot.phase == TargetPhase.CONNECTING -> DeviceStatus.Connecting
        device.id == input.requestedId -> DeviceStatus.Connecting
        snapshot.error != null && snapshot.failedTarget?.id == device.id ->
            DeviceStatus.Failed(failureCause(snapshot.error, snapshot.errorCode))
        else -> DeviceStatus.Idle
    }
}

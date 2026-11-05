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
    /** What the receiver plays can go on on this device: a Jellyfin item, neither live TV nor music. */
    val receiverGoesOnHere: Boolean = false,
    /** "Change" asked for the list over a connected target. */
    val showingList: Boolean,
    /** The level under the finger, or the one sent until the receiver echoes it. */
    val draggedVolume: Double?,
    /** The receiver tapped while another holds the session: the hub starts it once that session ends. */
    val requestedId: String? = null,
    /** Opened from the player, whose video the receiver can take. */
    val handOff: Boolean = false,
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
    /** [continueHere]: the receiver plays, outside the player, and a tap takes its video over on this device. */
    data class ThisDevice(val kind: ThisDeviceKind, val playing: String?, val continueHere: Boolean = false) : OutputRow

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
        /** The receiver has a level to set: the volume row is drawn. */
        val showsVolume: Boolean,
        /** The row takes a change: not while the session reconnects, as the hub sends none until it is back. */
        val canSetVolume: Boolean,
        /**
         * Android mutes the playing stream, as muting the device through the session would stop it following the
         * receiver: none while the receiver plays nothing, nor over a mute set on the device itself, which the
         * stream's cannot lift.
         */
        val canMute: Boolean,
        val reconnecting: Boolean,
        val receiverTitle: String?,
        /**
         * The receiver plays something: the end action reads "Stop playback" and the remote is offered.
         * Otherwise it reads "Disconnect"; both close the receiver app, which the session that launched
         * it does at its end whatever it asks.
         */
        val canStop: Boolean,
        /** Opened from the player, over a connected receiver: "Play on" hands the video off. Not while reconnecting. */
        val canHandOff: Boolean,
    ) : OutputSheetState
}

enum class OutputLayout { SHEET, POPOVER }

fun outputLayout(widthDp: Int) = if (widthDp >= RemoteTargetConstants.REGULAR_WIDTH_DP) OutputLayout.POPOVER else OutputLayout.SHEET

/**
 * The receiver's media status as the sheet reads it. A suspended session loses its media client until it resumes,
 * and the resumed client reports nothing until the receiver sends: the last status heard stands in meanwhile, so the
 * panel keeps what the receiver plays. Main thread only, like the module that holds it.
 */
class LastHeardStatus<T : Any> {
    private var held: T? = null

    /** The session is suspended with this last status; none keeps the one an earlier suspension held. */
    fun hold(last: T?) {
        held = last ?: held
    }

    fun read(live: T?): T? = live ?: held

    /** The receiver reported again, or the session ended or gave way to another. */
    fun forget() {
        held = null
    }
}

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
    // A suspended session stays the receiver's while the SDK reaches it again: its panel reads Reconnecting.
    val held =
        snapshot.phase == TargetPhase.CONNECTED || (snapshot.phase == TargetPhase.CONNECTING && snapshot.reconnecting)
    if (held && target != null && !input.showingList) {
        val showsVolume = target.volume && snapshot.volume != null
        return OutputSheetState.Connected(
            target = target,
            videoOut = input.devices.firstOrNull { it.id == target.id }?.videoOut ?: true,
            volume = input.draggedVolume ?: snapshot.volume,
            muted = snapshot.muted,
            showsVolume = showsVolume,
            canSetVolume = showsVolume && !snapshot.reconnecting,
            canMute = showsVolume && input.receiverPlaying && !snapshot.reconnecting && !snapshot.deviceMuted,
            reconnecting = snapshot.reconnecting,
            receiverTitle = input.receiverTitle,
            canStop = input.receiverPlaying,
            canHandOff = input.handOff && snapshot.phase == TargetPhase.CONNECTED,
        )
    }
    // In the player the phone already has its video: there this row stops the receiver, as before.
    val continueHere =
        !input.handOff && snapshot.phase == TargetPhase.CONNECTED && input.receiverPlaying && input.receiverGoesOnHere
    val rows = mutableListOf<OutputRow>(OutputRow.ThisDevice(input.thisDevice, input.playingHere, continueHere))
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

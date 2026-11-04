package expo.modules.mpvplayer.cast.output

import expo.modules.mpvplayer.cast.target.RemoteTargetConstants
import expo.modules.mpvplayer.cast.target.RemoteTargetHub
import expo.modules.mpvplayer.cast.target.RemoteTargetListener
import expo.modules.mpvplayer.cast.target.RemoteTargetSnapshot
import expo.modules.mpvplayer.cast.target.TargetDevice
import expo.modules.mpvplayer.cast.target.TargetPhase
import kotlin.math.abs

/** What the sheet hands back to the platform: AirPlay's picker, Play Services' dialog, the remote, closing. */
enum class OutputSheetOutput { OPEN_AIRPLAY, RESOLVE_PLAY_SERVICES, REMOTE, DISMISS }

/** What the screen that opened the sheet knows, and the hub does not. */
data class OutputSheetEnvironment(
    val playServices: PlayServicesStatus = PlayServicesStatus.AVAILABLE,
    val airPlay: AirPlayInput? = null,
    val thisDevice: ThisDeviceKind = ThisDeviceKind.PHONE,
    val playingHere: String? = null,
    val receiverTitle: String? = null,
)

/**
 * The output sheet's behaviour, on the hub: discovery while it is open, the requests a tap makes, and
 * the slider held between a release and the receiver's echo. Main thread only, like the hub.
 */
class OutputSheetController(
    private val hub: RemoteTargetHub,
    private val schedule: (Long, () -> Unit) -> (() -> Unit),
) : RemoteTargetListener {
    var environment = OutputSheetEnvironment()
        set(value) {
            field = value
            publish()
        }
    var onState: ((OutputSheetState) -> Unit)? = null
    var onOutput: ((OutputSheetOutput) -> Unit)? = null
    var layout = OutputLayout.SHEET
        private set

    private var open = false
    private var searchTimedOut = false
    private var showingList = false
    private var dragged: Double? = null
    private var held: Double? = null
    private var requestedId: String? = null
    // The receiver whose connection brings the panel back over the list "Change" opened.
    private var panelOn: String? = null
    private var removeListener: (() -> Unit)? = null
    private var cancelSearch: (() -> Unit)? = null
    private var cancelSettle: (() -> Unit)? = null

    var state: OutputSheetState = outputSheetState(input())
        private set

    fun open() {
        if (open) return
        open = true
        searchTimedOut = false
        removeListener = hub.addListener(this)
        hub.startDiscovery(RemoteTargetHub.SHEET_DISCOVERY)
        cancelSearch = schedule(RemoteTargetConstants.OUTPUT_SEARCH_TIMEOUT_MS) {
            cancelSearch = null
            searchTimedOut = true
            publish()
        }
        publish()
    }

    fun close() {
        if (!open) return
        open = false
        cancelSearch?.invoke()
        cancelSearch = null
        cancelSettle?.invoke()
        cancelSettle = null
        removeListener?.invoke()
        removeListener = null
        hub.stopDiscovery(RemoteTargetHub.SHEET_DISCOVERY)
        showingList = false
        dragged = null
        held = null
        requestedId = null
        panelOn = null
    }

    fun tap(row: OutputRow) {
        when (row) {
            is OutputRow.Device -> connect(row.id)
            // Playback comes back to this phone: the target stops (the hand-off at the position comes with B4).
            is OutputRow.ThisDevice -> {
                if (hub.snapshot.phase != TargetPhase.NONE) hub.disconnect(stopPlayback = true)
                onOutput?.invoke(OutputSheetOutput.DISMISS)
            }
            is OutputRow.AirPlay -> onOutput?.invoke(OutputSheetOutput.OPEN_AIRPLAY)
            is OutputRow.Status ->
                if (row.status == SheetStatus.PLAY_SERVICES_MISSING || row.status == SheetStatus.PLAY_SERVICES_UPDATE) {
                    onOutput?.invoke(OutputSheetOutput.RESOLVE_PLAY_SERVICES)
                }
        }
    }

    /** A connection or a switch on its way: the session goes, the asked receiver with it. */
    fun cancel() {
        requestedId = null
        panelOn = null
        hub.disconnect(stopPlayback = true)
        publish()
    }

    fun change() {
        showingList = true
        publish()
    }

    fun dragVolume(level: Double) {
        dragged = level.coerceIn(0.0, 1.0)
        publish()
    }

    /** Sent once, at the release; the slider keeps that level until the receiver echoes it, or a moment. */
    fun releaseVolume(level: Double) {
        val sent = level.coerceIn(0.0, 1.0)
        dragged = null
        held = sent
        hub.setVolume(sent)
        cancelSettle?.invoke()
        cancelSettle = schedule(RemoteTargetConstants.VOLUME_SETTLE_MS) {
            cancelSettle = null
            held = null
            publish()
        }
        publish()
    }

    fun toggleMute() = hub.setMuted(!hub.snapshot.muted)

    /** The one end action: it closes the receiver app, as the end of a session this phone launched does anyway. */
    fun stop() {
        requestedId = null
        hub.disconnect(stopPlayback = true)
    }

    fun remote() = onOutput?.invoke(OutputSheetOutput.REMOTE)

    /** A rotation moves the sheet to a popover and back; what it shows stays as it was. */
    fun setWidth(widthDp: Int) {
        layout = outputLayout(widthDp)
    }

    override fun targetChanged(snapshot: RemoteTargetSnapshot) {
        val sent = held
        val level = snapshot.volume
        if (sent != null && level != null && abs(level - sent) <= RemoteTargetConstants.VOLUME_ECHO_TOLERANCE) {
            held = null
            cancelSettle?.invoke()
            cancelSettle = null
        }
        // The asked receiver took the session, or refused it: the state says so from now on.
        val asked = requestedId
        if (asked != null && (snapshot.target?.id == asked || snapshot.failedTarget?.id == asked)) requestedId = null
        val panel = panelOn
        if (panel != null && snapshot.failedTarget?.id == panel && snapshot.error != null) panelOn = null
        if (panel != null && snapshot.phase == TargetPhase.CONNECTED && snapshot.target?.id == panel) {
            panelOn = null
            showingList = false
        }
        publish()
    }

    override fun devicesChanged(devices: List<TargetDevice>) = publish()

    private fun connect(deviceId: String) {
        val holder = hub.snapshot.target
        if (!hub.connect(deviceId)) return
        if (holder?.id == deviceId) {
            // The receiver already there: back to its panel.
            showingList = false
        } else {
            // Over another receiver's session the hub waits for its end: the row shows the request meanwhile,
            // and the list stays until the asked receiver is connected.
            requestedId = deviceId.takeIf { holder != null }
            panelOn = deviceId
        }
        publish()
    }

    private fun input() =
        OutputSheetInput(
            snapshot = hub.snapshot,
            devices = hub.devices,
            discovering = open,
            searchTimedOut = searchTimedOut,
            playServices = environment.playServices,
            airPlay = environment.airPlay,
            thisDevice = environment.thisDevice,
            playingHere = environment.playingHere,
            receiverTitle = environment.receiverTitle,
            showingList = showingList,
            draggedVolume = dragged ?: held,
            requestedId = requestedId,
        )

    private fun publish() {
        val next = outputSheetState(input())
        if (next == state) return
        state = next
        onState?.invoke(next)
    }
}

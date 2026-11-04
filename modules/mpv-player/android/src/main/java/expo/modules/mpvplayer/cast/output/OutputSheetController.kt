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
    val receiverPlaying: Boolean = false,
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
    // The level the rest sent for a drag still under the finger: its release then asks nothing more.
    private var restSent: Double? = null
    private var discoveryPaused = false
    private var requestedId: String? = null
    // The receiver whose connection brings the panel back over the list "Change" opened.
    private var panelOn: String? = null
    private var removeListener: (() -> Unit)? = null
    private var cancelSearch: (() -> Unit)? = null
    private var cancelSettle: (() -> Unit)? = null
    private var cancelRest: (() -> Unit)? = null

    var state: OutputSheetState = outputSheetState(input())
        private set

    fun open() {
        if (open) return
        open = true
        searchTimedOut = false
        discoveryPaused = false
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
        cancelRest?.invoke()
        cancelRest = null
        removeListener?.invoke()
        removeListener = null
        hub.stopDiscovery(RemoteTargetHub.SHEET_DISCOVERY)
        discoveryPaused = false
        showingList = false
        dragged = null
        held = null
        restSent = null
        requestedId = null
        panelOn = null
    }

    /**
     * The app is out of sight: an active scan costs battery, so the sheet's discovery waits for it to come back.
     * Android only: the iOS SDK suspends its discovery in the background itself.
     */
    fun pauseDiscovery() {
        if (!open || discoveryPaused) return
        discoveryPaused = true
        hub.stopDiscovery(RemoteTargetHub.SHEET_DISCOVERY)
    }

    fun resumeDiscovery() {
        if (!open || !discoveryPaused) return
        discoveryPaused = false
        hub.startDiscovery(RemoteTargetHub.SHEET_DISCOVERY)
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
        restSent = null
        // A release that never comes must not leave the level unsent: a slider left still counts as released.
        cancelRest?.invoke()
        cancelRest = schedule(RemoteTargetConstants.VOLUME_DRAG_REST_MS) {
            cancelRest = null
            dragged?.let { level ->
                releaseVolume(level)
                restSent = level
            }
        }
        publish()
    }

    /** Sent once, at the release; the slider keeps that level until the receiver echoes it, or a moment. */
    fun releaseVolume(level: Double) {
        cancelRest?.invoke()
        cancelRest = null
        val sent = level.coerceIn(0.0, 1.0)
        val rested = restSent
        restSent = null
        if (rested == sent) return
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
        // The asked receiver took the session, or refused it: the state says so from now on. The receiver a switch
        // leaves is the target until its session ends, which takes nothing.
        val asked = requestedId
        val took = snapshot.target?.id == asked && (snapshot.phase == TargetPhase.CONNECTING || snapshot.phase == TargetPhase.CONNECTED)
        if (asked != null && (took || snapshot.failedTarget?.id == asked)) requestedId = null
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
        // The receiver already there, which discovery may have lost: back to its panel. During a switch the sheet
        // asked for, it is a request like another's.
        if (holder?.id == deviceId && requestedId == null) {
            hub.connect(deviceId)
            showingList = false
            publish()
            return
        }
        // Over a session the hub waits for its end: the row shows the request meanwhile, and the list stays until the
        // asked receiver is connected. Set before the request, as a port can refuse inside it; a refused request
        // leaves a switch on its way as it was.
        val requested = requestedId
        val panel = panelOn
        requestedId = deviceId.takeIf { holder != null }
        panelOn = deviceId
        if (!hub.connect(deviceId)) {
            requestedId = requested
            panelOn = panel
            return
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
            receiverPlaying = environment.receiverPlaying,
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

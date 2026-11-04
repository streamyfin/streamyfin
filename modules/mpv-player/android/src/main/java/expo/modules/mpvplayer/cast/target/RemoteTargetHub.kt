package expo.modules.mpvplayer.cast.target

/** Hears the target state and the receivers through the hub. */
interface RemoteTargetListener {
    fun targetChanged(snapshot: RemoteTargetSnapshot)
    fun devicesChanged(devices: List<TargetDevice>)
}

/**
 * Where playback goes, for the whole process: the module publishes it to JS, and native callers (the
 * debug probe) read and drive it without JS in between. The hub reaches the receivers through one
 * port at a time. Main thread only; [snapshot] and [devices] can be read from any thread.
 */
class RemoteTargetHub {
    private var machine = RemoteTargetMachine()
    private val listeners = mutableListOf<RemoteTargetListener>()
    private var port: TargetPort? = null
    // Discovery runs while anyone still asks for it: each owner releases only its own request.
    private val discoveryOwners = mutableSetOf<String>()

    @Volatile
    var snapshot: RemoteTargetSnapshot = RemoteTargetSnapshot.NONE
        private set

    @Volatile
    var devices: List<TargetDevice> = emptyList()
        private set

    /**
     * True after a disconnect that asked to keep the receiver playing, until the next connection; the module
     * marks the end it brings. The receiver keeps playing only when this session joined it: the session that
     * launched the receiver app stops it at its end whatever it asks, on both SDKs (bench, 04/11).
     */
    @Volatile
    var disconnectedWithoutStop = false
        private set

    /** The same port again does nothing, so every JS reload can install it. */
    fun install(port: TargetPort) {
        if (port === this.port) return
        this.port?.stop()
        this.port = port
        // A target the old port reported means nothing to the new one.
        machine = RemoteTargetMachine()
        publish()
        updateDevices(emptyList())
        // The devices come from discovery, as before the hub: a port lists none until it is asked to look.
        port.start(eventsFor(port))
        if (discoveryOwners.isNotEmpty()) port.startDiscovery()
    }

    /** A new listener hears changes from now on; it reads [snapshot] and [devices] for the present. */
    fun addListener(listener: RemoteTargetListener): () -> Unit {
        listeners += listener
        return { listeners.remove(listener) }
    }

    /** False, with nothing changed, when the port does not know the device. */
    fun connect(deviceId: String): Boolean {
        val port = this.port ?: return false
        val device = port.devices().firstOrNull { it.id == deviceId } ?: return false
        disconnectedWithoutStop = false
        val current = snapshot
        val held = current.target?.id == deviceId && (current.phase == TargetPhase.CONNECTING || current.phase == TargetPhase.CONNECTED)
        // The receiver already there asks nothing, unless a switch is taking its session away.
        if (held && !machine.isSwitching) return true
        // Announced before the port is asked: its first event can come back inside connect.
        if (machine.connectRequested(device)) publish()
        // While another device is connected, the port ends that session before this one starts: the
        // Android SDK does it on route selection, the iOS port asks for it.
        port.connect(device)
        return true
    }

    /** The state follows the port's events, ending then ended, not this call. */
    fun disconnect(stopPlayback: Boolean) {
        disconnectedWithoutStop = !stopPlayback
        machine.disconnectRequested()
        port?.disconnect(stopPlayback)
    }

    /** Bounded to 0..1, and only for a connected receiver: the state follows what the SDK reports back. */
    fun setVolume(level: Double) {
        if (snapshot.phase != TargetPhase.CONNECTED) return
        port?.setVolume(level.coerceIn(0.0, 1.0))
    }

    fun setMuted(muted: Boolean) {
        if (snapshot.phase != TargetPhase.CONNECTED) return
        port?.setMuted(muted)
    }

    /** [owner] names who asks ([APP_DISCOVERY], [PROBE_DISCOVERY]); asking twice still takes one stop. */
    fun startDiscovery(owner: String) {
        if (discoveryOwners.add(owner) && discoveryOwners.size == 1) port?.startDiscovery()
    }

    fun stopDiscovery(owner: String) {
        if (discoveryOwners.remove(owner) && discoveryOwners.isEmpty()) port?.stopDiscovery()
    }

    // Each port gets its own events: one replaced, or stopped late, is no longer heard.
    private fun eventsFor(port: TargetPort) = object : TargetPortEvents {
        override fun sessionEvent(event: String, device: TargetDevice?, error: String?) =
            sessionEvent(event, device, error, null)

        override fun sessionEvent(event: String, device: TargetDevice?, error: String?, code: Int?) {
            if (this@RemoteTargetHub.port !== port) return
            // A session the SDK starts on its own, from its dialog, is a new connection too; a session the SDK
            // kept, or one that came back, is no end of that disconnect any more.
            if (event == "starting" || event == "endRefused" || event == "resumed") disconnectedWithoutStop = false
            if (machine.sessionEvent(event, device, error, code)) publish()
        }

        override fun volumeChanged(level: Double, muted: Boolean) {
            if (this@RemoteTargetHub.port !== port) return
            if (machine.volumeChanged(level, muted)) publish()
        }

        override fun devicesChanged(devices: List<TargetDevice>) {
            if (this@RemoteTargetHub.port === port) updateDevices(devices)
        }
    }

    private fun publish() {
        val next = machine.snapshot
        if (next == snapshot) return
        snapshot = next
        listeners.toList().forEach { it.targetChanged(next) }
    }

    private fun updateDevices(next: List<TargetDevice>) {
        if (next == devices) return
        devices = next
        listeners.toList().forEach { it.devicesChanged(next) }
    }

    companion object {
        val shared = RemoteTargetHub()

        /** The app's own request: the module, for JS and its foreground pauses. */
        const val APP_DISCOVERY = "app"

        /** The debug probe's. */
        const val PROBE_DISCOVERY = "probe"

        /** The output sheet's, while it is open. */
        const val SHEET_DISCOVERY = "sheet"
    }
}

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

    @Volatile
    var snapshot: RemoteTargetSnapshot = RemoteTargetSnapshot.NONE
        private set

    @Volatile
    var devices: List<TargetDevice> = emptyList()
        private set

    /** The same port again does nothing, so every JS reload can install it. */
    fun install(port: TargetPort) {
        if (port === this.port) return
        this.port?.stop()
        this.port = port
        // A target the old port reported means nothing to the new one.
        machine = RemoteTargetMachine()
        publish()
        // The devices come from discovery, as before the hub: a port lists none until it is asked to look.
        port.start(eventsFor(port))
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
        val current = snapshot
        if (current.target?.id == deviceId && (current.phase == TargetPhase.CONNECTING || current.phase == TargetPhase.CONNECTED)) {
            return true
        }
        // Announced before the port is asked: its first event can come back inside connect.
        if (machine.connectRequested(device)) publish()
        // While another device is connected, the port ends that session before this one starts: the
        // Android SDK does it on route selection, the iOS port asks for it.
        port.connect(device)
        return true
    }

    /** The state follows the port's events, ending then ended, not this call. */
    fun disconnect(stopPlayback: Boolean) {
        machine.disconnectRequested()
        port?.disconnect(stopPlayback)
    }

    fun startDiscovery() {
        port?.startDiscovery()
    }

    fun stopDiscovery() {
        port?.stopDiscovery()
    }

    // Each port gets its own events: one replaced, or stopped late, is no longer heard.
    private fun eventsFor(port: TargetPort) = object : TargetPortEvents {
        override fun sessionEvent(event: String, device: TargetDevice?, error: String?) {
            if (this@RemoteTargetHub.port !== port) return
            if (machine.sessionEvent(event, device, error)) publish()
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
    }
}

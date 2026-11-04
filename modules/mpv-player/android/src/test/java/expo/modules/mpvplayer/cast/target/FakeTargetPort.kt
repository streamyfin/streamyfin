package expo.modules.mpvplayer.cast.target

/** Stands in for the SDK: records what the hub asks, and replays the events a test hands it. */
class FakeTargetPort(
    private val atStart: List<Triple<String, TargetDevice?, String?>> = emptyList(),
    var known: List<TargetDevice> = emptyList(),
    /** Lists [known] inside startDiscovery, as the SDK port does with the routes MediaRouter already has. */
    private val listsOnDiscovery: Boolean = false,
    /** Devices whose connection the port answers at once with startFailed, as a disabled route is. */
    private val refuses: Set<String> = emptySet(),
) : TargetPort {
    // Kept after stop, so a test can play a stale port talking to the hub.
    var events: TargetPortEvents? = null
    var starts = 0
    var stopped = false
    var discovering = false
    val connects = mutableListOf<TargetDevice>()
    val disconnects = mutableListOf<Boolean>()
    val volumes = mutableListOf<Double>()
    val mutes = mutableListOf<Boolean>()

    override fun start(events: TargetPortEvents) {
        this.events = events
        starts += 1
        atStart.forEach { (event, device, error) -> events.sessionEvent(event, device, error) }
    }

    override fun stop() {
        stopped = true
    }

    override fun devices(): List<TargetDevice> = known

    override fun startDiscovery() {
        discovering = true
        if (listsOnDiscovery) events?.devicesChanged(known)
    }

    override fun stopDiscovery() {
        discovering = false
    }

    override fun connect(device: TargetDevice) {
        connects += device
        if (device.id in refuses) events?.sessionEvent("startFailed", device, "refused")
    }

    override fun disconnect(stopPlayback: Boolean) {
        disconnects += stopPlayback
    }

    override fun setVolume(level: Double) {
        volumes += level
    }

    override fun setMuted(muted: Boolean) {
        mutes += muted
    }

    fun emit(event: String, device: TargetDevice?, error: String? = null) {
        events?.sessionEvent(event, device, error)
    }

    fun discover(devices: List<TargetDevice>) {
        known = devices
        events?.devicesChanged(devices)
    }
}

package expo.modules.mpvplayer.cast.target

/**
 * Two receivers that exist only in a tier 1 build (e2e/README.md, "Fake Cast receivers"): they connect
 * and end on timers, through the states a real receiver walks the hub through, so the flows that pick
 * a target run without one. RemoteTargets installs them only when the build asked for them.
 */
class FakeCastDevices(private val schedule: (Long, () -> Unit) -> (() -> Unit)) : TargetPort {
    private var events: TargetPortEvents? = null
    private var current: TargetDevice? = null
    private var pending: (() -> Unit)? = null

    override fun start(events: TargetPortEvents) {
        this.events = events
    }

    override fun stop() {
        cancelPending()
        events = null
    }

    override fun devices(): List<TargetDevice> = DEVICES

    override fun startDiscovery() {
        events?.devicesChanged(DEVICES)
    }

    override fun stopDiscovery() = Unit

    override fun connect(device: TargetDevice) {
        if (DEVICES.none { it.id == device.id }) {
            events?.sessionEvent("startFailed", device, NOT_ON_THE_BENCH)
            return
        }
        // Like the SDK, the session on another receiver ends before this one starts.
        current?.let { previous ->
            cancelPending()
            events?.sessionEvent("ending", previous, null)
            events?.sessionEvent("ended", previous, null)
        }
        current = device
        events?.sessionEvent("starting", device, null)
        pending = schedule(RemoteTargetConstants.FAKE_CONNECT_DELAY_MS) {
            pending = null
            events?.sessionEvent("started", device, null)
        }
    }

    override fun disconnect(stopPlayback: Boolean) {
        val device = current
        cancelPending()
        if (device == null) {
            events?.sessionEvent("ended", null, null)
            return
        }
        events?.sessionEvent("ending", device, null)
        pending = schedule(RemoteTargetConstants.FAKE_END_DELAY_MS) {
            pending = null
            current = null
            events?.sessionEvent("ended", device, null)
        }
    }

    private fun cancelPending() {
        pending?.invoke()
        pending = null
    }

    companion object {
        const val NOT_ON_THE_BENCH = "Not one of the fake receivers"
        val DEVICES = listOf(
            TargetDevice("fake-cast-living-room", "Bench TV", "Fake Chromecast"),
            TargetDevice("fake-cast-bedroom", "Bench Speaker", "Fake Cast speaker"),
        )
    }
}

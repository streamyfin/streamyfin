package expo.modules.mpvplayer.cast.target

/** What a port tells the hub: the SDK's session events, under the names the module emits, and what discovery sees. */
interface TargetPortEvents {
    fun sessionEvent(event: String, device: TargetDevice?, error: String?)
    fun devicesChanged(devices: List<TargetDevice>)
}

/**
 * The receivers as the hub reaches them: the Cast SDK (GoogleCastTargetPort), or the fake ones a
 * tier 1 build asks for. Main thread only, like the SDK.
 */
interface TargetPort {
    /** A session already running when the port starts is reported as resumed. */
    fun start(events: TargetPortEvents)
    fun stop()
    fun devices(): List<TargetDevice>
    fun startDiscovery()
    fun stopDiscovery()

    /** Always answered with session events: a connection the port cannot start ends in startFailed. */
    fun connect(device: TargetDevice)
    fun disconnect(stopPlayback: Boolean)
}

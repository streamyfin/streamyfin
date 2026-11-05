package expo.modules.mpvplayer.cast.target

/** What a port tells the hub: the SDK's session events, under the names the module emits, and what discovery sees. */
interface TargetPortEvents {
    fun sessionEvent(event: String, device: TargetDevice?, error: String?)

    /** The same, with the SDK's status code for [error] when the SDK gave one. */
    fun sessionEvent(event: String, device: TargetDevice?, error: String?, code: Int?) = sessionEvent(event, device, error)

    fun devicesChanged(devices: List<TargetDevice>)

    /** The receiver's volume, 0 to 1, and its mute, as the SDK reports them for the current session. */
    fun volumeChanged(level: Double, muted: Boolean) = Unit

    /** The same, with the device's own mute apart: Android mutes the stream, which cannot lift that one. */
    fun volumeChanged(level: Double, muted: Boolean, deviceMuted: Boolean) = volumeChanged(level, muted)
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

    /** The current session's receiver volume, 0 to 1; the state follows what the SDK reports back. */
    fun setVolume(level: Double)
    fun setMuted(muted: Boolean)
}

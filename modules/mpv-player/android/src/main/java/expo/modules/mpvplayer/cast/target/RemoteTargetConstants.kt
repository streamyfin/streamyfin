package expo.modules.mpvplayer.cast.target

/** The fake receivers' pace (FakeCastDevices): long enough for a tier 1 flow to see each state. */
object RemoteTargetConstants {
    const val FAKE_CONNECT_DELAY_MS = 600L
    const val FAKE_END_DELAY_MS = 300L
    // How long a fake receiver takes to report back the volume it was set to, as a real one does.
    const val FAKE_VOLUME_ECHO_MS = 100L
}

package expo.modules.mpvplayer.cast.target

/** The fake receivers' pace (FakeCastDevices), and the output sheet's timings and sizes. */
object RemoteTargetConstants {
    // Long enough for a tier 1 flow to see each state.
    const val FAKE_CONNECT_DELAY_MS = 600L
    const val FAKE_END_DELAY_MS = 300L
    // How long a fake receiver takes to report back the volume it was set to, as a real one does.
    const val FAKE_VOLUME_ECHO_MS = 100L

    // The sheet says no receiver was found after this long without one.
    const val OUTPUT_SEARCH_TIMEOUT_MS = 10_000L
    // A released slider keeps the level it sent this long at most, waiting for the receiver's echo.
    const val VOLUME_SETTLE_MS = 1_000L
    // How close the echo must come to the level sent: one step of the Cast route on Android (1 of 20).
    const val VOLUME_ECHO_TOLERANCE = 0.05
    // From this width the sheet opens as a popover (tablets, foldables, landscape phones).
    const val REGULAR_WIDTH_DP = 600
}

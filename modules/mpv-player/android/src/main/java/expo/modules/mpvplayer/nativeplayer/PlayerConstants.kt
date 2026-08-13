package expo.modules.mpvplayer.nativeplayer

object PlayerConstants {
    val SUBTITLE_SCALE_PRESETS = listOf(0.1, 0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 2.5, 3.0)
    val SYNC_OFFSET_PRESETS = listOf(-5.0, -2.0, -1.0, -0.5, -0.25, 0.0, 0.25, 0.5, 1.0, 2.0, 5.0)
    val VOLUME_BOOST_PRESETS = listOf(100, 125, 150, 200)
    val SLEEP_TIMER_PRESET_MINUTES = listOf(15, 30, 45, 60, 90, 120)
    val SPEED_PRESETS = listOf(0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0)

    const val AUTO_HIDE_DELAY_MS = 4000L
    const val MENU_AUTO_HIDE_DELAY_MS = 15000L
    const val CHAPTER_RESTART_THRESHOLD_SEC = 3.0
    const val VERTICAL_DRAG_RANGE_DP = 280f
    const val PINCH_ZOOM_IN_THRESHOLD = 1.12f
    const val PINCH_ZOOM_OUT_THRESHOLD = 0.88f
    const val HOLD_SPEED_ENGAGE_DELAY_MS = 500L
    const val ECHO_SUPPRESSION_WINDOW_MS = 500L
}

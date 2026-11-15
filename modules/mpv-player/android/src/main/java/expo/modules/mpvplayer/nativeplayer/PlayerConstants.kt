package expo.modules.mpvplayer.nativeplayer

object PlayerConstants {
    val SUBTITLE_SCALE_PRESETS = listOf(0.1, 0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 2.5, 3.0)
    val SYNC_OFFSET_PRESETS = listOf(-5.0, -2.0, -1.0, -0.5, -0.25, 0.0, 0.25, 0.5, 1.0, 2.0, 5.0)
    val VOLUME_BOOST_PRESETS = listOf(100, 125, 150, 200)
    val SLEEP_TIMER_PRESET_MINUTES = listOf(15, 30, 45, 60, 90, 120)
    val SPEED_PRESETS = listOf(0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0)

    const val AUTO_HIDE_DELAY_MS = 4000L
    /** A group Unpause closer to the decoder than this plays without seeking. Same value as iOS. */
    const val SYNC_PLAY_UNPAUSE_SEEK_TOLERANCE_SEC = 0.1
    const val MENU_AUTO_HIDE_DELAY_MS = 15000L
    const val CHAPTER_RESTART_THRESHOLD_SEC = 3.0
    const val VERTICAL_DRAG_RANGE_DP = 280f
    /**
     * Height of the strip at the top and at the bottom of the gesture plane
     * where a drag is left to the system. The status bar, the notification
     * shade and the navigation bar are pulled in from those edges, and the
     * player gets the same swipe: without the strip it changed the volume or
     * the brightness on the way. One minimum touch target, which a finger
     * coming in over the bezel lands well inside.
     */
    const val EDGE_DRAG_DEAD_ZONE_DP = 48f
    const val PINCH_ZOOM_IN_THRESHOLD = 1.12f
    const val PINCH_ZOOM_OUT_THRESHOLD = 0.88f
    const val HOLD_SPEED_ENGAGE_DELAY_MS = 500L
    const val ECHO_SUPPRESSION_WINDOW_MS = 500L
    const val TV_SEEK_FEEDBACK_DURATION_MS = 2500L
    const val TV_SCRUB_ACCEL_REPEATS_PER_STEP = 4
    const val TV_SCRUB_ACCEL_MAX_MULTIPLIER = 12.0

    // Uniform scale for the whole TV chrome, applied as a LocalDensity
    // override at the TvPlayerScreen root — the dp/sp values in the ui/tv
    // composables were authored too large for a 10-foot layout.
    const val TV_CHROME_SCALE = 0.7f

    // The fake remote engine (tests, debug probe): how long its "TV" takes to load, and how long each of its
    // default items lasts. iOS: PlayerConstants.fakeRemoteLoadMs and fakeRemoteItemSec.
    const val FAKE_REMOTE_LOAD_MS = 600L
    const val FAKE_REMOTE_ITEM_SEC = 120.0

    // The remote player's layout (RemoteLayout, RemoteMetrics), by size class and never by device model. A
    // window shorter than REMOTE_COMPACT_HEIGHT_DP is couched; otherwise one at least REMOTE_WIDE_MIN_WIDTH_DP
    // wide puts the artwork beside the controls. iOS: the same numbers in points, PlayerConstants.remote*.
    const val REMOTE_COMPACT_HEIGHT_DP = 480.0
    const val REMOTE_WIDE_MIN_WIDTH_DP = 600.0
    // The artwork takes what the rest leaves, between these two; it gives up its height before anything else.
    const val REMOTE_ARTWORK_MIN_DP = 96.0
    const val REMOTE_ARTWORK_MAX_DP = 420.0
    const val REMOTE_HORIZONTAL_PADDING_DP = 24.0
    // Couched, the artwork is at most this share of the width; wide, beside the column, this one.
    const val REMOTE_LANDSCAPE_ARTWORK_FRACTION = 0.4
    const val REMOTE_WIDE_ARTWORK_FRACTION = 0.45
    // What the rest of the screen takes, upright and couched: the part that keeps its size (buttons, the bar's
    // track, gaps) and the text, counted one line each at the font scale asked for. Upright, measured at the probe
    // on a 1080x2400 phone with every slot filled, at font scales 1 and 1.3
    // (RemoteLayoutTest.theUprightChromeMatchesTheMeasuredScreen); taller than iOS's 305 + 73 (Compose line heights).
    const val REMOTE_PORTRAIT_FIXED_DP = 326.0
    const val REMOTE_PORTRAIT_TEXT_DP = 83.0
    const val REMOTE_LANDSCAPE_FIXED_DP = 108.0
    const val REMOTE_LANDSCAPE_TEXT_DP = 34.0

    /** The remote transport (RemoteTransport): the chrome's three button sizes, and the gap between them,
     *  narrower upright so five buttons fit a phone's width. */
    const val REMOTE_BUTTON_SMALL_DP = 44.0
    const val REMOTE_BUTTON_MEDIUM_DP = 52.0
    const val REMOTE_BUTTON_PLAY_DP = 68.0
    const val REMOTE_TRANSPORT_GAP_PORTRAIT_DP = 20.0
    const val REMOTE_TRANSPORT_GAP_DP = 28.0

    /** What is active or connected on the remote screen (the TV's name, subtitles on, the current episode, the
     *  chosen track), ARGB: a light violet, 6:1 on the screen's darkest tones where the app's violet gives 2.2. */
    const val REMOTE_ACTIVE_COLOR = 0xFFC9A7FB

    /** The remote screen's background with no tint from JS, ARGB (constants/RemotePlayer.ts REMOTE_TINT_NEUTRAL),
     *  how long a new tint takes to fade in (REMOTE_TINT_FADE_MS), and the share of the height where the gradient
     *  reaches its bottom color, which then holds to the bottom edge. */
    const val REMOTE_TINT_NEUTRAL_TOP = 0xFF342E3D
    const val REMOTE_TINT_NEUTRAL_BOTTOM = 0xFF1F1927
    const val REMOTE_TINT_FADE_MS = 300
    const val REMOTE_TINT_GRADIENT_END = 0.66f
}

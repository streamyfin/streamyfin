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

    // The fake remote engine (tests, debug probe): how long its "TV" takes to load, how long each of its items
    // lasts, and the item id whose load it fails, as a receiver the account cannot play on. iOS:
    // PlayerConstants.fakeRemoteLoadMs, fakeRemoteItemSec and fakeRemoteFailId.
    const val FAKE_REMOTE_LOAD_MS = 600L
    const val FAKE_REMOTE_ITEM_SEC = 120.0
    const val FAKE_REMOTE_FAIL_ID = "fake-fail"

    // The remote player's layout (RemoteLayout, RemoteMetrics), by size class and never by device model. A
    // window shorter than REMOTE_COMPACT_HEIGHT_DP is couched; otherwise one at least REMOTE_WIDE_MIN_WIDTH_DP
    // wide, and wider than tall, puts the artwork beside the controls. iOS: the same numbers in points,
    // PlayerConstants.remote*.
    const val REMOTE_COMPACT_HEIGHT_DP = 480.0
    const val REMOTE_WIDE_MIN_WIDTH_DP = 600.0
    // The artwork takes what the rest leaves, between these two; it gives up its height before anything else.
    const val REMOTE_ARTWORK_MIN_DP = 96.0
    const val REMOTE_ARTWORK_MAX_DP = 420.0
    const val REMOTE_HORIZONTAL_PADDING_DP = 24.0
    // The remote screen draws the technical info panel within the artwork, this far from its edges.
    // iOS: PlayerConstants.remoteTechnicalInfoInset.
    const val REMOTE_TECHNICAL_INFO_INSET_DP = 8.0
    // The technical info panel's width, the local player's and, at most, the remote screen's card over its artwork.
    // iOS: PlayerConstants.remoteTechnicalInfoMaxWidth (its local panel has its own).
    const val TECHNICAL_INFO_WIDTH_DP = 320.0
    // On the remote card, the label's share of a line; the value takes the rest.
    // iOS: PlayerConstants.remoteTechnicalInfoLabelShare.
    const val REMOTE_TECHNICAL_INFO_LABEL_SHARE = 0.4
    // A remote control the TV's state leaves inactive (reconnecting, nothing loaded) is drawn at this opacity.
    // iOS: PlayerConstants.remoteInertOpacity.
    const val REMOTE_INERT_ALPHA = 0.4f
    // The segment skip's band across the bottom of the remote artwork, at least this tall.
    // iOS: PlayerConstants.remoteSkipBannerHeight.
    const val REMOTE_SKIP_BANNER_HEIGHT_DP = 44
    // The Play here pill under a failed send and the Continue one under the next episode, at least the small
    // button's height: white at this opacity over the tint. iOS: PlayerConstants.remotePlayHereFillOpacity.
    const val REMOTE_PLAY_HERE_FILL_ALPHA = 0.18f
    // The next episode's card at the end of the list the TV got: its 16:9 image is this wide.
    // iOS: PlayerConstants.remoteNextUpImageWidth.
    const val REMOTE_NEXT_UP_IMAGE_WIDTH_DP = 112.0
    // Wide, the artwork's share of the width, beside the column.
    const val REMOTE_WIDE_ARTWORK_FRACTION = 0.45
    // Couched, the image and the column are two equal halves between the side margins, this far apart; the image
    // keeps this inset above and below in the band under the top bar. iOS: PlayerConstants.remoteLandscapeGutter,
    // remoteLandscapeArtworkInset.
    const val REMOTE_LANDSCAPE_GUTTER_DP = 24.0
    const val REMOTE_LANDSCAPE_ARTWORK_INSET_DP = 16.0
    // The air the couched top bar's end buttons have in their boxes, on the margin's side: the chevron's 32 icon in
    // its 44 box with the drawing's own 8; the dots of "more"; a track button's 22 icon. The bar reaches past the
    // margins by as much, so the ink meets them. iOS: PlayerConstants.remoteChevronInkInset and the two others.
    const val REMOTE_CHEVRON_INK_INSET_DP = 14.0
    const val REMOTE_MORE_INK_INSET_DP = 20.0
    const val REMOTE_TRACK_BUTTON_INK_INSET_DP = 11.0
    // The share of the remote title's size its capitals stand above the baseline (Roboto's cap height): couched, the
    // title's capitals start level with the image's top. iOS reads its font's capHeight.
    const val REMOTE_TITLE_CAP_HEIGHT_EM = 0.711
    // What the rest of the screen takes upright: the part that keeps its size (buttons, the bar's track, gaps) and
    // the text, counted one line each at the font scale asked for. Measured at the probe on a 1080x2400 phone with
    // every slot filled, at font scales 1 and 1.3 (RemoteLayoutTest.theUprightChromeMatchesTheMeasuredScreen);
    // taller than iOS's 305 + 73 (Compose line heights).
    const val REMOTE_PORTRAIT_FIXED_DP = 326.0
    const val REMOTE_PORTRAIT_TEXT_DP = 83.0

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

    /** A drag down closes the remote screen like the chevron once it covers this share of the screen's height, or
     *  ends faster than this many dp per second (RemoteGestures). iOS: remoteDismissDrag*, the same numbers. */
    const val REMOTE_DISMISS_DRAG_FRACTION = 0.25
    const val REMOTE_DISMISS_VELOCITY_DP = 1200.0

    /** How long the TV's level stays on the remote screen after it changes, restarted by the next change
     *  (VolumeIndicatorModel). iOS: remoteVolumeIndicatorDuration, the same duration. */
    const val REMOTE_VOLUME_INDICATOR_MS = 1500L
}

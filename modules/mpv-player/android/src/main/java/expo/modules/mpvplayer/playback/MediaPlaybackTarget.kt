package expo.modules.mpvplayer.playback

/**
 * What a player exposes to [MediaPlaybackController]: its state for the
 * media session and notification, and the commands that come back from the
 * lock screen, the notification, headphones and audio focus.
 *
 * Both Android players implement it: the embedded JS-route MpvPlayerView and
 * the fully native player (through PlayerViewModel).
 */
interface MediaPlaybackTarget {
    val isPlaying: Boolean
    val isBuffering: Boolean
    val positionSeconds: Double
    val durationSeconds: Double
    val playbackSpeed: Double
    val nowPlaying: NowPlayingInfo?

    /**
     * A network stream also needs the Wi-Fi radio kept awake while the screen
     * is off; a downloaded file only needs the CPU.
     */
    val isNetworkSource: Boolean

    /**
     * How far fast forward and rewind go from the session and notification: the
     * user's skip settings where the player has them.
     */
    val seekForwardSeconds: Double get() = 30.0
    val seekBackSeconds: Double get() = 10.0

    /**
     * A live stream cannot be sought: no seek, fast forward, rewind or restart
     * is offered for it, so a headset cannot jump past the live edge or back
     * to the start of the stream.
     */
    val canSeek: Boolean get() = true

    val canSkipToNext: Boolean get() = false

    /** Previous restarts the item when solo, so it is offered by default. */
    val canSkipToPrevious: Boolean get() = true

    fun play()
    fun pause()

    /**
     * Pause for something the user did not press: headphones unplugged,
     * another app took audio focus. Defaults to [pause].
     */
    fun pauseForInterruption() = pause()

    /**
     * Pause because a play could not get the audio focus: a call holds it.
     * Defaults to [pauseForInterruption].
     */
    fun pauseForRefusedFocus() = pauseForInterruption()

    fun seekTo(seconds: Double)
    fun seekBy(seconds: Double)
    fun skipToNext() {}
    fun skipToPrevious() = seekTo(0.0)
    fun stop() {}

    /** Lower the volume for a transient duck; null restores it. */
    fun duck(percent: Int?) {}

    /** The user swiped the app away from recents. Defaults to [pause]. */
    fun onTaskRemoved() = pause()
}

data class NowPlayingInfo(
    val title: String,
    val subtitle: String? = null,
    val album: String? = null,
    val artworkUri: String? = null,
    val artworkHeaders: Map<String, String>? = null,
)

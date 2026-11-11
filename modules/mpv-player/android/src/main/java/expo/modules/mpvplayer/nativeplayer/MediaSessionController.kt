package expo.modules.mpvplayer.nativeplayer

import android.content.Context
import expo.modules.mpvplayer.playback.MediaPlaybackController
import expo.modules.mpvplayer.playback.MediaPlaybackTarget
import expo.modules.mpvplayer.playback.NowPlayingInfo

/**
 * The fully native player's media session: [MediaPlaybackController] (session,
 * audio focus, notification, foreground service) driven by the PlayerViewModel.
 */
class MediaSessionController(
    context: Context,
    private val viewModel: PlayerViewModel,
    /** Ends the player when the app is swiped away from recents. */
    private val onTaskRemoved: () -> Unit,
) {
    private val target = object : MediaPlaybackTarget {
        override val isPlaying get() = viewModel.isPlaying
        override val isBuffering get() = viewModel.isBuffering
        override val positionSeconds get() = viewModel.displayPosition
        override val durationSeconds get() = viewModel.duration
        override val playbackSpeed get() = viewModel.speed
        override val isNetworkSource get() = viewModel.sourceUrl.startsWith("http", ignoreCase = true)
        override val nowPlaying: NowPlayingInfo?
            get() = viewModel.metadata?.let {
                NowPlayingInfo(
                    title = it.title ?: "Video",
                    subtitle = it.subtitle,
                    artworkUri = it.artworkUri,
                )
            }
        // In a group Next goes to the group's next item, and only that.
        override val canSkipToNext get() =
            if (viewModel.syncPlayActive) viewModel.syncPlay?.hasNext == true
            else viewModel.nextEpisode != null
        override val canSkipToPrevious get() =
            !viewModel.syncPlayActive || viewModel.syncPlay?.hasPrevious == true

        override fun play() = viewModel.play()
        override fun pause() = viewModel.pause()

        /**
         * In a group pause() only asks the server, and the sound would keep
         * coming out of the speaker until the answer returns, or for good if
         * the request fails. Unplugged headphones and lost focus pause here
         * first.
         */
        override fun pauseForInterruption() {
            if (viewModel.syncPlayActive) viewModel.pauseLocal()
            viewModel.pause()
        }

        /**
         * In a group a refused focus is this member's own business: pausing the
         * group re-paused everyone on each resume for as long as the call
         * lasted. Only this player stops.
         */
        override fun pauseForRefusedFocus() {
            if (viewModel.syncPlayActive) viewModel.pauseLocal() else viewModel.pause()
        }

        override fun seekTo(seconds: Double) = viewModel.seekTo(seconds)
        override fun seekBy(seconds: Double) = viewModel.seekBy(seconds)
        override fun skipToNext() = viewModel.playNextEpisodeNow()
        override fun skipToPrevious() {
            if (viewModel.syncPlayActive) viewModel.playPreviousEpisode()
            else viewModel.seekTo(0.0)
        }

        // Solo playback keeps ignoring Stop, as before SyncPlay.
        override fun stop() {
            if (viewModel.syncPlayActive) viewModel.syncPlayAction("stop")
        }

        override fun duck(percent: Int?) {
            viewModel.engine?.setVolumeBoost(percent ?: viewModel.volumeBoostPercent)
        }

        // Swiped away, the app keeps running for the foreground service, and a
        // player left presented made every later play request fail.
        override fun onTaskRemoved() = this@MediaSessionController.onTaskRemoved()
    }

    private val controller = MediaPlaybackController(context, target, "StreamyfinNativePlayer")

    fun start() = controller.start()
    fun updatePlaybackState() = controller.updatePlaybackState()
    fun updateMetadata() = controller.updateMetadata()
    fun onPositionTick() = controller.onPositionTick()
    fun release() = controller.release()
}

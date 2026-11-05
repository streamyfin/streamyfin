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
    private val viewModel: PlayerViewModel
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
        override val canSkipToNext get() =
            viewModel.nextEpisode != null || viewModel.syncPlay?.hasNext == true

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
    }

    private val controller = MediaPlaybackController(context, target, "StreamyfinNativePlayer")

    fun start() = controller.start()
    fun updatePlaybackState() = controller.updatePlaybackState()
    fun updateMetadata() = controller.updateMetadata()
    fun onPositionTick() = controller.onPositionTick()
    fun release() = controller.release()
}

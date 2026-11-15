package expo.modules.mpvplayer.playback

import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

/**
 * Fast forward and rewind from a headset, a car or the notification went +30 and -10 s whatever
 * the user had set, while the on-screen buttons used the skip settings.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class SessionSkipTest {
    private class Target(override val canSeek: Boolean = true) : MediaPlaybackTarget {
        val seeks = mutableListOf<Double>()
        override val isPlaying = false
        override val isBuffering = false
        override val positionSeconds = 0.0
        override val durationSeconds = 0.0
        override val playbackSpeed = 1.0
        override val nowPlaying: NowPlayingInfo? = null
        override val isNetworkSource = false
        override val seekForwardSeconds = 15.0
        override val seekBackSeconds = 30.0
        override fun play() {}
        override fun pause() {}
        override fun seekTo(seconds: Double) {}
        override fun seekBy(seconds: Double) {
            seeks += seconds
        }
    }

    @Test
    fun theNotificationSkipsWhatTheUserSet() {
        val target = Target()
        val controller = MediaPlaybackController(RuntimeEnvironment.getApplication(), target, "Test")

        controller.handleAction(PlaybackService.ACTION_FORWARD)
        controller.handleAction(PlaybackService.ACTION_REWIND)

        assertEquals(listOf(15.0, -30.0), target.seeks)
    }

    // Live TV: a headset's fast forward went past the live edge, its Previous to the start.
    @Test
    fun aLiveStreamIsNotSought() {
        val target = Target(canSeek = false)
        val controller = MediaPlaybackController(RuntimeEnvironment.getApplication(), target, "Test")

        controller.handleAction(PlaybackService.ACTION_FORWARD)
        controller.handleAction(PlaybackService.ACTION_REWIND)

        assertEquals(emptyList<Double>(), target.seeks)
    }
}

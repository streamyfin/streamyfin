package expo.modules.mpvplayer.playback

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config

/**
 * The user swipes the app away from recents. The native player only paused: the foreground
 * service kept the process alive with the player still presented, so every later play request
 * was refused until the process died.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class PlaybackTaskRemovedTest {
    private class Target(private val endsItself: (() -> Unit)? = null) : MediaPlaybackTarget {
        var pauses = 0
        override val isPlaying = true
        override val isBuffering = false
        override val positionSeconds = 0.0
        override val durationSeconds = 0.0
        override val playbackSpeed = 1.0
        override val nowPlaying: NowPlayingInfo? = null
        override val isNetworkSource = false
        override fun play() {}
        override fun pause() {
            pauses++
        }
        override fun seekTo(seconds: Double) {}
        override fun seekBy(seconds: Double) {}
        override fun onTaskRemoved() {
            endsItself?.invoke() ?: super.onTaskRemoved()
        }
    }

    private val app = RuntimeEnvironment.getApplication()

    // Starts the other tests leave unanswered (Robolectric runs no onStartCommand) would keep the
    // service from stopping itself.
    @Before
    fun forgetEarlierStarts() = PlaybackService.resetForTests()

    @Test
    fun aPlayerThatSaysNothingElsePauses() {
        val target = Target()
        MediaPlaybackController(app, target, "Test").onTaskRemoved()

        assertEquals(1, target.pauses)
    }

    @Test
    fun theNativePlayerEndsItselfInstead() {
        var ended = 0
        val target = Target(endsItself = { ended++ })
        MediaPlaybackController(app, target, "Test").onTaskRemoved()

        assertEquals(1, ended)
        assertEquals(0, target.pauses)
    }

    @Test
    fun theServiceStopsItselfOnTaskRemoval() {
        val service = Robolectric.buildService(PlaybackService::class.java).create().get()

        service.onTaskRemoved(null)

        assertTrue(shadowOf(service).isStoppedBySelf)
    }
}

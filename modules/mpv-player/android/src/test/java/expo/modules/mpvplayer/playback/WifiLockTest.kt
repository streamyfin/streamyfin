package expo.modules.mpvplayer.playback

import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

/**
 * From Android 14 the platform turns a HIGH_PERF Wi-Fi lock into LOW_LATENCY, which holds only
 * with the screen on and the app in front: it reported held and did nothing with the screen off.
 */
@RunWith(RobolectricTestRunner::class)
class WifiLockTest {
    private class Target : MediaPlaybackTarget {
        override val isPlaying = false
        override val isBuffering = false
        override val positionSeconds = 0.0
        override val durationSeconds = 0.0
        override val playbackSpeed = 1.0
        override val nowPlaying: NowPlayingInfo? = null
        override val isNetworkSource = true
        override fun play() {}
        override fun pause() {}
        override fun seekTo(seconds: Double) {}
        override fun seekBy(seconds: Double) {}
    }

    private fun controller() =
        MediaPlaybackController(RuntimeEnvironment.getApplication(), Target(), "Test")

    @Test
    @Config(sdk = [33])
    fun takesAWifiLockBeforeAndroid14() {
        assertNotNull(controller().createWifiLock())
    }

    @Test
    @Config(sdk = [34])
    fun takesNoneFromAndroid14() {
        assertNull(controller().createWifiLock())
    }
}

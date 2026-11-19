package expo.modules.mpvplayer.playback

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import org.robolectric.shadows.ShadowLooper
import org.robolectric.shadows.ShadowPowerManager
import java.util.concurrent.TimeUnit

/**
 * A load that failed, or a stream that died, never leaves the playing state: mpv reports
 * neither. The wake lock was held until the player closed, all night with the phone locked.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class StalledPlaybackLocksTest {
    private class Target : MediaPlaybackTarget {
        var position = 10.0
        var playing = true
        override val isPlaying get() = playing
        override val isBuffering = false
        override val positionSeconds get() = position
        override val durationSeconds = 3600.0
        override val playbackSpeed = 1.0
        override val nowPlaying: NowPlayingInfo? = null
        override val isNetworkSource = false
        override fun play() {}
        override fun pause() {}
        override fun seekTo(seconds: Double) {}
        override fun seekBy(seconds: Double) {}
    }

    private val target = Target()
    private val controller =
        MediaPlaybackController(RuntimeEnvironment.getApplication(), target, "Test").apply {
            start()
            updatePlaybackState()
        }

    @Test
    fun theWakeLockGoesWhenPlaybackStopsAdvancing() {
        val wakeLock = ShadowPowerManager.getLatestWakeLock()
        assertTrue(wakeLock.isHeld)

        ShadowLooper.idleMainLooper(11, TimeUnit.MINUTES)

        assertFalse(wakeLock.isHeld)
        controller.release()
    }

    // The session republishes a position that drifts from its extrapolation,
    // and a frozen one drifts a second per second: that republish must not
    // take the locks back once the watchdog let them go.
    @Test
    fun aFrozenPositionDoesNotTakeTheLockBack() {
        val wakeLock = ShadowPowerManager.getLatestWakeLock()

        repeat(15) {
            ShadowLooper.idleMainLooper(1, TimeUnit.MINUTES)
            controller.onPositionTick()
        }

        assertFalse(wakeLock.isHeld)
        controller.release()
    }

    @Test
    fun progressAfterAStallTakesTheLockBack() {
        val wakeLock = ShadowPowerManager.getLatestWakeLock()
        ShadowLooper.idleMainLooper(11, TimeUnit.MINUTES)
        assertFalse(wakeLock.isHeld)

        target.position += 5
        controller.onPositionTick()

        assertTrue(wakeLock.isHeld)
        controller.release()
    }

    // Recovered, the stream plays like any other: a pause and a play take
    // the lock at once, without waiting for the next tick.
    @Test
    fun aPlayAfterRecoveryTakesTheLockAtOnce() {
        val wakeLock = ShadowPowerManager.getLatestWakeLock()
        ShadowLooper.idleMainLooper(11, TimeUnit.MINUTES)
        target.position += 5
        controller.onPositionTick()

        target.playing = false
        controller.updatePlaybackState()
        assertFalse(wakeLock.isHeld)
        target.playing = true
        controller.updatePlaybackState()

        assertTrue(wakeLock.isHeld)
        controller.release()
    }

    @Test
    fun advancingPlaybackKeepsIt() {
        val wakeLock = ShadowPowerManager.getLatestWakeLock()

        repeat(15) {
            ShadowLooper.idleMainLooper(1, TimeUnit.MINUTES)
            target.position += 60
            controller.onPositionTick()
        }

        assertTrue(wakeLock.isHeld)
        controller.release()
    }
}

package expo.modules.mpvplayer.playback

import android.content.Context
import android.media.AudioManager
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config

/**
 * A play that cannot get the audio focus, a call holding it. In a SyncPlay group the native
 * player paused the whole group through its interruption pause, again on every resume for as
 * long as the call lasted. A refused focus now goes through its own hook.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class RefusedFocusTest {
    private class Target : MediaPlaybackTarget {
        var interruptionPauses = 0
        var refusedPauses = 0
        override val isPlaying = true
        override val isBuffering = false
        override val positionSeconds = 0.0
        override val durationSeconds = 0.0
        override val playbackSpeed = 1.0
        override val nowPlaying: NowPlayingInfo? = null
        override val isNetworkSource = false
        override fun play() {}
        override fun pause() {}
        override fun pauseForInterruption() {
            interruptionPauses++
        }
        override fun pauseForRefusedFocus() {
            refusedPauses++
        }
        override fun seekTo(seconds: Double) {}
        override fun seekBy(seconds: Double) {}
    }

    @Test
    fun aRefusedFocusPausesThroughItsOwnHook() {
        val app = RuntimeEnvironment.getApplication()
        val audio = app.getSystemService(Context.AUDIO_SERVICE) as AudioManager
        shadowOf(audio).setNextFocusRequestResponse(AudioManager.AUDIOFOCUS_REQUEST_FAILED)
        val target = Target()
        val controller = MediaPlaybackController(app, target, "Test")

        controller.start()
        controller.updatePlaybackState()

        assertTrue(target.refusedPauses >= 1)
        assertEquals(0, target.interruptionPauses)
        controller.release()
    }
}

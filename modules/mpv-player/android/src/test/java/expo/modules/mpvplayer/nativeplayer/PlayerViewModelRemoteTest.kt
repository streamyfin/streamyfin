package expo.modules.mpvplayer.nativeplayer

import expo.modules.mpvplayer.nativeplayer.engine.RemoteOnlyEngine
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.shadows.ShadowLooper
import java.util.concurrent.TimeUnit

// A chrome over a remote engine is a remote control: its controls stay up, a drag on the bar leaves the
// TV playing and seeks once on release, and the TV's own list decides what plays next, never a countdown.
@RunWith(RobolectricTestRunner::class)
class PlayerViewModelRemoteTest {
    private fun remoteViewModel(engine: RemoteOnlyEngine): PlayerViewModel =
        PlayerViewModel().also {
            it.engine = engine
            it.applyCapabilities(pictureInPictureSupported = false, allowCast = false)
        }

    @Test
    fun remoteControlsNeverHide() {
        val viewModel = remoteViewModel(RemoteOnlyEngine())
        // Loaded and playing: what lets a local chrome hide its controls.
        viewModel.onLoadingChanged(isLoading = false)
        viewModel.onPauseChanged(isPaused = false)

        viewModel.scheduleAutoHide()
        ShadowLooper.idleMainLooper(PlayerConstants.AUTO_HIDE_DELAY_MS * 3, TimeUnit.MILLISECONDS)

        assertTrue(viewModel.isPlaying)
        assertTrue(viewModel.controlsVisible)
    }

    @Test
    fun aRemoteScrubNeverPausesAndSeeksOnceOnRelease() {
        val engine = RemoteOnlyEngine()
        val viewModel = remoteViewModel(engine)
        viewModel.onPauseChanged(isPaused = false)

        viewModel.startScrubbing()
        viewModel.updateScrub(30.0)
        viewModel.updateScrub(40.0)
        viewModel.finishScrubbing(40.0)
        viewModel.beginScrub()
        viewModel.nudgeScrub(5.0)
        viewModel.commitScrub()

        assertEquals(0, engine.pauses)
        assertEquals(0, engine.played)
        assertEquals(listOf("seekTo 40.0", "seekTo 45.0"), engine.seeks)
    }

    @Test
    fun aRemoteEndNeverStartsACountdown() {
        val viewModel = remoteViewModel(RemoteOnlyEngine())
        val emitted = mutableListOf<String>()
        viewModel.emit = { name, _ -> emitted += name }
        viewModel.updateNextEpisode(NextEpisodeRecord().apply {
            itemId = "next"
            title = "Next"
            countdownSeconds = 10.0
        })
        viewModel.updateSegments(listOf(MediaSegmentRecord().apply {
            type = "Outro"
            startSec = 80.0
            endSec = 100.0
        }))
        viewModel.onPauseChanged(isPaused = false)

        viewModel.onPositionChanged(95.0, 100.0, 0.0)
        ShadowLooper.idleMainLooper(2, TimeUnit.SECONDS)
        viewModel.onPlaybackEnded()

        assertNull(viewModel.countdownRemaining)
        assertTrue("no next-episode request: $emitted", "onNextEpisodeRequested" !in emitted)
    }

    // The remote screen draws no "still watching" card: asking there would leave it paused with nothing to
    // answer. The TV's list ended, so the screen ends as it does with no next episode.
    @Test
    fun aRemoteEndAtTheEpisodeCapEndsInsteadOfAsking() {
        val viewModel = remoteViewModel(RemoteOnlyEngine())
        val emitted = mutableListOf<String>()
        val dismissals = mutableListOf<String>()
        viewModel.emit = { name, _ -> emitted += name }
        viewModel.onDismissRequested = { reason -> dismissals += reason }
        viewModel.updateNextEpisode(NextEpisodeRecord().apply {
            itemId = "next"
            title = "Next"
            stillWatchingRequired = true
        })
        viewModel.onPauseChanged(isPaused = false)

        viewModel.onPlaybackEnded()

        assertFalse(viewModel.showStillWatching)
        assertTrue("no end reported: $emitted", "onPlaybackEnded" in emitted)
        assertEquals(listOf("playbackEnded"), dismissals)
    }
}

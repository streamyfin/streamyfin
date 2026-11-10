package expo.modules.mpvplayer.nativeplayer.engine

import androidx.media3.exoplayer.ExoPlayer
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotSame
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

/**
 * The engine's own reloads (stall watchdog, resume recovery) rebuild the ExoPlayer, whose fresh
 * instance starts paused at 1x. Observed on the Android TV emulator before this was fixed: the
 * rebuilt player ran at 1.0 under a chrome still showing 1.5x, and the server received a pause
 * and a resume for each reload.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ExoPlayerEngineReloadTest {
    private val pauses = mutableListOf<Boolean>()
    private val engine = ExoPlayerEngine(RuntimeEnvironment.getApplication()).apply {
        delegate = object : PlayerEngine.Delegate {
            override fun onPositionChanged(position: Double, duration: Double, cacheSeconds: Double) {}
            override fun onPauseChanged(isPaused: Boolean) {
                pauses += isPaused
            }
            override fun onLoadingChanged(isLoading: Boolean) {}
            override fun onReadyToSeek() {}
            override fun onTracksReady() {}
            override fun onError(message: String) {}
            override fun onVideoDimensionsChanged(width: Int, height: Int) {}
        }
    }

    // Nothing listens on the discard port: the load never gets media, which these tests do not need.
    private val config = VideoLoadConfig(url = "http://127.0.0.1:9/Videos/item/stream.mkv")

    /** The engine's ExoPlayer, private outside tests. */
    private fun player(): ExoPlayer =
        ExoPlayerEngine::class.java.getDeclaredField("player")
            .apply { isAccessible = true }
            .get(engine) as ExoPlayer

    @After
    fun releasePlayer() {
        player().release()
    }

    @Test
    fun aReloadRebuildsThePlayerAtTheSpeedItHad() {
        engine.load(config)
        engine.setSpeed(1.5)
        val before = player()

        engine.reloadCurrentItem()

        assertNotSame(before, player())
        assertEquals(1.5f, player().playbackParameters.speed)
    }

    @Test
    fun aReloadReportsNoPause() {
        engine.load(config)
        pauses.clear()

        engine.reloadCurrentItem()

        assertEquals(emptyList<Boolean>(), pauses)
    }

    // A new item still starts paused for the chrome until the session plays it: the outgoing
    // player's "playing" must not survive onto it.
    @Test
    fun aNewLoadStillReportsTheFreshPausedState() {
        engine.load(config)

        assertEquals(listOf(true), pauses)
    }
}

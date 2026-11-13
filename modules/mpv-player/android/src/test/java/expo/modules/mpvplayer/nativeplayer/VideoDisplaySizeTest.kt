package expo.modules.mpvplayer.nativeplayer

import android.os.Looper
import androidx.media3.common.Player
import androidx.media3.common.VideoSize
import androidx.media3.exoplayer.ExoPlayer
import expo.modules.mpvplayer.MPVLayerRenderer
import expo.modules.mpvplayer.nativeplayer.engine.ExoPlayerEngine
import expo.modules.mpvplayer.nativeplayer.engine.PlayerEngine
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config

/**
 * The size an engine reports is the one on screen. An anamorphic video stores fewer pixels across
 * than it shows (1440x1080 with 4:3 pixels is a 16:9 picture): reported as stored, the picture in
 * picture window took a 4:3 shape around a 16:9 picture.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class VideoDisplaySizeTest {
    private val sizes = mutableListOf<Pair<Int, Int>>()
    private val delegate = object : PlayerEngine.Delegate {
        override fun onPositionChanged(position: Double, duration: Double, cacheSeconds: Double) {}
        override fun onPauseChanged(isPaused: Boolean) {}
        override fun onLoadingChanged(isLoading: Boolean) {}
        override fun onReadyToSeek() {}
        override fun onTracksReady() {}
        override fun onError(message: String) {}
        override fun onVideoDimensionsChanged(width: Int, height: Int) {
            sizes += width to height
        }
    }

    private var exoEngine: ExoPlayerEngine? = null

    // The engine builds its ExoPlayer on a load, which these tests do not need.
    @After
    fun releasePlayer() {
        exoEngine?.let { exoPlayer(it)?.release() }
    }

    private fun exoPlayer(engine: ExoPlayerEngine): ExoPlayer? =
        ExoPlayerEngine::class.java.getDeclaredField("player")
            .apply { isAccessible = true }
            .get(engine) as ExoPlayer?

    /** What ExoPlayer calls when the decoder reports a size, private outside tests. */
    private fun exoListener(engine: ExoPlayerEngine): Player.Listener =
        ExoPlayerEngine::class.java.getDeclaredField("playerListener")
            .apply { isAccessible = true }
            .get(engine) as Player.Listener

    private fun exoReports(size: VideoSize): Pair<Int, Int>? {
        val engine = ExoPlayerEngine(RuntimeEnvironment.getApplication()).also {
            it.delegate = delegate
            exoEngine = it
        }
        exoListener(engine).onVideoSizeChanged(size)
        shadowOf(Looper.getMainLooper()).idle()
        return sizes.lastOrNull()
    }

    // mpv gives both: the stored size (w, h) and the shown one (dw, dh).
    @Test
    fun mpvReportsTheSizeOnScreen() {
        val renderer = MPVLayerRenderer(RuntimeEnvironment.getApplication()).also { it.delegate = delegate }

        renderer.eventProperty("video-params/w", 1440L)
        renderer.eventProperty("video-params/h", 1080L)
        renderer.eventProperty("video-params/dw", 1920L)
        renderer.eventProperty("video-params/dh", 1080L)
        shadowOf(Looper.getMainLooper()).idle()

        assertEquals(1920 to 1080, sizes.lastOrNull())
    }

    @Test
    fun exoPlayerReportsTheSizeOnScreen() {
        assertEquals(1920 to 1080, exoReports(VideoSize(1440, 1080, 4f / 3f)))
    }

    @Test
    fun squarePixelsAreReportedAsTheyAre() {
        assertEquals(1920 to 800, exoReports(VideoSize(1920, 800, 1f)))
    }
}

package expo.modules.mpvplayer.nativeplayer

import expo.modules.mpvplayer.nativeplayer.engine.RecordingLocalEngine
import expo.modules.mpvplayer.nativeplayer.engine.RemoteOnlyEngine
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

// The view model reaches rendering through the engine it holds: a local engine still zooms and
// styles subtitles, an engine without a screen takes the same calls and nothing happens.
@RunWith(RobolectricTestRunner::class)
class PlayerViewModelRenderingTest {
    @Test
    fun aLocalEngineStillZoomsAndStylesSubtitles() {
        val engine = RecordingLocalEngine()
        val viewModel = PlayerViewModel().also { it.engine = engine }
        viewModel.toggleZoomToFill()
        viewModel.setSubtitleScale(1.5)
        viewModel.setSubtitleDelay(0.5)
        assertTrue("setZoomedToFill true" in engine.rendered)
        // No video size yet: the scale reaches the engine as asked.
        assertTrue("setSubtitleScale 1.5" in engine.rendered)
        assertTrue("setSubtitleDelay 0.5" in engine.rendered)
        assertEquals(mapOf("videoCodec" to "h264"), viewModel.technicalInfo())
    }

    @Test
    fun anEngineWithoutRenderingIgnoresRenderingCalls() {
        val viewModel = PlayerViewModel().also { it.engine = RemoteOnlyEngine() }
        viewModel.toggleZoomToFill()
        viewModel.setSubtitleScale(1.5)
        viewModel.setSubtitleDelay(0.5)
        assertEquals(emptyMap<String, Any>(), viewModel.technicalInfo())
    }
}

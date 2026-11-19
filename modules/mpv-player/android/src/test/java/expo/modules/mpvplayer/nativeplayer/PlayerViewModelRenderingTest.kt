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

    // A remote panel's lines are JS's: it asks for them as it opens and says when it closes; a local one asks nothing.
    @Test
    fun aRemotePanelAsksJsForItsLinesWhileItIsOpen() {
        val events = mutableListOf<String>()
        val remote = PlayerViewModel().also {
            it.engine = RemoteOnlyEngine()
            it.applyCapabilities(pictureInPictureSupported = false)
            it.emit = { name, _ -> events += name }
        }
        remote.technicalInfoShown(true)
        remote.technicalLines = listOf("Play method" to "Transcoding")
        remote.technicalInfoShown(false)
        assertEquals(listOf("onTechnicalInfoRequested", "onTechnicalInfoClosed"), events)
        // Reopened, it never shows the lines of before.
        assertEquals(emptyList<Pair<String, String>>(), remote.technicalLines)

        val local = PlayerViewModel().also {
            it.engine = RecordingLocalEngine()
            it.applyCapabilities(pictureInPictureSupported = false)
            it.emit = { name, _ -> events += name }
        }
        local.technicalInfoShown(true)
        assertEquals(2, events.size)
    }

    // Lines JS sent before it heard of the close land on a closed panel: the next opening starts empty.
    @Test
    fun aRemotePanelReopensWithoutTheLinesOfALateReply() {
        val remote = PlayerViewModel().also {
            it.engine = RemoteOnlyEngine()
            it.applyCapabilities(pictureInPictureSupported = false)
            it.emit = { _, _ -> }
        }
        remote.technicalInfoShown(true)
        remote.technicalInfoShown(false)
        remote.technicalLines = listOf("Play method" to "Transcoding")
        remote.technicalInfoShown(true)
        assertEquals(emptyList<Pair<String, String>>(), remote.technicalLines)
    }
}

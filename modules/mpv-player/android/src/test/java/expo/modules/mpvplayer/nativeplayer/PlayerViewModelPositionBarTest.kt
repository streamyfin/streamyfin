package expo.modules.mpvplayer.nativeplayer

import expo.modules.mpvplayer.nativeplayer.engine.RemoteOnlyEngine
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

// TalkBack adjusts the position bar by asking for a new value; the bar answers with one skip step that way,
// as VoiceOver's adjustable action does on iOS, whatever size of jump the screen reader asked for.
@RunWith(RobolectricTestRunner::class)
class PlayerViewModelPositionBarTest {
    private fun viewModelAt(positionSec: Double, engine: RemoteOnlyEngine): PlayerViewModel =
        PlayerViewModel().also {
            it.engine = engine
            it.applyCapabilities(pictureInPictureSupported = false, allowCast = false)
            it.onPositionChanged(positionSec, duration = 600.0, cacheSeconds = 0.0)
        }

    @Test
    fun aScreenReaderAdjustmentSeeksOneSkipStepThatWay() {
        val engine = RemoteOnlyEngine()
        val viewModel = viewModelAt(100.0, engine)

        assertTrue(viewModel.adjustPosition(toward = 130f))
        viewModel.onPositionChanged(100.0, duration = 600.0, cacheSeconds = 0.0)
        assertTrue(viewModel.adjustPosition(toward = 40f))

        assertEquals(
            listOf(
                "seekTo ${100.0 + viewModel.uiOptions.seekForwardSec}",
                "seekTo ${100.0 - viewModel.uiOptions.seekBackwardSec}",
            ),
            engine.seeks,
        )
    }

    @Test
    fun anAdjustmentToWhereItIsSeeksNothing() {
        val engine = RemoteOnlyEngine()
        val viewModel = viewModelAt(100.0, engine)

        assertFalse(viewModel.adjustPosition(toward = 100f))
        assertEquals(emptyList<String>(), engine.seeks)
    }
}

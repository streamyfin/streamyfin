package expo.modules.mpvplayer.nativeplayer

import expo.modules.mpvplayer.nativeplayer.engine.RecordingLocalEngine
import expo.modules.mpvplayer.nativeplayer.engine.RemoteOnlyEngine
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

// The view model offers what the engine it holds can do: a local engine keeps zoom, speed and
// picture in picture; a remote one gets no zoom, and speed only when it says it changes speed.
@RunWith(RobolectricTestRunner::class)
class PlayerViewModelCapabilitiesTest {
    @Test
    fun aLocalEngineKeepsZoomSpeedAndPictureInPicture() {
        val engine = RecordingLocalEngine()
        val viewModel = PlayerViewModel().also { it.engine = engine }
        viewModel.applyCapabilities(pictureInPictureSupported = true)
        assertTrue(viewModel.capabilities.pictureInPicture)
        viewModel.toggleZoomToFill()
        viewModel.setSpeed(1.5)
        assertTrue(viewModel.isZoomedToFill)
        assertEquals(listOf("setSpeed 1.5"), engine.speeds)
    }

    @Test
    fun aRemoteEngineThatCannotChangeSpeedGetsNoSpeedNorZoom() {
        val engine = RemoteOnlyEngine().apply { speedAllowed = false }
        val viewModel = PlayerViewModel().also { it.engine = engine }
        viewModel.applyCapabilities(pictureInPictureSupported = true)
        assertFalse(viewModel.capabilities.pictureInPicture)
        viewModel.toggleZoomToFill()
        // As JS or a WebSocket command would ask.
        viewModel.setSpeed(1.5)
        viewModel.startHoldSpeed()
        assertFalse(viewModel.isZoomedToFill)
        assertFalse(viewModel.isHoldSpeedActive)
        assertEquals(emptyList<String>(), engine.speeds)
    }

    @Test
    fun aRemoteEngineThatChangesSpeedStillGetsIt() {
        val engine = RemoteOnlyEngine()
        val viewModel = PlayerViewModel().also { it.engine = engine }
        viewModel.applyCapabilities(pictureInPictureSupported = false)
        viewModel.setSpeed(1.5)
        assertEquals(listOf("setSpeed 1.5"), engine.speeds)
    }

    // The new guard comes first: a local engine still reaches SyncPlay's, which forces the group speed.
    @Test
    fun syncPlayStillForcesTheGroupSpeedOnALocalEngine() {
        val engine = RecordingLocalEngine()
        val viewModel = PlayerViewModel().also { it.engine = engine }
        viewModel.applyCapabilities(pictureInPictureSupported = true)
        viewModel.updateSyncPlay(SyncPlayStateRecord().apply { groupId = "group" })
        viewModel.setSpeed(1.5)
        assertEquals(listOf("setSpeed 1.0", "setSpeed 1.0"), engine.speeds)
    }
}

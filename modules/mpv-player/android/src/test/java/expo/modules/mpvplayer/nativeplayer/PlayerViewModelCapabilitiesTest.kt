package expo.modules.mpvplayer.nativeplayer

import expo.modules.mpvplayer.cast.target.FakeTargetPort
import expo.modules.mpvplayer.cast.target.RemoteTargetHub
import expo.modules.mpvplayer.cast.target.TargetDevice
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

    // The Cast button comes with the config JS sent, on a local engine only.
    @Test
    fun theCastButtonFollowsTheConfig() {
        val viewModel = PlayerViewModel().also { it.engine = RecordingLocalEngine() }
        viewModel.applyCapabilities(pictureInPictureSupported = true, allowCast = true)
        val local = viewModel.capabilities.cast
        viewModel.engine = RemoteOnlyEngine()
        viewModel.applyCapabilities(pictureInPictureSupported = true, allowCast = true)

        assertTrue(local)
        assertFalse(viewModel.capabilities.cast)
    }

    // A stream loaded in place carries its own config: a downloaded file swapped for a stream brings the button, and
    // the other way round takes it away.
    @Test
    fun aLoadedStreamBringsTheCastButtonItAllows() {
        val viewModel = PlayerViewModel().also { it.engine = RecordingLocalEngine() }
        viewModel.applyCapabilities(pictureInPictureSupported = true, allowCast = false)

        viewModel.apply(PlayerPresentConfigRecord().also { it.ui.allowCast = true })
        val online = viewModel.capabilities.cast
        viewModel.apply(PlayerPresentConfigRecord().also { it.ui.allowCast = false })

        assertTrue(online)
        assertFalse(viewModel.capabilities.cast)
        assertTrue(viewModel.capabilities.pictureInPicture)
    }

    // The sheet keeps the hand-off until it closes: a player already torn down sends nothing.
    @Test
    fun aHandOffAfterTheTeardownSendsNothing() {
        val engine = RecordingLocalEngine()
        val viewModel = PlayerViewModel().also { it.engine = engine }
        val events = mutableListOf<String>()
        viewModel.emit = { name, _ -> events += name }
        viewModel.willTeardown()

        viewModel.requestCastHandOff()

        assertEquals(0, engine.pauses)
        assertEquals(emptyList<String>(), events.filter { it == "onCastHandOffRequested" })
    }

    // The hand-off names the item the player played, which an in-place swap may already have replaced in JS.
    @Test
    fun aHandOffNamesTheItemThePlayerPlayed() {
        val viewModel = PlayerViewModel().also { it.engine = RecordingLocalEngine() }
        val events = mutableListOf<Map<String, Any?>>()
        viewModel.emit = { name, payload -> if (name == "onCastHandOffRequested") events += payload }
        viewModel.apply(PlayerPresentConfigRecord().also { it.metadata = MetadataRecord().apply { itemId = "item-1" } })

        viewModel.requestCastHandOff()

        assertEquals("item-1", events.single()["itemId"])
    }

    // The hand-off pauses here and asks JS to send the item at the position the player is at.
    @Test
    fun aHandOffPausesAndAsksAtThePosition() {
        val engine = RecordingLocalEngine()
        val viewModel = PlayerViewModel().also { it.engine = engine }
        val events = mutableListOf<Pair<String, Map<String, Any?>>>()
        viewModel.emit = { name, payload -> events += name to payload }
        // The engine's last tick, the position the dismiss that follows reports.
        viewModel.onPositionChanged(position = 61.5, duration = 600.0, cacheSeconds = 0.0)

        viewModel.requestCastHandOff()

        assertEquals(1, engine.pauses)
        assertEquals(
            listOf("onCastHandOffRequested" to mapOf<String, Any?>("positionSec" to 61.5, "itemId" to null)),
            events.filter { it.first == "onCastHandOffRequested" },
        )
    }

    // A group joined while the sheet was open plays the player: the hand-off JS refuses leaves its playback alone.
    @Test
    fun aHandOffInASyncPlayGroupDoesNotPause() {
        val engine = RecordingLocalEngine()
        val viewModel = PlayerViewModel().also { it.engine = engine }
        viewModel.emit = { _, _ -> }
        viewModel.updateSyncPlay(SyncPlayStateRecord().apply { groupId = "group" })

        viewModel.requestCastHandOff()

        assertEquals(0, engine.pauses)
    }

    // The Cast button reads as the header's does: its name, then whether a receiver is connected.
    @Test
    fun theCastButtonSaysItsState() {
        val livingRoom = TargetDevice("device-a", "Living room")
        val port = FakeTargetPort(known = listOf(livingRoom))
        val hub = RemoteTargetHub().also { it.install(port) }
        val viewModel = PlayerViewModel()
        viewModel.followCast(hub)

        val idle = viewModel.castButtonState
        hub.connect(livingRoom.id)
        val connecting = viewModel.castButtonState
        port.emit("started", livingRoom)

        assertEquals("Cast button", viewModel.castButtonLabel)
        assertEquals(listOf("Not connected", "Connecting", "Connected"), listOf(idle, connecting, viewModel.castButtonState))
    }
}

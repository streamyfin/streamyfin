package expo.modules.mpvplayer.cast.engine

import expo.modules.mpvplayer.cast.FakeChannelPort
import expo.modules.mpvplayer.cast.ReceiverChannelHub
import expo.modules.mpvplayer.nativeplayer.engine.PlayerEngine
import java.io.File
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

// The shared vectors replayed through the engine itself, as JS and the receiver readers replay them.
@RunWith(RobolectricTestRunner::class)
class CastEngineVectorsTest {
    private val dir = File(System.getProperty("receiverProtocolVectors") ?: error("receiverProtocolVectors is not set"))

    private fun cases(name: String) = JSONObject(File(dir, name).readText()).getJSONArray("cases").let { list ->
        (0 until list.length()).map { list.getJSONObject(it) }
    }

    @Test
    fun mediaPositionThroughTheEngine() {
        for (case in cases("media-position.json")) {
            val input = case.getJSONObject("input")
            val media = FakeMedia()
            val hub = ReceiverChannelHub().apply { attach(FakeChannelPort()) }
            val engine = CastEngine(SERVER, FakeSource(FakeSession(media = media)), hub, ManualScheduler().schedule, { it() })
            engine.start(PlayerEngine.Owner.NATIVE_SESSION) {}
            val customData = input.optJSONObject("customData")
            media.report(snapshot(customData = customData), (input.getDouble("currentTime") * 1000).toLong())
            assertEquals(case.getString("name"), case.getDouble("expected"), engine.currentPosition, 1e-9)
        }
    }
}

package expo.modules.mpvplayer.nativeplayer

import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

// presentPlayer refuses before it builds a session, in this order: a player already up, a stream
// it cannot read, then an engine the chrome does not build, which must never start mpv in its place.
class PresentRefusalTest {
    private fun config(url: String = "https://media.example/video.mkv", engine: String? = "mpv") =
        PlayerPresentConfigRecord().also {
            it.stream = StreamConfigRecord().also { stream -> stream.url = url }
            it.engine = engine
        }

    @Test
    fun anEngineTheChromeDoesNotBuildIsRefused() {
        assertTrue(presentRefusal(presented = false, config(engine = "cast")) is UnsupportedEngineException)
    }

    @Test
    fun aBuiltEngineIsPresented() {
        assertNull(presentRefusal(presented = false, config(engine = "mpv")))
        assertNull(presentRefusal(presented = false, config(engine = "exoplayer")))
        assertNull(presentRefusal(presented = false, config(engine = null)))
    }

    @Test
    fun aPresentedPlayerIsRefusedFirst() {
        assertTrue(presentRefusal(presented = true, config(url = "", engine = "cast")) is PlayerAlreadyPresentedException)
    }

    @Test
    fun anUnreadableStreamIsRefusedBeforeTheEngine() {
        assertTrue(presentRefusal(presented = false, config(url = "", engine = "cast")) is InvalidStreamUrlException)
    }
}

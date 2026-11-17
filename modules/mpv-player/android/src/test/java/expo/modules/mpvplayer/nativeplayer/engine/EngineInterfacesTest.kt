package expo.modules.mpvplayer.nativeplayer.engine

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

// A remote engine carries transport and queue, never a surface: its double (EngineDoubles.kt)
// compiles against the two interfaces only, which is the whole point of the split.
class EngineInterfacesTest {
    @Test
    fun aRemoteEngineNeedsNoRenderingMembers() {
        val engine = RemoteOnlyEngine()
        engine.play()
        assertEquals(1, engine.played)
    }

    // The chrome holds a ChromeEngine: a local engine is one already, with no adapter.
    @Test
    fun aLocalEngineIsAChromeEngine() {
        // The check is the compilation: the widening builds only while PlayerEngine extends ChromeEngine.
        val widen: (PlayerEngine) -> ChromeEngine = { it }
        assertNotNull(widen)
    }

    @Test
    fun anEngineChangesSpeedUnlessItSaysOtherwise() {
        assertTrue(RemoteOnlyEngine().canChangeSpeed)
    }

    // Remote is what the type says: an engine without the rendering face has no screen here.
    @Test
    fun anEngineWithoutRenderingIsRemote() {
        assertTrue(RemoteOnlyEngine().isRemote)
        assertFalse(RecordingLocalEngine().isRemote)
    }

    @Test
    fun theQueueHasNothingByDefault() {
        val engine = RemoteOnlyEngine()
        assertNull(engine.currentItemId)
        assertNull(engine.targetVolume)
        engine.skipToNext()
        engine.enqueue(listOf("a"))
        assertNull(engine.currentItemId)
    }

    @Test
    fun seekToTrackedKeepsItsDefault() {
        val engine = RemoteOnlyEngine()
        engine.seekToTracked(12.0, exact = true, requestId = 7)
        engine.seekToTracked(3.0, exact = false, requestId = 8)
        assertEquals(listOf("seekToExact 12.0", "seekTo 12.0", "seekTo 3.0"), engine.seeks)
    }
}

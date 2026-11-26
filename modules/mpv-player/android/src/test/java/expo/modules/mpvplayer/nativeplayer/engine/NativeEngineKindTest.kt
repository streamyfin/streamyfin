package expo.modules.mpvplayer.nativeplayer.engine

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

// Which engine a config names: the chrome builds only the ones it knows, and an
// unknown name is refused instead of starting mpv in its place.
class NativeEngineKindTest {
    @Test
    fun noEngineIsMpvAsOlderConfigsSendNone() {
        assertEquals(NativeEngineKind.MPV, NativeEngineKind.of(null))
        assertEquals(NativeEngineKind.MPV, NativeEngineKind.of(""))
        assertEquals(NativeEngineKind.MPV, NativeEngineKind.of("  "))
    }

    @Test
    fun aKnownEngineIsReadWhateverItsCase() {
        assertEquals(NativeEngineKind.MPV, NativeEngineKind.of("MPV"))
        assertEquals(NativeEngineKind.EXOPLAYER, NativeEngineKind.of("ExoPlayer"))
    }

    // The trap of the factory before: an engine it did not know became mpv.
    @Test
    fun anUnknownEngineIsNoneOfThem() {
        assertNull(NativeEngineKind.of("cast"))
        assertNull(NativeEngineKind.of("vlc"))
    }
}

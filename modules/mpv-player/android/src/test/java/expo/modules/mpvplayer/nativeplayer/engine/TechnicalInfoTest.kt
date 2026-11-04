package expo.modules.mpvplayer.nativeplayer.engine

import org.junit.Assert.assertEquals
import org.junit.Test

// The technical info overlay and JS read the info through the chrome engine: a remote one has none.
class TechnicalInfoTest {
    @Test
    fun aRemoteEngineHasNoTechnicalInfo() {
        assertEquals(emptyMap<String, Any>(), technicalInfoOf(RemoteOnlyEngine()))
        assertEquals(emptyMap<String, Any>(), technicalInfoOf(null))
    }

    @Test
    fun aLocalEngineGivesItsOwn() {
        assertEquals(mapOf("videoCodec" to "h264"), technicalInfoOf(RecordingLocalEngine()))
    }
}

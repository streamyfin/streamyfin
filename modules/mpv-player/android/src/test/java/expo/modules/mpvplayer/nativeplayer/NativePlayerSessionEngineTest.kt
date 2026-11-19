package expo.modules.mpvplayer.nativeplayer

import android.app.Activity
import expo.modules.mpvplayer.nativeplayer.engine.ChromeEngine
import org.junit.Assert.assertEquals
import org.junit.Test

// The session reaches rendering only through its `rendering` cast. Its engine factory returned the local
// PlayerEngine, so the start callback attached the surface on that type, past the cast and unseen by the
// compiler: the factory hands out the ChromeEngine the chrome holds.
class NativePlayerSessionEngineTest {
    @Test
    fun theEngineFactoryHandsOutAChromeEngine() {
        val factory = NativePlayerSession::class.java.getDeclaredMethod(
            "createEngine",
            Activity::class.java,
            PlayerPresentConfigRecord::class.java,
        )
        assertEquals(ChromeEngine::class.java, factory.returnType)
    }
}

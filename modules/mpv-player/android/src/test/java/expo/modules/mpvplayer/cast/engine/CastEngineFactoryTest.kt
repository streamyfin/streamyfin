package expo.modules.mpvplayer.cast.engine

import org.junit.Assert.assertNull
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment

// The factory is the one door to the SDK: where Cast is unavailable it hands out no engine, and makes
// no Cast call on the way (Robolectric has no Play Services). The adapters behind it are proven on a
// real receiver (spec §7.1).
@RunWith(RobolectricTestRunner::class)
class CastEngineFactoryTest {
    @Test
    fun createReturnsNullWhereCastIsUnavailable() {
        assertNull(CastEngine.create(RuntimeEnvironment.getApplication(), SERVER))
    }
}

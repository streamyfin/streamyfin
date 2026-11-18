package expo.modules.mpvplayer.nativeplayer

import expo.modules.kotlin.functions.BaseAsyncFunctionComponent
import expo.modules.kotlin.functions.FunctionQueue
import expo.modules.kotlin.functions.Queues
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class NativePlayerModuleQueueTest {
    // updateNextEpisode publishes the playback state, which sets the window's keep-screen-on flag.
    // On the module's background queue Android refused that at every local playback
    // (CalledFromWrongThreadException), and the call's promise rejected.
    @Test
    fun updateNextEpisodeRunsOnTheMainQueue() {
        assertEquals(Queues.MAIN, queueOf("updateNextEpisode"))
    }

    private fun queueOf(name: String): FunctionQueue {
        val function = NativePlayerModule().definition().asyncFunctions.getValue(name)
        // Expo keeps the queue protected; reading it is the only way to see where the call runs.
        val field = BaseAsyncFunctionComponent::class.java.getDeclaredField("queue")
        field.isAccessible = true
        return field.get(function) as FunctionQueue
    }
}

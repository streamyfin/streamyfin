package expo.modules.mpvplayer.cast

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class CastChannelsTest {
    // setMessageReceivedCallbacks throws without a live connection (a suspended session): the
    // namespace must stay free, or every later addChannel skips the registration for the rest
    // of the session and the receiver's messages never arrive.
    @Test
    fun aRegistrationThatThrowsLeavesTheNamespaceFree() {
        val channels = CastChannels()
        assertThrows(IllegalStateException::class.java) {
            channels.register("urn:x-cast:com.connectsdk") { throw IllegalStateException("no connection") }
        }
        var registered = 0
        channels.register("urn:x-cast:com.connectsdk") { registered += 1 }
        assertEquals(1, registered)
    }

    @Test
    fun aNamespaceRegistersOnce() {
        val channels = CastChannels()
        var registered = 0
        channels.register("urn:x-cast:com.connectsdk") { registered += 1 }
        channels.register("urn:x-cast:com.connectsdk") { registered += 1 }
        assertEquals(1, registered)
    }

    @Test
    fun aRemovedNamespaceRegistersAgain() {
        val channels = CastChannels()
        var registered = 0
        channels.register("urn:x-cast:com.connectsdk") { registered += 1 }
        assertTrue(channels.remove("urn:x-cast:com.connectsdk"))
        channels.register("urn:x-cast:com.connectsdk") { registered += 1 }
        assertEquals(2, registered)
    }
}

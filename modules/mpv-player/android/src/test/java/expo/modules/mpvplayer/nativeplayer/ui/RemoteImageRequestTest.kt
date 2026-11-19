package expo.modules.mpvplayer.nativeplayer.ui

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class RemoteImageRequestTest {
    private val poster = "https://jellyfin.example/Items/1/Images/Primary"

    @Test
    fun theArtworkRequestCarriesTheCustomHeaders() {
        // The artwork's own headers when the config gives some, the server's otherwise.
        val own = remoteImageHeaders(mapOf("X-Gateway-Token" to "artwork", "Ignored" to 3), mapOf("X-Gateway-Token" to "server"))
        assertEquals(mapOf("X-Gateway-Token" to "artwork"), own)
        val server = remoteImageHeaders(null, mapOf("X-Gateway-Token" to "server"))
        assertEquals(mapOf("X-Gateway-Token" to "server"), server)

        val request = remoteImageRequest(poster, server)
        assertEquals("server", request.getRequestProperty("X-Gateway-Token"))
    }

    @Test
    fun anImageWithNoCustomHeadersIsAskedForPlainly() {
        assertNull(remoteImageHeaders(null, null))
        assertNull(remoteImageHeaders(emptyMap(), null))
        assertNull(remoteImageRequest(poster, null).getRequestProperty("X-Gateway-Token"))
    }
}

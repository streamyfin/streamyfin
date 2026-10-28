package expo.modules.mpvplayer.nativeplayer.engine

import android.net.Uri
import androidx.media3.common.C
import androidx.media3.datasource.DataSpec
import androidx.media3.datasource.HttpDataSource
import java.net.InetAddress
import java.util.concurrent.TimeUnit
import javax.net.ssl.HttpsURLConnection
import javax.net.ssl.SSLSocketFactory
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.RecordedRequest
import okhttp3.tls.HandshakeCertificates
import okhttp3.tls.HeldCertificate
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * Drives UpgradeRedirectDataSource through DefaultHttpDataSource against two local servers: the
 * Jellyfin stand-in over http on 127.0.0.1, and a CDN over https on localhost, another host.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class UpgradeRedirectDataSourceTest {
    private val server = MockWebServer()
    private val cdn = MockWebServer()
    private val headers = mapOf("Authorization" to "MediaBrowser Token=\"secret\"", "X-Proxy-Key" to "proxy-secret")
    private lateinit var defaultSocketFactory: SSLSocketFactory
    private lateinit var streamUrl: String

    @Before fun start() {
        val certificate = HeldCertificate.Builder().addSubjectAlternativeName("localhost").build()
        cdn.useHttps(HandshakeCertificates.Builder().heldCertificate(certificate).build().sslSocketFactory(), false)
        defaultSocketFactory = HttpsURLConnection.getDefaultSSLSocketFactory()
        HttpsURLConnection.setDefaultSSLSocketFactory(
            HandshakeCertificates.Builder().addTrustedCertificate(certificate.certificate).build().sslSocketFactory(),
        )
        server.start(InetAddress.getByName("127.0.0.1"), 0)
        cdn.start(InetAddress.getByName("localhost"), 0)
        streamUrl = "http://127.0.0.1:${server.port}/Videos/abc/stream?static=true"
    }

    @After fun stop() {
        HttpsURLConnection.setDefaultSSLSocketFactory(defaultSocketFactory)
        server.shutdown()
        cdn.shutdown()
    }

    private fun cdnUrl(path: String) = "https://localhost:${cdn.port}$path"

    /** Opens [url] as the player does, reads it through and returns the address it reports. */
    private fun load(url: String): String? {
        val source = UpgradeRedirectDataSource.Factory(headers, streamUrl).createDataSource()
        try {
            source.open(DataSpec(Uri.parse(url)))
            val buffer = ByteArray(1024)
            while (source.read(buffer, 0, buffer.size) != C.RESULT_END_OF_INPUT) Unit
            return source.uri?.toString()
        } finally {
            source.close()
        }
    }

    private fun MockWebServer.next(): RecordedRequest = checkNotNull(takeRequest(5, TimeUnit.SECONDS))

    private fun RecordedRequest.carriesHeaders() =
        getHeader("Authorization") != null || getHeader("X-Proxy-Key") != null

    @Test fun theStreamsHostGetsTheHeaders() {
        server.enqueue(MockResponse().setBody("media"))
        load(streamUrl)
        val request = server.next()
        assertEquals("MediaBrowser Token=\"secret\"", request.getHeader("Authorization"))
        assertEquals("proxy-secret", request.getHeader("X-Proxy-Key"))
    }

    @Test fun anUpgradeToTheCdnIsFollowedWithoutTheHeaders() {
        server.enqueue(MockResponse().setResponseCode(307).setHeader("Location", cdnUrl("/hls/master.m3u8")))
        cdn.enqueue(MockResponse().setBody("#EXTM3U"))
        assertEquals(cdnUrl("/hls/master.m3u8"), load(streamUrl))
        assertTrue(server.next().carriesHeaders())
        assertFalse(cdn.next().carriesHeaders())
    }

    @Test fun anHlsChildOnTheCdnGetsNoHeaders() {
        // Media3 resolves child playlists and segments against the address the source reports.
        cdn.enqueue(MockResponse().setBody("#EXTM3U"))
        cdn.enqueue(MockResponse().setBody("segment"))
        load(cdnUrl("/hls/main.m3u8"))
        load(cdnUrl("/hls/main/0.ts"))
        assertFalse(cdn.next().carriesHeaders())
        assertFalse(cdn.next().carriesHeaders())
    }

    @Test fun aDowngradeFailsWithTheRedirect() {
        cdn.enqueue(MockResponse().setResponseCode(307).setHeader("Location", streamUrl))
        val error = assertThrows(HttpDataSource.InvalidResponseCodeException::class.java) { load(cdnUrl("/x")) }
        assertEquals(307, error.responseCode)
        assertEquals(0, server.requestCount)
    }

    @Test fun aFailedHopKeepsTheRedirectThatLedToIt() {
        server.enqueue(MockResponse().setResponseCode(307).setHeader("Location", cdnUrl("/gone")))
        cdn.enqueue(MockResponse().setResponseCode(404))
        val error = assertThrows(HttpDataSource.InvalidResponseCodeException::class.java) { load(streamUrl) }
        assertEquals(404, error.responseCode)
        assertEquals(307, (error.suppressed.single() as HttpDataSource.InvalidResponseCodeException).responseCode)
    }
}

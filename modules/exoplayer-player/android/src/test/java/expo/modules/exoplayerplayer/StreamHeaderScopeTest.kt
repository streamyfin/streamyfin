package expo.modules.exoplayerplayer

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class StreamHeaderScopeTest {
    private val stream = "http://jf.example:8096/Videos/abc/stream?static=true"
    private val scope = StreamHeaderScope(stream)

    @Test fun theStreamsOwnHostAndPortGetTheHeaders() {
        assertTrue(scope.covers("http://jf.example:8096/Videos/abc/main.m3u8"))
        assertTrue(scope.covers("http://JF.example:8096/Videos/abc/Subtitles/3/Stream.srt"))
    }

    // java.net.URI has no host for a name with an underscore, a Docker service or a LAN name.
    @Test fun aHostNameWithAnUnderscoreGetsThem() {
        val docker = StreamHeaderScope("http://jf_box:8096/Videos/abc/stream")
        assertTrue(docker.covers("http://jf_box:8096/Videos/abc/main.m3u8"))
        assertTrue(docker.covers("https://jf_box:8096/Videos/abc/stream"))
        assertFalse(docker.covers("http://jf_box:8920/Videos/abc/stream"))
        assertFalse(docker.covers("http://other_box:8096/Videos/abc/stream"))
        assertEquals(
            "https://jf_box:8920/Videos/abc/stream",
            StreamHeaderScope.upgradeTarget("http://jf_box:8096/Videos/abc/stream", 307, "https://jf_box:8920/Videos/abc/stream"),
        )
    }

    @Test fun anotherHostOrPortGetsNone() {
        assertFalse(scope.covers("https://cdn.example/hls/main.m3u8"))
        assertFalse(scope.covers("http://jf.example:8920/Videos/abc/stream"))
        assertFalse(scope.covers("http://subs.example/abc.srt"))
        assertFalse(scope.covers("not a url"))
    }

    @Test fun theHttpsSideOfTheSameServerGetsThem() {
        assertTrue(scope.covers("https://jf.example:8096/Videos/abc/stream"))
        // A default port counts as none: http://host and https://host are one server.
        val proxied = StreamHeaderScope("http://jf.example/Videos/abc/stream")
        assertTrue(proxied.covers("https://jf.example/Videos/abc/stream"))
        assertTrue(proxied.covers("https://jf.example:443/Videos/abc/stream"))
    }

    @Test fun anHttpsStreamNeverSendsThemOverHttp() {
        assertFalse(StreamHeaderScope("https://jf.example/Videos/abc/stream").covers("http://jf.example/Videos/abc/main.m3u8"))
    }

    @Test fun anUpgradeIsFollowedToAnyHost() {
        assertEquals("https://cdn.example/v/abc?sig=1", StreamHeaderScope.upgradeTarget(stream, 307, "https://cdn.example/v/abc?sig=1"))
        assertEquals("https://jf.example/Videos/abc/stream", StreamHeaderScope.upgradeTarget(stream, 301, " https://jf.example/Videos/abc/stream "))
    }

    @Test fun onlyAnUpgradeIsFollowed() {
        assertNull(StreamHeaderScope.upgradeTarget("https://jf.example/x", 307, "http://cdn.example/x"))
        assertNull(StreamHeaderScope.upgradeTarget(stream, 302, "http://cdn.example/v/abc"))
        // Relative and scheme-relative locations keep the protocol.
        assertNull(StreamHeaderScope.upgradeTarget(stream, 302, "/Videos/abc/stream2"))
        assertNull(StreamHeaderScope.upgradeTarget(stream, 302, "//cdn.example/v/abc"))
    }

    @Test fun onlyARedirectStatusWithAUsableLocationCounts() {
        assertNull(StreamHeaderScope.upgradeTarget(stream, 200, "https://cdn.example/v"))
        assertNull(StreamHeaderScope.upgradeTarget(stream, 404, "https://cdn.example/v"))
        assertNull(StreamHeaderScope.upgradeTarget(stream, 307, null))
        assertNull(StreamHeaderScope.upgradeTarget(stream, 307, "https://cdn example/v"))
    }
}

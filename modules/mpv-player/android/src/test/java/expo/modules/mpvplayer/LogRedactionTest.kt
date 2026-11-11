package expo.modules.mpvplayer

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

class LogRedactionTest {
    // An external subtitle URL as the player receives it: logged whole, it handed the session's
    // token to logcat.
    @Test
    fun redactsTheTokenOfASubtitleUrl() {
        assertEquals(
            "https://media.example.com/Videos/item-1/source-1/Subtitles/3/0/Stream.srt?ApiKey=[redacted]",
            redactCredentials(
                "https://media.example.com/Videos/item-1/source-1/Subtitles/3/0/Stream.srt?ApiKey=SECRET"
            )
        )
    }

    // Every name the JS-side redaction masks, in the mixed case a server or a
    // proxy happens to emit.
    @Test
    fun redactsEverySensitiveParameterName() {
        val url = "https://x.example/a" +
            "?api_key=v1" +
            "&ApiKey=v2" +
            "&x-emby-token=v3" +
            "&X-Emby-Token=v4" +
            "&access_token=v5" +
            "&Access_Token=v6" +
            "&token=v7" +
            "&Token=v8" +
            "&userid=v9" +
            "&UserId=v10" +
            "&deviceid=v11" +
            "&DeviceId=v12"

        val redacted = redactCredentials(url)

        assertFalse(redacted.contains("v1"))
        assertFalse(redacted.contains("v2"))
        assertFalse(redacted.contains("v3"))
        assertFalse(redacted.contains("v4"))
        assertFalse(redacted.contains("v5"))
        assertFalse(redacted.contains("v6"))
        assertFalse(redacted.contains("v7"))
        assertFalse(redacted.contains("v8"))
        assertFalse(redacted.contains("v9"))
        assertFalse(redacted.contains("v10"))
        assertFalse(redacted.contains("v11"))
        assertFalse(redacted.contains("v12"))
        assertEquals(12, Regex("\\[redacted]").findAll(redacted).count())
    }

    @Test
    fun redactsSeveralParametersInOneUrl() {
        assertEquals(
            "https://x.example/a?token=[redacted]&keep=1&deviceid=[redacted]",
            redactCredentials("https://x.example/a?token=s1&keep=1&deviceid=d9"),
        )
    }

    @Test
    fun leavesAUrlWithoutCredentialsAsItIs() {
        val url = "file:///data/user/0/app/files/subtitles/item-1.srt"

        assertEquals(url, redactCredentials(url))
    }

    @Test
    fun redactsUrlUserinfo() {
        assertEquals(
            "https://[redacted]@proxy.example.com/stream?token=[redacted]",
            redactCredentials("https://user:secret@proxy.example.com/stream?token=s1"),
        )
    }

    @Test
    fun leavesAUrlWithoutUserinfoAsItIs() {
        assertEquals(
            "https://proxy.example.com/stream?keep=1",
            redactCredentials("https://proxy.example.com/stream?keep=1"),
        )
    }

    // A scheme in capitals and a password with a colon in it are still userinfo.
    @Test
    fun redactsUserinfoWhateverTheSchemeCaseOrAColonInThePassword() {
        assertEquals(
            "HTTPS://[redacted]@proxy.example.com/stream",
            redactCredentials("HTTPS://user:pa:ss@proxy.example.com/stream"),
        )
    }

    // An @ in the query or the fragment is no userinfo: the host stays, and the
    // whole token is masked rather than the text before its @.
    @Test
    fun keepsAnAtSignInTheQueryOrFragmentOutOfUserinfo() {
        assertEquals(
            "https://proxy.example.com:8096?token=[redacted]",
            redactCredentials("https://proxy.example.com:8096?token=ab@cd"),
        )
        assertEquals(
            "https://proxy.example.com:8096#part@x",
            redactCredentials("https://proxy.example.com:8096#part@x"),
        )
    }

    // No URL holds a double quote: in a JSON log line it closes the string, and the fields
    // after it are not userinfo.
    @Test
    fun stopsTheAuthorityAtADoubleQuote() {
        val line = "{\"url\":\"https://media.example\",\"requestId\":\"bob@example.com\"}"
        assertEquals(line, redactCredentials(line))
        assertEquals(
            "{\"url\":\"https://[redacted]@proxy.example.com/x\",\"requestId\":\"r1\"}",
            redactCredentials("{\"url\":\"https://user:secret@proxy.example.com/x\",\"requestId\":\"r1\"}"),
        )
    }

    // An empty user before the password, or a token as the user alone, is still userinfo.
    @Test
    fun redactsUserinfoWithAnEmptyUserOrATokenAlone() {
        assertEquals(
            "https://[redacted]@proxy.example.com/stream",
            redactCredentials("https://:secret@proxy.example.com/stream"),
        )
        assertEquals(
            "https://[redacted]@proxy.example.com/stream",
            redactCredentials("https://tok3n@proxy.example.com/stream"),
        )
    }

    // The stream URL of a remote source is its Path as Jellyfin stores it: an IPTV or .strm
    // item can carry its credentials as path segments, which no parameter list names.
    @Test
    fun keepsOnlyTheOriginOfARemoteSourceUrl() {
        assertEquals(
            "load http://provider.example:8080/[redacted] failed",
            redactStreamUrls("load http://provider.example:8080/movie/USER/PASS/123.mkv failed"),
        )
        assertEquals(
            "https://cdn.example.com/[redacted]",
            redactStreamUrls("https://user:secret@cdn.example.com/live.m3u8?username=U&password=P"),
        )
    }

    @Test
    fun keepsAJellyfinStreamUrlWithItsCredentialsMasked() {
        assertEquals(
            "http://jf.example:8096/Videos/2b5e727fd61e95f0ca3fd552b1132d22/stream?static=true&api_key=[redacted]",
            redactStreamUrls(
                "http://jf.example:8096/Videos/2b5e727fd61e95f0ca3fd552b1132d22/stream?static=true&api_key=SECRET"
            ),
        )
        // A subtitle route, with the dashed id it carries, behind a base path that stays hidden.
        val subtitle = "/Videos/b8ba64b6-8d39-ccf2-f594-85c42d5baa7b/" +
            "b8ba64b68d39ccf2f59485c42d5baa7b/Subtitles/2/0/Stream.srt"
        assertEquals(
            "https://jf.example/[base]$subtitle",
            redactStreamUrls("https://jf.example/jellyfin$subtitle"),
        )
        val segment = "https://jf.example/Videos/2b5e727fd61e95f0ca3fd552b1132d22/hls1/main/0.ts"
        assertEquals(segment, redactStreamUrls(segment))
    }

    @Test
    fun keepsALocalFileAndRedactsEveryUrlOfAMessage() {
        val local = "file:///data/user/0/app/cache/subtitles/item-1-ms-1-3-0f75cd89.srt"
        assertEquals(local, redactStreamUrls(local))
        assertEquals(
            "Unable to connect to http://provider.example/[redacted] after 8000 ms then https://jf.example/" +
                "Videos/2b5e727fd61e95f0ca3fd552b1132d22/stream?ApiKey=[redacted]",
            redactStreamUrls(
                "Unable to connect to http://provider.example/get.php?username=U&password=P after 8000 ms " +
                    "then https://jf.example/Videos/2b5e727fd61e95f0ca3fd552b1132d22/stream?ApiKey=SECRET"
            ),
        )
    }

    // Segments named like Jellyfin's routes are not enough: only a route matched whole is kept,
    // and whatever precedes it is hidden.
    @Test
    fun trustsOnlyAWholeJellyfinRoute() {
        assertEquals(
            "https://cdn.example.com/[redacted]",
            redactStreamUrls("https://cdn.example.com/Videos/USER/PASS/movie.mkv"),
        )
        assertEquals(
            "http://provider.example/[redacted]",
            redactStreamUrls("http://provider.example/Videos/0123456789abcdef0123456789abcdef/USER/PASS/a.mkv"),
        )
        assertEquals(
            "http://provider.example/[base]/Videos/0123456789abcdef0123456789abcdef/stream",
            redactStreamUrls("http://provider.example/USER/PASS/Videos/0123456789abcdef0123456789abcdef/stream"),
        )
    }

    // An email as the user name, or an @ in the password: userinfo runs to the last @ of the
    // authority, or the password survives after the first one.
    @Test
    fun redactsUserinfoThatHoldsAnAt() {
        val url = "http://john@gmail.com:S3cret@iptv.example:8080/live/1.ts"
        assertEquals("http://[redacted]@iptv.example:8080/live/1.ts", redactCredentials(url))
        assertEquals("http://iptv.example:8080/[redacted]", redactStreamUrls(url))
        assertEquals("http://[redacted]@host.example/x", redactCredentials("http://user:p@ss@host.example/x"))
    }

    // Jellyfin serves its routes in any case (a TranscodingUrl is lowercase), the fMP4 init
    // segment is -1, and a subtitle route can go without its start ticks.
    @Test
    fun keepsEveryFormOfAJellyfinRoute() {
        val id = "2b5e727fd61e95f0ca3fd552b1132d22"
        for (route in listOf(
            "/videos/$id/master.m3u8?api_key=[redacted]",
            "/videos/$id/hls1/main/-1.mp4",
            "/videos/$id/hls1/main/12.mp4",
            "/Videos/$id/$id/Subtitles/3/Stream.srt",
        )) {
            assertEquals("https://jf.example$route", redactStreamUrls("https://jf.example${route.replace("[redacted]", "SECRET")}"))
        }
    }
}

package expo.modules.mpvplayer

import org.junit.Assert.assertEquals
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
        // Behind a base path, with the dashed id the subtitle routes carry, and an HLS segment.
        val subtitle = "https://jf.example/jellyfin/Videos/b8ba64b6-8d39-ccf2-f594-85c42d5baa7b/" +
            "b8ba64b68d39ccf2f59485c42d5baa7b/Subtitles/2/0/Stream.srt"
        assertEquals(subtitle, redactStreamUrls(subtitle))
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

    // A path segment named like Jellyfin's routes is not enough: the id must follow it.
    @Test
    fun doesNotTakeAVideosFolderOfAnotherHostForJellyfin() {
        assertEquals(
            "https://cdn.example.com/[redacted]",
            redactStreamUrls("https://cdn.example.com/Videos/USER/PASS/movie.mkv"),
        )
    }
}

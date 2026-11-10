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
}

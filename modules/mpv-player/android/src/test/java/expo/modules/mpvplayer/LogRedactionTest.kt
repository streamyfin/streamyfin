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
}

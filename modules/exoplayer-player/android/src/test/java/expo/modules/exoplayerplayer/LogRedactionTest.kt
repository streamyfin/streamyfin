package expo.modules.exoplayerplayer

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
}

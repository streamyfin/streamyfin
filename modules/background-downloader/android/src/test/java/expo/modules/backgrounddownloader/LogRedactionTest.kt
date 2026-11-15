package expo.modules.backgrounddownloader

import org.junit.Assert.assertEquals
import org.junit.Test

class LogRedactionTest {
  // A download URL as the app enqueues it: logged whole, it handed the session's token to logcat.
  @Test
  fun redactsTheTokenAndTheIdentifiersOfADownloadUrl() {
    assertEquals(
      "https://media.example.com/Audio/item-1/stream?static=true&deviceId=[redacted]&ApiKey=[redacted]&userId=[redacted]",
      redactCredentials(
        "https://media.example.com/Audio/item-1/stream?static=true&deviceId=device-1&ApiKey=SECRET&userId=user-1"
      )
    )
  }

  @Test
  fun redactsTheParameterWhateverItsCase() {
    assertEquals(
      "/Items/item-1/Download?api_key=[redacted]",
      redactCredentials("/Items/item-1/Download?api_key=SECRET")
    )
    assertEquals(
      "/Items/item-1/Download?X-Emby-Token=[redacted]",
      redactCredentials("/Items/item-1/Download?X-Emby-Token=SECRET")
    )
  }

  @Test
  fun leavesAUrlWithoutCredentialsAsItIs() {
    val url = "https://media.example.com/Items/item-1/Download?static=true"

    assertEquals(url, redactCredentials(url))
  }

  // A proxy's basic auth in the server address rides along on every download URL.
  @Test
  fun redactsTheUserinfoOfADownloadUrl() {
    assertEquals(
      "https://[redacted]@proxy.example.com/Items/item-1/Download?api_key=[redacted]",
      redactCredentials("https://user:secret@proxy.example.com/Items/item-1/Download?api_key=SECRET")
    )
    assertEquals(
      "http://[redacted]@host.example/Items/item-1/Download",
      redactCredentials("http://john@gmail.com:p@ss@host.example/Items/item-1/Download")
    )
  }

  // No URL holds a double quote: in a JSON log line it closes the string, and the fields after it
  // are not userinfo.
  @Test
  fun stopsTheAuthorityAtADoubleQuote() {
    val line = "{\"url\":\"https://media.example\",\"requestId\":\"bob@example.com\"}"
    assertEquals(line, redactCredentials(line))
    assertEquals(
      "{\"url\":\"https://[redacted]@proxy.example.com/x\",\"requestId\":\"r1\"}",
      redactCredentials("{\"url\":\"https://user:secret@proxy.example.com/x\",\"requestId\":\"r1\"}")
    )
  }
}

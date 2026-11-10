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
}

package expo.modules.exoplayerplayer

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class UpgradeRedirectsTest {
    private val stream = "http://jf.example:8096/Videos/abc/stream?static=true"

    @Test fun anUpgradeToAnotherHostIsFollowedWithoutTheHeaders() {
        assertEquals(
            UpgradeRedirects.Hop("https://cdn.example/v/abc?sig=1", keepHeaders = false),
            UpgradeRedirects.next(stream, 307, "https://cdn.example/v/abc?sig=1"),
        )
    }

    @Test fun anUpgradeOnTheSameHostKeepsTheHeaders() {
        assertEquals(
            UpgradeRedirects.Hop("https://JF.example:8920/Videos/abc/stream?static=true", keepHeaders = true),
            UpgradeRedirects.next(stream, 301, "https://JF.example:8920/Videos/abc/stream?static=true"),
        )
    }

    @Test fun aDowngradeIsNotFollowed() {
        assertNull(UpgradeRedirects.next("https://jf.example/Videos/abc/stream", 307, "http://cdn.example/v/abc"))
    }

    @Test fun aRedirectThatKeepsTheProtocolIsLeftToHttpUrlConnection() {
        assertNull(UpgradeRedirects.next(stream, 302, "http://cdn.example/v/abc"))
        // Relative and scheme-relative locations keep the protocol as well.
        assertNull(UpgradeRedirects.next(stream, 302, "/Videos/abc/stream2"))
        assertNull(UpgradeRedirects.next(stream, 302, "//cdn.example/v/abc"))
    }

    @Test fun onlyARedirectStatusWithAUsableLocationCounts() {
        assertNull(UpgradeRedirects.next(stream, 200, "https://cdn.example/v"))
        assertNull(UpgradeRedirects.next(stream, 404, "https://cdn.example/v"))
        assertNull(UpgradeRedirects.next(stream, 307, null))
        assertNull(UpgradeRedirects.next(stream, 307, "https://cdn example/v"))
    }
}

package expo.modules.mpvplayer.nativeplayer.remote

import expo.modules.mpvplayer.nativeplayer.PlayerConstants
import org.junit.Assert.assertEquals
import org.junit.Test

class RemoteColorsTest {
    @Test
    fun aTintFromJsGivesTheScreenItsColors() {
        val colors = RemoteColors.of(top = "#1F3340", bottom = "#0e1a21", accent = "#C9A7FB")
        assertEquals(RemoteColors(top = 0xFF1F3340, bottom = 0xFF0E1A21, accent = 0xFFC9A7FB), colors)
    }

    @Test
    fun aMissingOrUnreadableTintFallsBackToTheNeutral() {
        val neutral = RemoteColors(
            top = PlayerConstants.REMOTE_TINT_NEUTRAL_TOP,
            bottom = PlayerConstants.REMOTE_TINT_NEUTRAL_BOTTOM,
            accent = PlayerConstants.REMOTE_ACTIVE_COLOR,
        )
        assertEquals(neutral, RemoteColors.of(null, null, null))
        // Half a background is no background: both stops fall back together.
        assertEquals(neutral.copy(accent = 0xFF112233), RemoteColors.of("#1F3340", "teal", "#112233"))
        assertEquals(neutral, RemoteColors.of("#fff", "+12345", "#C9A7FB00"))
    }
}

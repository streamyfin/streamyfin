package expo.modules.mpvplayer.nativeplayer

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

// The engine is the one the session built at present. Each load read the engine its config named, so a
// load naming another one turned the mpv-only menus off while mpv played on, or on over ExoPlayer.
@RunWith(RobolectricTestRunner::class)
class PlayerViewModelEngineKindTest {
    @Test
    fun aLoadNamingAnotherEngineKeepsTheMenusOfTheOneBuilt() {
        val onMpv = PlayerViewModel().also { it.isMpvEngine = true }
        onMpv.apply(PlayerPresentConfigRecord().also { it.engine = "cast" })
        assertTrue(onMpv.isMpvEngine)

        val onExoPlayer = PlayerViewModel().also { it.isMpvEngine = false }
        onExoPlayer.apply(PlayerPresentConfigRecord().also { it.engine = "mpv" })
        assertFalse(onExoPlayer.isMpvEngine)
    }
}

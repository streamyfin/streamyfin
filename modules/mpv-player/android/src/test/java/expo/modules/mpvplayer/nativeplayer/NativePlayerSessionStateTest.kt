package expo.modules.mpvplayer.nativeplayer

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class NativePlayerSessionStateTest {
    // The next episode comes from JS after the first publish. Until the next pause or seek, the
    // lock screen and a headset had no Next for the rest of the episode.
    @Test
    fun aNextEpisodeThatArrivesLaterIsPublished() {
        val viewModel = PlayerViewModel()
        var publishes = 0
        viewModel.onPlaybackStateSync = { publishes++ }

        viewModel.updateNextEpisode(NextEpisodeRecord().apply { itemId = "next" })

        assertEquals(1, publishes)
    }

    // Behind a proxy that needs the user's custom headers, the artwork request went out without
    // them and was refused.
    @Test
    fun theArtworkKeepsTheHeadersItIsGiven() {
        val info = nowPlayingInfo(MetadataRecord().apply {
            title = "Episode"
            artworkUri = "https://server/Items/1/Images/Primary"
            artworkHeaders = mapOf("X-Proxy-Auth" to "secret", "X-Number" to 1)
        })

        assertEquals(mapOf("X-Proxy-Auth" to "secret"), info?.artworkHeaders)
    }

    @Test
    fun noHeadersStayNone() {
        assertNull(nowPlayingInfo(MetadataRecord().apply { title = "Movie" })?.artworkHeaders)
    }
}

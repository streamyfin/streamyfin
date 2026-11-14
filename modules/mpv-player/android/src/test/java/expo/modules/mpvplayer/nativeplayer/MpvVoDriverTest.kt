package expo.modules.mpvplayer.nativeplayer

import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * The native session started mpv on gpu-next whatever the "Video output"
 * setting said. These pin what mpv is started with for each thing the config
 * can carry.
 */
class MpvVoDriverTest {
    @Test
    fun theDriverTheSettingNamesIsUsed() {
        assertEquals("gpu", resolveMpvVoDriver("gpu"))
        assertEquals("gpu-next", resolveMpvVoDriver("gpu-next"))
    }

    @Test
    fun aConfigWithoutOneStartsOnTheDefault() {
        assertEquals("gpu-next", resolveMpvVoDriver(null))
    }

    // The option is set before mpv initializes. A name the setting never
    // offered is not passed on for mpv to make something of.
    @Test
    fun aDriverTheSettingNeverOfferedStartsOnTheDefault() {
        assertEquals("gpu-next", resolveMpvVoDriver("mediacodec_embed"))
        assertEquals("gpu-next", resolveMpvVoDriver(""))
        assertEquals("gpu-next", resolveMpvVoDriver("GPU"))
    }
}

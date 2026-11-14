package expo.modules.mpvplayer.nativeplayer.engine

import android.graphics.Color
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RuntimeEnvironment
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * The chrome hands every engine the subtitle style mpv reads: a background in mpv's #AARRGGBB
 * (utils/subtitles/subtitleStyle.ts). ExoPlayer read it as #RRGGBBAA, so the background's alpha
 * was the blue channel, 00, and the background never showed.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ExoSubtitleStyleTest {
    private val engine = ExoPlayerEngine(RuntimeEnvironment.getApplication())

    private fun <T> field(name: String): T {
        @Suppress("UNCHECKED_CAST")
        return ExoPlayerEngine::class.java.getDeclaredField(name)
            .apply { isAccessible = true }
            .get(engine) as T
    }

    @After
    fun release() {
        engine.stop()
    }

    // The settings' background at 60% opacity.
    @Test
    fun aBackgroundIsReadAsMpvWritesIt() {
        engine.setSubtitleStyle(mapOf("background" to "#99000000"))

        assertEquals(Color.argb(0x99, 0, 0, 0), field<Int>("subtitleBackgroundColor"))
        assertEquals("background-box", field<String>("subtitleBorderStyle"))
    }

    @Test
    fun noBackgroundKeepsTheOutline() {
        engine.setSubtitleStyle(mapOf("background" to ""))

        assertEquals(0, Color.alpha(field<Int>("subtitleBackgroundColor")))
        assertEquals("outline-and-shadow", field<String>("subtitleBorderStyle"))
    }

    // mpv takes the same #AARRGGBB for the text.
    @Test
    fun aTextColourIsReadAsMpvWritesIt() {
        engine.setSubtitleStyle(mapOf("color" to "#FFFFFF00"))
        assertEquals(Color.argb(0xFF, 0xFF, 0xFF, 0), field<Int>("subtitleForegroundColor"))

        engine.setSubtitleStyle(mapOf("color" to "#00FFFF"))
        assertEquals(Color.rgb(0, 0xFF, 0xFF), field<Int>("subtitleForegroundColor"))
    }
}

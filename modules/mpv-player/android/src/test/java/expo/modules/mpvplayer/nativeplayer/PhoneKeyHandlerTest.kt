package expo.modules.mpvplayer.nativeplayer

import android.view.KeyEvent
import expo.modules.mpvplayer.nativeplayer.engine.PlayerEngine
import java.lang.reflect.Proxy
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * A keyboard on a phone, a tablet or a Chromebook. The JS player listened to it (expo-key-event):
 * Space played or paused, Left and Right skipped by the rewind and forward lengths. The native
 * player's overlay only knew Back, so every other key did nothing.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class PhoneKeyHandlerTest {
    private val engineCalls = mutableListOf<String>()

    /** An engine that notes what it is asked, seeks with their target. */
    private val engine = Proxy.newProxyInstance(
        PlayerEngine::class.java.classLoader,
        arrayOf(PlayerEngine::class.java),
    ) { _, method, args ->
        engineCalls += if (method.name == "seekToTracked") "seek ${args[0]}" else method.name
        when (method.returnType) {
            java.lang.Boolean.TYPE -> false
            java.lang.Integer.TYPE -> 0
            java.lang.Double.TYPE -> 0.0
            else -> null
        }
    } as PlayerEngine

    private val viewModel = PlayerViewModel().also {
        it.engine = engine
        it.apply(PlayerPresentConfigRecord().apply {
            stream = StreamConfigRecord().apply { url = "https://server/stream" }
            metadata = MetadataRecord().apply { itemId = "film" }
            ui = UIOptionsRecord().apply {
                seekForwardSec = 30.0
                seekBackwardSec = 10.0
            }
        })
        it.displayPosition = 100.0
    }

    private var exits = 0
    private val handler = PhoneKeyHandler(viewModel, onExitRequested = { exits++ })

    /** A key pressed and released, as a keyboard sends it. */
    private fun press(keyCode: Int): Boolean {
        val down = handler.intercept(KeyEvent(KeyEvent.ACTION_DOWN, keyCode))
        val up = handler.intercept(KeyEvent(KeyEvent.ACTION_UP, keyCode))
        return down && up
    }

    private fun seeks() = engineCalls.filter { it.startsWith("seek") }

    @Test
    fun spacePlaysAndPauses() {
        assertTrue(press(KeyEvent.KEYCODE_SPACE))

        assertEquals(listOf("play"), engineCalls.filter { it == "play" || it == "pause" })
    }

    @Test
    fun theArrowsSkipByTheRewindAndForwardLengths() {
        assertTrue(press(KeyEvent.KEYCODE_DPAD_RIGHT))
        assertTrue(press(KeyEvent.KEYCODE_DPAD_LEFT))

        assertEquals(listOf("seek 130.0", "seek 120.0"), seeks())
    }

    // A held key repeats; one press is one skip, as on screen.
    @Test
    fun aHeldArrowSkipsOnce() {
        handler.intercept(KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_DPAD_RIGHT))
        handler.intercept(KeyEvent(0, 0, KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_DPAD_RIGHT, 1))
        handler.intercept(KeyEvent(KeyEvent.ACTION_UP, KeyEvent.KEYCODE_DPAD_RIGHT))

        assertEquals(1, seeks().size)
    }

    // Nothing may resume playback under the still-watching prompt but its own answer, and an open
    // panel keeps its keys.
    @Test
    fun anOpenPromptOrPanelKeepsTheKeys() {
        viewModel.showStillWatching = true
        assertFalse(press(KeyEvent.KEYCODE_SPACE))
        viewModel.showStillWatching = false
        viewModel.showEpisodeList = true
        assertFalse(press(KeyEvent.KEYCODE_DPAD_RIGHT))

        assertEquals(emptyList<String>(), engineCalls.filter { it == "play" || it.startsWith("seek") })
    }

    @Test
    fun backStillClosesTheScaleOverlayThenThePlayer() {
        viewModel.showSubtitleScaleOverlay = true
        assertTrue(handler.intercept(KeyEvent(KeyEvent.ACTION_UP, KeyEvent.KEYCODE_BACK)))
        assertFalse(viewModel.showSubtitleScaleOverlay)
        assertEquals(0, exits)

        assertTrue(handler.intercept(KeyEvent(KeyEvent.ACTION_UP, KeyEvent.KEYCODE_BACK)))
        assertEquals(1, exits)
    }

    @Test
    fun otherKeysPassThrough() {
        assertFalse(press(KeyEvent.KEYCODE_A))
    }
}

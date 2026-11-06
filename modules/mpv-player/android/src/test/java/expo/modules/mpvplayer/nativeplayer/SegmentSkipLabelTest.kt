package expo.modules.mpvplayer.nativeplayer

import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * The TV control bar and skip pill used to branch on Intro-or-credits, so a
 * Recap, Commercial or Preview segment read "Skip Credits". These cases pin
 * the shared mapping every surface now calls.
 */
class SegmentSkipLabelTest {
    private val strings = PlayerStrings(emptyMap())

    @Test
    fun recap() {
        assertEquals("Skip recap", segmentSkipLabel("Recap", strings))
    }

    @Test
    fun commercial() {
        assertEquals("Skip commercial", segmentSkipLabel("Commercial", strings))
    }

    @Test
    fun preview() {
        assertEquals("Skip preview", segmentSkipLabel("Preview", strings))
    }

    @Test
    fun outro() {
        assertEquals("Skip credits", segmentSkipLabel("Outro", strings))
    }

    @Test
    fun introAndUnknownTypes() {
        assertEquals("Skip intro", segmentSkipLabel("Intro", strings))
        assertEquals("Skip intro", segmentSkipLabel("SomethingNew", strings))
    }
}

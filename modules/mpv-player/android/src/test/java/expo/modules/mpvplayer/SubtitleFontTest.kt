package expo.modules.mpvplayer

import org.junit.Assert.assertEquals
import org.junit.Test

class SubtitleFontTest {
    @Test
    fun systemRestoresMpvDefaultInsteadOfClearingTheFont() {
        // An empty sub-font drops mpv's default family altogether, so the
        // "System" choice has to name that default explicitly.
        assertEquals("sans-serif", mpvSubtitleFont("System"))
    }

    @Test
    fun mapsTheSettingsChoicesToInstalledFamilies() {
        assertEquals("Roboto", mpvSubtitleFont("sans-serif"))
        assertEquals("Noto Serif", mpvSubtitleFont("serif"))
        assertEquals("Droid Sans Mono", mpvSubtitleFont("monospace"))
        assertEquals("OpenDyslexic", mpvSubtitleFont("opendyslexic"))
    }

    @Test
    fun passesUnknownFamiliesThrough() {
        assertEquals("Comic Neue", mpvSubtitleFont("Comic Neue"))
    }
}

package expo.modules.mpvplayer.nativeplayer

import expo.modules.mpvplayer.nativeplayer.ui.TrackRowText
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

// JS finishes a track row in two parts, the language and what is under it; the menus draw both and a
// selection must not drop the second.
@RunWith(RobolectricTestRunner::class)
class TrackRowTest {
    private fun row(label: String, detail: String?, index: Int, selected: Boolean = false) =
        TrackMenuItemRecord().also {
            it.label = label
            it.detail = detail
            it.jellyfinIndex = index
            it.selected = selected
        }

    @Test
    fun aTrackRowCarriesItsDetail() {
        assertEquals("AC3 · 5.1", TrackRowText.detailLine("AC3 · 5.1"))
        assertNull(TrackRowText.detailLine(null))
        assertNull(TrackRowText.detailLine(" "))
        // The TV's menus draw one line per row.
        assertEquals("English · AC3 · 5.1", TrackRowText.oneLine("English", "AC3 · 5.1"))
        assertEquals("English", TrackRowText.oneLine("English", null))
    }

    @Test
    fun aSelectedTrackKeepsItsDetail() {
        val viewModel = PlayerViewModel()
        viewModel.audioMenu = listOf(
            row("English", "AC3 · 5.1", index = 1, selected = true),
            row("Japanese", "AAC · Stereo", index = 2),
        )

        viewModel.selectAudio(viewModel.audioMenu[1])

        assertEquals(listOf(false, true), viewModel.audioMenu.map { it.selected })
        assertEquals(listOf("AC3 · 5.1", "AAC · Stereo"), viewModel.audioMenu.map { it.detail })
    }
}

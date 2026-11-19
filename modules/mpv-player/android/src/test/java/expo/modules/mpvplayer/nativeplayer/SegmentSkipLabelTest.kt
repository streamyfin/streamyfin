package expo.modules.mpvplayer.nativeplayer

import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * The TV control bar and skip pill used to branch on Intro-or-credits, so a
 * Recap, Commercial or Preview segment read "Skip Credits". These cases pin
 * the shared mapping every surface now calls: the key each type reads, and
 * the English text it falls back to when the app sent none.
 */
class SegmentSkipLabelTest {
    // A distinct text per key, as the app sends them, so a wrong key shows.
    private val sent = PlayerStrings(
        mapOf(
            "skipIntro" to "intro",
            "skipCredits" to "credits",
            "skipRecap" to "recap",
            "skipCommercial" to "commercial",
            "skipPreview" to "preview",
        ),
    )
    private val none = PlayerStrings(emptyMap())

    @Test
    fun aRecapReadsItsOwnLabelNotTheCreditsOne() {
        assertEquals("recap", segmentSkipLabel("Recap", sent))
        assertEquals("Skip recap", segmentSkipLabel("Recap", none))
    }

    @Test
    fun aCommercialReadsItsOwnLabel() {
        assertEquals("commercial", segmentSkipLabel("Commercial", sent))
        assertEquals("Skip commercial", segmentSkipLabel("Commercial", none))
    }

    @Test
    fun aPreviewReadsItsOwnLabel() {
        assertEquals("preview", segmentSkipLabel("Preview", sent))
        assertEquals("Skip preview", segmentSkipLabel("Preview", none))
    }

    @Test
    fun anOutroKeepsTheCreditsLabel() {
        assertEquals("credits", segmentSkipLabel("Outro", sent))
        assertEquals("Skip credits", segmentSkipLabel("Outro", none))
    }

    @Test
    fun anIntroAndAnUnknownTypeReadTheIntroLabel() {
        assertEquals("intro", segmentSkipLabel("Intro", sent))
        assertEquals("intro", segmentSkipLabel("SomethingNew", sent))
        assertEquals("Skip intro", segmentSkipLabel("Intro", none))
    }
}

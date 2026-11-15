package expo.modules.exoplayerplayer

import androidx.media3.common.MimeTypes
import org.junit.Assert.assertEquals
import org.junit.Test

class DtsDecoderSelectionTest {
    // The Jellyfin FFmpeg build maps only these two to its dca decoder (FfmpegLibrary.getCodecName).
    private val jellyfinFfmpeg = { mime: String -> mime == MimeTypes.AUDIO_DTS || mime == MimeTypes.AUDIO_DTS_HD }
    private val noFfmpeg = { _: String -> false }
    private val platform = { mime: String -> listOf("platform decoder for $mime") }

    @Test
    fun handsTheDtsFfmpegDecodesToFfmpeg() {
        assertEquals(emptyList<String>(), dtsAwareDecoderInfos(MimeTypes.AUDIO_DTS, jellyfinFfmpeg, platform))
        assertEquals(emptyList<String>(), dtsAwareDecoderInfos(MimeTypes.AUDIO_DTS_HD, jellyfinFfmpeg, platform))
    }

    // Emptied, it had no decoder at all: FFmpeg refuses it too.
    @Test
    fun leavesDtsExpressToThePlatform() {
        assertEquals(
            listOf("platform decoder for ${MimeTypes.AUDIO_DTS_EXPRESS}"),
            dtsAwareDecoderInfos(MimeTypes.AUDIO_DTS_EXPRESS, jellyfinFfmpeg, platform),
        )
    }

    // media3 falls back to the DTS core decoders for DTS-UHD under audio/vnd.dts, the lookup the
    // first rule empties; without them here a DTS-UHD track would have no decoder.
    @Test
    fun keepsTheDtsCoreFallbackOfDtsUhd() {
        assertEquals(
            listOf(
                "platform decoder for ${MimeTypes.AUDIO_DTS_UHD_P2}",
                "platform decoder for ${MimeTypes.AUDIO_DTS}",
            ),
            dtsAwareDecoderInfos(MimeTypes.AUDIO_DTS_UHD_P2, jellyfinFfmpeg, platform),
        )
    }

    // An FFmpeg library that failed to load decodes nothing: every DTS lookup stays with the
    // platform, and DTS-UHD gets its core fallback from media3 itself, not twice.
    @Test
    fun changesNothingWithoutAWorkingFfmpeg() {
        for (mime in listOf(MimeTypes.AUDIO_DTS, MimeTypes.AUDIO_DTS_HD, MimeTypes.AUDIO_DTS_UHD_P2)) {
            assertEquals(listOf("platform decoder for $mime"), dtsAwareDecoderInfos(mime, noFfmpeg, platform))
        }
    }

    @Test
    fun leavesOtherFormatsAlone() {
        assertEquals(
            listOf("platform decoder for ${MimeTypes.AUDIO_E_AC3}"),
            dtsAwareDecoderInfos(MimeTypes.AUDIO_E_AC3, jellyfinFfmpeg, platform),
        )
    }
}

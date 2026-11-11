package expo.modules.mpvplayer.nativeplayer.engine

import androidx.media3.common.MimeTypes

// TWIN: one copy per ExoPlayer module, identical but for the package
// (modules/exoplayer-player/src/upgradeRedirectDataSource.test.ts checks it).
/**
 * The platform decoders to offer for [mimeType] while FFmpeg takes over the DTS formats it
 * decodes, which the platform's DTS decoders get wrong (see ensurePlayer).
 *
 * Only what FFmpeg decodes leaves the platform: DTS and DTS-HD in the Jellyfin build. DTS Express
 * and DTS-UHD keep their platform decoders. media3 also falls back to the DTS core decoders for
 * DTS-UHD, through a second lookup under audio/vnd.dts that the first rule empties
 * (MediaCodecUtil.getAlternativeCodecMimeType), so they come with DTS-UHD's own lookup instead.
 */
internal fun <T> dtsAwareDecoderInfos(
    mimeType: String,
    ffmpegDecodes: (String) -> Boolean,
    platformDecoders: (String) -> List<T>,
): List<T> = when {
    mimeType.startsWith(MimeTypes.AUDIO_DTS) && ffmpegDecodes(mimeType) -> emptyList()
    mimeType == MimeTypes.AUDIO_DTS_UHD_P2 && ffmpegDecodes(MimeTypes.AUDIO_DTS) ->
        platformDecoders(mimeType) + platformDecoders(MimeTypes.AUDIO_DTS)
    else -> platformDecoders(mimeType)
}

# The Jellyfin Receiver Tells Audio by Its Content Type, Not Its Metadata

**Date**: 2026-11-06
**Category**: native-modules
**Key files**: `modules/mpv-player/android/src/main/java/expo/modules/mpvplayer/cast/CastMapping.kt`,
`modules/mpv-player/ios/Cast/CastMapping.swift`

## Detail

The Jellyfin receiver picks the Cast metadata type from the item's `Type`, not its media type
(`getMetadata` in jellyfin-chromecast's `src/helpers.ts`): `Episode` is a TV show (2), `Movie` a
movie (1), `Audio` a music track (3), `Photo` a photo, and anything else generic (0). An audiobook
(`Type` `AudioBook`, `MediaType` `Audio`) therefore comes back as generic metadata, like a home
video: on the bench "Le Corbeau et le Renard" played with metadata type 0, and the output sheet
offered Continue here for it.

The content type follows the media type instead (`createStreamInfo`, same file): every audio item
gets `audio/<container>`, its transcode `audio/<transcoding container>`; a video gets
`video/<container>`, or `application/x-mpegURL` for an HLS transcode. So `audio/` is the test for
audio on that receiver, whatever the item type; the metadata type alone misses audiobooks.

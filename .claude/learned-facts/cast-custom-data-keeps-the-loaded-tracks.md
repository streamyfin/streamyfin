# The Receiver's Custom Data Keeps the Tracks It Was Loaded With

**Date**: 2026-11-05
**Category**: native-modules
**Key files**: `utils/cast/playRequestFromReceiver.ts`,
`modules/mpv-player/android/src/main/java/expo/modules/mpvplayer/cast/CastRecords.kt`,
`modules/mpv-player/ios/Cast/CastRecords.swift`

## Detail

The Jellyfin receiver (1.3.2) writes `audioStreamIndex` and `subtitleStreamIndex` into the media's
custom data when it loads an item, and leaves them there. Subtitles picked on the TV side, from the
captions button of the Cast SDK's expanded controls (both SDKs), switch the media's active text
track without a reload: on the bench the active track went from 3 to 4 while the custom data still
said 3, and "Continue here" brought the English subtitles back over the French ones the TV showed.

The receiver builds a text track for every subtitle stream the server delivers as text (one with a
DeliveryUrl, SubRip and the like converted to VTT), not only the selected one, and names it by its
Jellyfin stream index (3 and 4 for the test episode's two SubRip streams); loaded without subtitles,
it builds none (`createStreamInfo` in jellyfin-chromecast's `src/helpers.ts`). An image subtitle (PGS)
picked at the load is burned into the stream and has no track. So the shown subtitles are the
active text track; with none active, a custom data index outside the text tracks is that burned-in
subtitle, and otherwise subtitles are off. The media status record carries `activeTrackIds` and the
media info's `textTrackIds` for this.

Audio has no Cast track there: a change of audio goes through a reload, which rewrites the custom
data.

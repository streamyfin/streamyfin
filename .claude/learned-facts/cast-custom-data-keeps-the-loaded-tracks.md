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

The receiver names each text track by the Jellyfin subtitle stream index (3 and 4 for the test
episode's two SubRip streams), so the shown subtitles are the active track ids that are text tracks,
and none of them active is subtitles off. Media without text tracks had its subtitles burned in at
the load, a new load that writes its index into the custom data. The media status record carries
`activeTrackIds` and the media info's `textTrackIds` for this.

Audio has no Cast track there: a change of audio goes through a reload, which rewrites the custom
data.

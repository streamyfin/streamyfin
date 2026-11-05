# The Media Status Position Is the Receiver's Last Report

**Date**: 2026-11-05
**Category**: native-modules
**Key files**: `components/cast/OutputButton.tsx`, `utils/cast/playRequestFromReceiver.ts`,
`modules/mpv-player/android/src/main/java/expo/modules/mpvplayer/cast/CastModule.kt`,
`modules/mpv-player/ios/Cast/CastModule.swift`

## Detail

The media status a Cast sender holds is the one the receiver last sent, and the Jellyfin
receiver (1.3.2) sends one on events only: a load, a seek, a pause, a buffering. While it plays
undisturbed, `streamPosition` (`MediaStatus` on Android, `GCKMediaStatus` on iOS) does not move:
on the bench it read 120.271 s with the receiver near 177 s, and "Continue here" started the
phone 58 s behind the TV. The SDK's `approximateStreamPosition`, an extrapolation from that same
report, still left the phone 19 s behind.

Ask the receiver first: `requestStatus()` on the remote media client (both SDKs) makes it send a
status now, and the estimate read once it answers is the receiver's position (175.521 s against
a stop at 175.282 s on the server). The Cast module's `requestMediaStatus` does both, bounded by
`RECEIVER_STATUS_TIMEOUT_MS`; a receiver that does not answer in time leaves the held status.

Anything that acts on where a playing receiver is now, not where it was at its last event, has
to go through that request; the status pushed to listeners is enough to know what it plays.

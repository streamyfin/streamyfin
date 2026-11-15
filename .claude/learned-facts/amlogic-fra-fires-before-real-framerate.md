# Amlogic HDMI frame-rate adaptation fires on the decoder's default, before the real rate is known

Direct-played MKV carries no frame rate the demuxer can hand to MediaCodec, so
ExoPlayer configures the codec without one and the vendor fills in its default
(30). The Amlogic HAL's HDMI frame-rate adaptation (FRA) sends its mode-switch
uevent at **configure time** from that default — the real rate only surfaces
~130 ms later when the decoder parses the bitstream (`reportFrameRate ... 
framerate[25.000000]`), and FRA re-runs but **never switches the mode**. Result:
25 fps content stays on the 2160p60hz panel and judders in an uneven 2:2:3
cadence. Verified on SEI Robotics/AcerAITV (Amlogic, API 34): two playbacks,
`switch_name:3200` (= 30 fps in the 96k duration timebase) both times, 
`GetDisplayMode:2160p60hz` after the 25 fps report both times.

Not fixable app-side through the decoder. The fix is app-driven mode switching:
`window.attributes.preferredDisplayModeId` — Android's frame-rate docs
prescribe it for TV boxes because `Surface.setFrameRate()` only drives seamless
switches and TV panels switch non-seamlessly. Implemented in
`RefreshRateMatcher.kt` + `NativePlayerSession.matchContentFrameRate`, gated by
the `matchRefreshRate` setting; the content rate comes from
`MediaStreams.RealFrameRate` (server-side, always known) as
`contentFrameRate` in the load config.

Diagnostics on this box: `/sys/class/display/mode` is root-only; use
`adb shell "dumpsys display | grep -i mode"` and watch
`adb logcat -s SystemControl:*` for `switch_name:`. The audio-HAL
`jitter: Position gap is behind system time gap by …` line at stream open is
the *previous* output's stale position counter — noise, not a finding.

## Confirmed with full logs (2026-11-04, same box, a 25 fps 3840x1600 HEVC MKV)

- Codec configure: `CCodec setup formats input { int32_t frame-rate = 30 }` —
  media3 1.10.1's `MatroskaExtractor` contains no frame-rate code at all
  (verified in the AAR bytecode), so the Format carries none and the vendor
  defaults to 30.
- Configure-time decision: `VDA setDurationToDecoder set [3200][30.000000]` →
  `HDMI TX switch_name:3200` → `SystemControl-FRA: hdmi frame rate is on` →
  `MesonDisplayServer: GetDisplayMode:2160p60hz`.
- ~180 ms later: `VDA reportFrameRate set [3840] framerate[25.000000]`
  (96000/25 = 3840). FRA does not re-decide.

Why jellyfin-androidtv still gets 50 Hz for the same title on this box: its
`PlaybackController` does the *same* thing — `display.getSupportedModes()`,
qualify the content rate and its 2x/2.5x multiples, set
`window.attributes.preferredDisplayModeId`. Same API, same list, and it
works — so the app-visible mode list is fine and our matcher is sound. Its
qualifier set includes the **2.5x** multiple (24 fps → 60 Hz); ours now does
too. The remaining failure mode is the rate never reaching the session, which
used to be a silent exit: `matchContentFrameRate` returned without a trace.
The session now logs the three outcomes — "config carries no content frame
rate", "no mode for X fps; supported […]", and the applied mode — and
`ExoPlayerEngine` logs `Video input format: … frameRate=` so the codec's
configured rate is visible in the same capture.

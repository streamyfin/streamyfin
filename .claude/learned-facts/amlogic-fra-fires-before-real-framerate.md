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

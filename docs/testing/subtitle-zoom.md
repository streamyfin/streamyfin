# Subtitle zoom checks

The shared player applies the selected subtitle style independently of video
zoom. Android's GPU renderer keeps ordinary subtitle layout in its output
viewport through libass margin options. Apple's renderer maps layout into the
visible portion of its subtitle canvas; this covers both composited video and
separate subtitle layers without changing MPVKit's layer frames.

Native ASS uses its original script resolution and per-style margins rather
than the converted-text margin settings. The renderer adjusts only MarginL,
MarginR and MarginV, preserves the existing bidi override, and clears the
temporary margins when returning to fit or switching to a non-ASS track.
Unchanged layouts do not reload the subtitle decoder.

Automated checks:

```sh
bun test utils/subtitlesZoom.test.ts utils/subtitles/subtitleStyle.test.ts utils/subtitles/subtitleIndex.test.ts
bash scripts/ios/test-subtitle-layout.sh
```

Physical playback acceptance is still required on iPhone, Apple TV and Android:

1. Play a widescreen video with SRT subtitles, including multiline dialogue.
   Toggle fit/fill repeatedly while playing and paused. Check size, bottom
   margin and wrapping against the visible screen edges.
2. Repeat in portrait and landscape, with custom size, top/bottom alignment
   and margin settings. Return to fit and confirm the original style returns.
3. Repeat with ordinary ASS subtitles and with subtitle style override enabled.
   Use `tests/native/Fixtures/viewport.ass` for multiline bottom dialogue and
   top dialogue with different authored fonts, colors and margins.
   ASS explicitly positioned signs (`\\pos`/`\\move`) retain authored placement
   and are outside the ordinary dialogue layout guarantee. Nonzero event-level
   margins also take precedence over style margins and retain their authored
   placement. Scripts without explicit positive PlayResX/Y are not remapped.
4. Enter and leave PiP, change video, seek and resume playback. Confirm subtitles
   remain visible and that a new video's aspect ratio is used.

Burned-in subtitles are video pixels and cannot be repositioned independently.
Bitmap subtitle tracks also need separate visual verification; the text-layout
checks do not establish their behavior.

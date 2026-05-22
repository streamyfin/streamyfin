# Chromecast Player UX — Trickplay, Bubble & Mini-Player — Design

**Date:** 2026-05-22
**Branch:** `refactor-chromecast` (PR #1402)
**Sub-project:** UX player, of the Chromecast refactor
**Status:** Approved design — pending implementation plan

---

## 1. Problem

- **Trickplay preview is truncated.** When the scrub position is far right, the
  trickplay preview window is cut off at the screen edge and does not track the
  cursor cleanly. Root cause: `renderBubble` in `CastPlayerProgressBar.tsx` (and the
  identical copy in `CastingMiniPlayer.tsx`) does its **own** absolute positioning
  (`position: "absolute", left: clampedLeft`) on top of the slider's bubble
  placement. `react-native-awesome-slider` already clamps the bubble within the
  track **if `bubbleWidth` is set** — but the code never sets it, so the library
  centres the bubble on the thumb with no clamp, and the manual offset fights it.
- **Duplication.** The ~110-line `renderBubble` block is copy-pasted between
  `CastPlayerProgressBar.tsx` and `CastingMiniPlayer.tsx`.
- **Time bubble is heavy.** The scrub-time indicator is a purple
  (`protocolColor`-background) bubble that takes too much visible space.
- **Touch zone overlaps.** The progress slider's `panHitSlop` is generous
  (`top: 30` main / `top: 20` mini), so its touch area overlaps the 4-button
  episode row — the buttons become hard or impossible to tap. The exact slop
  values need hand-calibration on a device.
- **Mini-player has no stop button.** `CastingMiniPlayer` exposes only play/pause.

## 2. Scope

**In scope:** fix the trickplay/scrub-bubble positioning on both progress bars,
extract the duplicated bubble into a shared component, lighten the time display,
add a stop button to the mini-player, and add a developer overlay that visualises
the touch zones so `panHitSlop` can be hand-calibrated.

**Out of scope:** the custom Cast receiver, any visual redesign beyond the items
above, the queued feature ideas (autoplay countdown, sleep timer, …).

## 3. Bubble positioning fix

`react-native-awesome-slider`'s `<Slider>` accepts `bubbleWidth?: number` — "if you
set this value, bubble positioning left & right will be clamped." The fix:

- Set `bubbleWidth` on both sliders, **dynamically**: the trickplay tile width when
  trickplay is available, the time-text width otherwise.
- `renderBubble` returns **only the bubble content** — no `position: "absolute"`,
  no `left: clampedLeft`, no `thumbPosition` / `minLeft` / `maxLeft` maths. All of
  that manual positioning is deleted; the slider clamps the bubble itself.

Result: the trickplay preview is never truncated, it tracks the cursor, and it is
clamped to the track at the edges.

## 4. Shared `CastTrickplayBubble` component

Create `components/casting/player/CastTrickplayBubble.tsx` — a single presentational
component that renders **either** the trickplay tile **or** the plain time text,
given the trickplay data and the current scrub time. Both `CastPlayerProgressBar`
and `CastingMiniPlayer` use it via `renderBubble`, with a `tileWidth` prop (220 for
the main player, 140 for the mini-player). This removes the ~220 lines of duplicated
`renderBubble` code and means the positioning is fixed in one place.

## 5. Time display

The scrub-time indicator becomes **plain white text** — no purple background bubble.
It is positioned **above** the preview: above the trickplay tile when trickplay is
shown, above the thumb otherwise. The purple `protocolColor` background bubble is
removed. The static current/ending/total time row below the slider is unchanged.

## 6. Mini-player stop button

`CastingMiniPlayer` gains a **stop** button (`stop-circle` icon) beside the existing
play/pause button. It calls `remoteMediaClient.stop()`; once the media stops the
mini-player hides itself (it already returns `null` on the `IDLE` state). The button
stops `stopPropagation` so it does not also trigger the row's "open player" press.

## 7. Touch-zone debug overlay

To let the touch zones be hand-calibrated, add a developer overlay:

- A module-level constant `DEBUG_TOUCH_ZONES`, default `false`, and gated by
  `__DEV__` so it can never be active in a release build.
- When enabled, the casting player renders coloured-border overlay `View`s
  (`pointerEvents: "none"` — they capture nothing, they only draw) tracing the
  touch zones that matter for the overlap: the progress slider's effective hit area
  (the slider box expanded by its `panHitSlop`) and the 4-button episode row.
- The developer flips the flag on, runs the Android emulator, sees the red-bordered
  zones, adjusts `panHitSlop` until correct, then flips the flag back off.

`panHitSlop` itself is given a sensible default in this work; the precise values are
expected to be hand-tuned by the user with the overlay.

## 8. Files

**Created**
- `components/casting/player/CastTrickplayBubble.tsx` — shared trickplay/time bubble.

**Modified**
- `components/casting/player/CastPlayerProgressBar.tsx` — use `CastTrickplayBubble`,
  set `bubbleWidth`, drop the manual positioning, plain-text time, sane `panHitSlop`.
- `components/casting/CastingMiniPlayer.tsx` — same bubble fix; add the stop button.
- `app/(auth)/casting-player.tsx` — the `DEBUG_TOUCH_ZONES` overlay.

## 9. Testing

This is UI work with no pure logic to unit-test. Verification is `bun run typecheck`
and manual testing on the Android emulator:
- Trickplay preview at the far-left and far-right of the bar — never truncated,
  tracks the cursor.
- Time text reads clearly above the cursor.
- Mini-player stop button stops playback and hides the mini-player.
- With `DEBUG_TOUCH_ZONES` on, the touch zones are visible and `panHitSlop` can be
  calibrated so the 4 buttons are reliably tappable.

## 10. Success criteria

- The trickplay window is never clipped at the screen edges and follows the cursor.
- The time indicator is unobtrusive plain text above the cursor.
- The 4 episode-row buttons are reliably tappable (no slider-slop overlap).
- The mini-player has a working stop button.
- The duplicated `renderBubble` code exists in exactly one place.
- `bun run typecheck` passes.

## 11. Risks

- `bubbleWidth` is a single value but the bubble has two sizes (trickplay tile vs
  time text); it is set dynamically per render, which the slider supports.
- The debug overlay must be genuinely inert in release builds — the `__DEV__` gate
  plus the default-`false` constant ensures it neither renders nor ships active.

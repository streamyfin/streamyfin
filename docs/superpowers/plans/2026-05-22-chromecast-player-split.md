# Chromecast Player Split — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decompose the 1428-line `app/(auth)/casting-player.tsx` god-component into 4 hooks + 6 presentational components + a thin orchestrator, with zero behaviour change.

**Architecture:** Each task extracts one JSX section into a presentational component (`components/casting/player/`) or one logic cluster into a hook (`hooks/`), then rewires `casting-player.tsx` to use it. Purely mechanical — moved code, not new code. State flows orchestrator → components by typed props.

**Tech Stack:** TypeScript (strict), React Native / Expo, `react-native-google-cast`, `react-native-reanimated`, `react-native-gesture-handler`.

**Spec:** `docs/superpowers/specs/2026-05-22-chromecast-player-split-design.md`

**Environment note:** Windows checkout, `core.autocrlf=true` — project-wide `bun run check` reports ~124 pre-existing CRLF errors unrelated to this work. The gate is `bun run typecheck` (fully green) plus Biome on the files each task edits.

---

## Hard rules for every task

1. **Zero behaviour change.** This is a mechanical extraction. Move code; do not rewrite logic, rename behaviour, fix bugs, or "improve" anything. Known issues stay untouched (they belong to a later UX sub-project).
2. **Read `app/(auth)/casting-player.tsx` first.** It is large (~1400 lines). Locate the section by the quoted `{/* comment */}` anchor, not line numbers.
3. **Derive interfaces from real usage.** A component's props = exactly the values the extracted JSX references from the surrounding scope (state, derived values, handlers). A hook's return = exactly the values the rest of `casting-player.tsx` still needs. Type every prop / return field explicitly — no `any`.
4. **`bun run typecheck` must be fully green** before each commit. It is the safety net that catches a missed prop or broken wiring.
5. Preserve imports: when a section moves out, move its imports too; remove imports from `casting-player.tsx` that it no longer uses.

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `components/casting/player/CastPlayerHeader.tsx` | Dismiss chevron, connection indicator, settings button | 1 |
| `components/casting/player/CastPlayerTitle.tsx` | Title + episode/season info | 1 |
| `components/casting/player/CastPlayerPoster.tsx` | Poster image, buffering overlay, skip intro/credits bar | 2 |
| `components/casting/player/CastPlayerEpisodeControls.tsx` | 4-button row (Episodes / Previous / Next / Stop) | 3 |
| `components/casting/player/CastPlayerProgressBar.tsx` | Slider, trickplay preview, time display | 4 |
| `components/casting/player/CastPlayerTransportControls.tsx` | Rewind / play-pause / forward | 5 |
| `hooks/useCastPlayerItem.ts` | `fetchedItem` + fetch + `currentItem` derivation | 6 |
| `hooks/useCastEpisodes.ts` | `episodes`/`nextEpisode`/`seasonData` + fetches + `loadEpisode` | 7 |
| `hooks/useCastDismissGesture.ts` | dismiss gesture / animated style | 8 |
| `hooks/useCastPlayerProgress.ts` | slider, scrubbing, live progress, trickplay | 9 |
| `app/(auth)/casting-player.tsx` | Thin orchestrator | all |

Tasks 1-5 extract components (the orchestrator keeps all logic, just renders `<X/>`).
Tasks 6-9 extract hooks. Task 10 finalises and verifies.

---

## Task 1: Extract `CastPlayerHeader` and `CastPlayerTitle`

**Files:**
- Create: `components/casting/player/CastPlayerHeader.tsx`, `components/casting/player/CastPlayerTitle.tsx`
- Modify: `app/(auth)/casting-player.tsx`

- [ ] **Step 1: Create `CastPlayerHeader.tsx`**

In `casting-player.tsx`, locate the JSX under `{/* Header - Fixed at top */}` (the `<View>` containing the dismiss `Pressable` with the `chevron-down` icon, the connection-indicator `Pressable`, and the settings-button `Pressable` with `settings-outline`).

Create `components/casting/player/CastPlayerHeader.tsx` as a presentational component containing exactly that JSX. Define a `CastPlayerHeaderProps` interface for every value the JSX references from the outer scope — e.g. the dismiss handler, the connection state / device name shown in the indicator, the connection-indicator press handler, the settings press handler, and any style insets. Type each explicitly. Move the icon/`Text`/`Pressable` imports the component needs.

- [ ] **Step 2: Create `CastPlayerTitle.tsx`**

Locate the JSX under `{/* Title Area */}` (the `<View>` with the title `Text` and the grey episode/season info `Text`). Create `components/casting/player/CastPlayerTitle.tsx` the same way — a `CastPlayerTitleProps` interface for exactly what it references (title string, episode/season info string or the item fields it derives them from — keep the derivation identical to the original).

- [ ] **Step 3: Rewire `casting-player.tsx`**

Replace the `{/* Header - Fixed at top */}` block with `<CastPlayerHeader ... />` and the `{/* Title Area */}` block with `<CastPlayerTitle ... />`, passing the props. Add the two imports. Remove now-unused imports from `casting-player.tsx`.

- [ ] **Step 4: Verify**

Run: `bun run typecheck`
Expected: PASS — fully green.

Run: `bunx biome check components/casting/player/CastPlayerHeader.tsx components/casting/player/CastPlayerTitle.tsx "app/(auth)/casting-player.tsx"`
Expected: PASS on these files.

- [ ] **Step 5: Commit**

```bash
git add components/casting/player/ "app/(auth)/casting-player.tsx"
git commit -m "refactor(casting): extract CastPlayerHeader and CastPlayerTitle"
```

---

## Task 2: Extract `CastPlayerPoster`

**Files:**
- Create: `components/casting/player/CastPlayerPoster.tsx`
- Modify: `app/(auth)/casting-player.tsx`

- [ ] **Step 1: Create the component**

Locate the JSX under `{/* Poster with buffering overlay */}` (inside the scrollable content area) — the poster `Image`, the empty-poster fallback `View` with the `film-outline` icon, the `{/* Skip intro/credits bar */}` block, and the `{/* Buffering overlay */}` block with the `ActivityIndicator`.

Create `components/casting/player/CastPlayerPoster.tsx` containing that JSX. Define `CastPlayerPosterProps` for everything it references: the poster URL, buffering state, the skip-segment data and skip handlers, the translation function if used, etc. Type each field. Move the imports it needs.

- [ ] **Step 2: Rewire**

Replace the poster block in `casting-player.tsx` with `<CastPlayerPoster ... />`. Add the import; drop unused imports.

- [ ] **Step 3: Verify**

Run: `bun run typecheck`
Expected: PASS — fully green.

Run: `bunx biome check components/casting/player/CastPlayerPoster.tsx "app/(auth)/casting-player.tsx"`
Expected: PASS on these files.

- [ ] **Step 4: Commit**

```bash
git add components/casting/player/CastPlayerPoster.tsx "app/(auth)/casting-player.tsx"
git commit -m "refactor(casting): extract CastPlayerPoster"
```

---

## Task 3: Extract `CastPlayerEpisodeControls`

**Files:**
- Create: `components/casting/player/CastPlayerEpisodeControls.tsx`
- Modify: `app/(auth)/casting-player.tsx`

- [ ] **Step 1: Create the component**

Locate the JSX under `{/* Fixed 4-button control row for episodes - positioned independently */}` — the `<View>` with the four `Pressable`s: Episodes (`list` icon), Previous episode (`play-skip-back`), Next episode (`play-skip-forward`), Stop (`stop-circle`).

Create `components/casting/player/CastPlayerEpisodeControls.tsx` with that JSX. Define `CastPlayerEpisodeControlsProps` for each button's press handler and each button's enabled/visible condition exactly as the original computes it (e.g. whether a previous/next episode exists). Keep the conditions identical. Move the imports.

- [ ] **Step 2: Rewire**

Replace the 4-button block in `casting-player.tsx` with `<CastPlayerEpisodeControls ... />`. Add the import; drop unused imports.

- [ ] **Step 3: Verify**

Run: `bun run typecheck`
Expected: PASS — fully green.

Run: `bunx biome check components/casting/player/CastPlayerEpisodeControls.tsx "app/(auth)/casting-player.tsx"`
Expected: PASS on these files.

- [ ] **Step 4: Commit**

```bash
git add components/casting/player/CastPlayerEpisodeControls.tsx "app/(auth)/casting-player.tsx"
git commit -m "refactor(casting): extract CastPlayerEpisodeControls"
```

---

## Task 4: Extract `CastPlayerProgressBar`

**Files:**
- Create: `components/casting/player/CastPlayerProgressBar.tsx`
- Modify: `app/(auth)/casting-player.tsx`

- [ ] **Step 1: Create the component**

Locate the JSX under `{/* Progress slider with trickplay preview */}` and the adjacent `{/* Time display */}` block (both inside `{/* Fixed bottom controls area */}`). This includes the `<Slider>` with its trickplay-preview render callback and the two time `Text`s.

Create `components/casting/player/CastPlayerProgressBar.tsx` with that JSX. Define `CastPlayerProgressBarProps` for everything it references: the slider shared values, the scrub handlers, the trickplay URL/time/info, the formatted current/end time strings (or the values they derive from), `protocolColor`, etc. Type each field. Move the imports (`Slider`, reanimated, `Image`, `Text`, …).

> The slider passes `react-native-reanimated` shared values. They pass through props unchanged — keep their types (`SharedValue<number>`).

- [ ] **Step 2: Rewire**

Replace the progress-slider + time-display JSX in `casting-player.tsx` with `<CastPlayerProgressBar ... />` (keep it inside the bottom-controls `<View>`). Add the import; drop unused imports.

- [ ] **Step 3: Verify**

Run: `bun run typecheck`
Expected: PASS — fully green.

Run: `bunx biome check components/casting/player/CastPlayerProgressBar.tsx "app/(auth)/casting-player.tsx"`
Expected: PASS on these files.

- [ ] **Step 4: Commit**

```bash
git add components/casting/player/CastPlayerProgressBar.tsx "app/(auth)/casting-player.tsx"
git commit -m "refactor(casting): extract CastPlayerProgressBar"
```

---

## Task 5: Extract `CastPlayerTransportControls`

**Files:**
- Create: `components/casting/player/CastPlayerTransportControls.tsx`
- Modify: `app/(auth)/casting-player.tsx`

- [ ] **Step 1: Create the component**

Locate the JSX under `{/* Playback controls */}` — the `<View>` with the Rewind `Pressable`, the Play/Pause `Pressable`, and the Forward `Pressable` (the rewind/forward show the configured skip seconds).

Create `components/casting/player/CastPlayerTransportControls.tsx` with that JSX. Define `CastPlayerTransportControlsProps` for: the play/pause state, the play/pause handler, the rewind/forward handlers, the rewind/forward skip-second values shown on the buttons. Type each. Move the imports.

- [ ] **Step 2: Rewire**

Replace the playback-controls block in `casting-player.tsx` with `<CastPlayerTransportControls ... />`. Add the import; drop unused imports.

- [ ] **Step 3: Verify**

Run: `bun run typecheck`
Expected: PASS — fully green.

Run: `bunx biome check components/casting/player/CastPlayerTransportControls.tsx "app/(auth)/casting-player.tsx"`
Expected: PASS on these files.

- [ ] **Step 4: Commit**

```bash
git add components/casting/player/CastPlayerTransportControls.tsx "app/(auth)/casting-player.tsx"
git commit -m "refactor(casting): extract CastPlayerTransportControls"
```

---

## Task 6: Extract `useCastPlayerItem`

**Files:**
- Create: `hooks/useCastPlayerItem.ts`
- Modify: `app/(auth)/casting-player.tsx`

- [ ] **Step 1: Create the hook**

In `casting-player.tsx`, identify: the `fetchedItem` `useState`, the `useEffect` that fetches the full item from the Jellyfin API into `fetchedItem`, and the `currentItem` `useMemo` (which derives the effective item from `fetchedItem` and the cast `customData`).

Create `hooks/useCastPlayerItem.ts` exporting `useCastPlayerItem`. Move that state, effect, and memo into it. The hook takes whatever inputs those blocks reference (e.g. `api`, `user`, `mediaStatus`, the route params) as parameters, and returns `{ fetchedItem, currentItem }`. Keep the fetch logic and the derivation byte-for-byte identical.

- [ ] **Step 2: Rewire**

In `casting-player.tsx`, replace the moved `useState` / `useEffect` / `useMemo` with `const { fetchedItem, currentItem } = useCastPlayerItem({ ... });`. Add the import; drop now-unused imports.

- [ ] **Step 3: Verify**

Run: `bun run typecheck`
Expected: PASS — fully green.

Run: `bunx biome check hooks/useCastPlayerItem.ts "app/(auth)/casting-player.tsx"`
Expected: PASS on these files.

- [ ] **Step 4: Commit**

```bash
git add hooks/useCastPlayerItem.ts "app/(auth)/casting-player.tsx"
git commit -m "refactor(casting): extract useCastPlayerItem hook"
```

---

## Task 7: Extract `useCastEpisodes`

**Files:**
- Create: `hooks/useCastEpisodes.ts`
- Modify: `app/(auth)/casting-player.tsx`

- [ ] **Step 1: Create the hook**

Identify in `casting-player.tsx`: the `episodes`, `nextEpisode`, and `seasonData` `useState`s; the `useEffect`(s) that fetch the season / episode list; and the `loadEpisode` `useCallback`.

Create `hooks/useCastEpisodes.ts` exporting `useCastEpisodes`. Move that state, those effects, and `loadEpisode` into it. The hook takes the inputs they reference (`api`, `user`, `currentItem`, `remoteMediaClient`, `castDevice`, `settings`, …) as parameters and returns `{ episodes, nextEpisode, seasonData, loadEpisode }`. Keep all logic identical, including the `loadEpisode` body.

- [ ] **Step 2: Rewire**

Replace the moved declarations with `const { episodes, nextEpisode, seasonData, loadEpisode } = useCastEpisodes({ ... });`. Add the import; drop unused imports.

- [ ] **Step 3: Verify**

Run: `bun run typecheck`
Expected: PASS — fully green.

Run: `bunx biome check hooks/useCastEpisodes.ts "app/(auth)/casting-player.tsx"`
Expected: PASS on these files.

- [ ] **Step 4: Commit**

```bash
git add hooks/useCastEpisodes.ts "app/(auth)/casting-player.tsx"
git commit -m "refactor(casting): extract useCastEpisodes hook"
```

---

## Task 8: Extract `useCastDismissGesture`

**Files:**
- Create: `hooks/useCastDismissGesture.ts`
- Modify: `app/(auth)/casting-player.tsx`

- [ ] **Step 1: Create the hook**

Identify in `casting-player.tsx`: the `translateY` and `context` shared values, the `dismissModal` `useCallback`, the `panGesture` (`Gesture.Pan()...`), and the `animatedStyle` (`useAnimatedStyle`).

Create `hooks/useCastDismissGesture.ts` exporting `useCastDismissGesture`. Move those into it. The hook takes whatever the dismiss logic references (e.g. the navigation/router used to close the screen) as parameters and returns `{ panGesture, animatedStyle, dismissModal }`. Keep the gesture thresholds and animation logic identical.

- [ ] **Step 2: Rewire**

Replace the moved declarations with `const { panGesture, animatedStyle, dismissModal } = useCastDismissGesture({ ... });`. Add the import; drop unused imports.

- [ ] **Step 3: Verify**

Run: `bun run typecheck`
Expected: PASS — fully green.

Run: `bunx biome check hooks/useCastDismissGesture.ts "app/(auth)/casting-player.tsx"`
Expected: PASS on these files.

- [ ] **Step 4: Commit**

```bash
git add hooks/useCastDismissGesture.ts "app/(auth)/casting-player.tsx"
git commit -m "refactor(casting): extract useCastDismissGesture hook"
```

---

## Task 9: Extract `useCastPlayerProgress`

**Files:**
- Create: `hooks/useCastPlayerProgress.ts`
- Modify: `app/(auth)/casting-player.tsx`

> This is the most intricate extraction — reanimated shared values, timing refs,
> the live-progress interpolation, scrubbing, and the `useTrickplay` integration.
> Move it as one cohesive cluster; do not split or simplify it.

- [ ] **Step 1: Create the hook**

Identify in `casting-player.tsx` the progress/slider cluster: the `sliderProgress` / `sliderMin` / `sliderMax` shared values; the `isScrubbing` ref; the `trickplayTime` and `scrubPercentage` state; the `liveProgress` state with `lastSyncPositionRef` / `lastSyncTimestampRef`; the `resumePositionRef`; the effects that sync `liveProgress` from `mediaStatus` and update the refs; the `useTrickplay(...)` call; and any scrub-start/move/end handlers.

Create `hooks/useCastPlayerProgress.ts` exporting `useCastPlayerProgress`. Move that whole cluster in. The hook takes the inputs the cluster references (`mediaStatus`, `duration`, the trickplay inputs, …) as parameters and returns everything the JSX and the rest of the orchestrator still need — e.g. `{ sliderProgress, sliderMin, sliderMax, isScrubbing, trickplayTime, scrubPercentage, progress, liveProgress, resumePositionRef, trickPlayUrl, calculateTrickplayUrl, trickplayInfo, ...scrub handlers }`. Keep every effect, ref, and computation byte-for-byte identical and in the same order.

- [ ] **Step 2: Rewire**

Replace the moved cluster with `const { ... } = useCastPlayerProgress({ ... });`. The `CastPlayerProgressBar` component (Task 4) and `reloadWithSelection` consume these values — make sure they still receive them. Add the import; drop unused imports.

- [ ] **Step 3: Verify**

Run: `bun run typecheck`
Expected: PASS — fully green.

Run: `bun test utils/casting/`
Expected: PASS — all suites pass (the pure-logic suites are unaffected).

Run: `bunx biome check hooks/useCastPlayerProgress.ts "app/(auth)/casting-player.tsx"`
Expected: PASS on these files.

- [ ] **Step 4: Commit**

```bash
git add hooks/useCastPlayerProgress.ts "app/(auth)/casting-player.tsx"
git commit -m "refactor(casting): extract useCastPlayerProgress hook"
```

---

## Task 10: Finalise the orchestrator

**Files:**
- Modify: `app/(auth)/casting-player.tsx`

- [ ] **Step 1: Clean up**

`casting-player.tsx` should now be a thin orchestrator: hook calls, a small amount of wiring, and the JSX tree composing the 6 new components plus the 3 modal components (`ChromecastDeviceSheet`, `ChromecastEpisodeList`, `ChromecastSettingsMenu`) inside the `GestureDetector` / `Animated.View`.

Read the whole file. Remove any now-dead code: unused imports, leftover variables, commented-out fragments, intermediate values that are no longer referenced. Do not change behaviour — only delete what is provably unused.

- [ ] **Step 2: Verify**

Run: `bun run typecheck`
Expected: PASS — fully green.

Run: `bun test utils/casting/`
Expected: PASS.

Run: `bunx biome check "app/(auth)/casting-player.tsx"`
Expected: PASS.

Confirm `casting-player.tsx` is in the ~150-250 line range and contains no large inline JSX section or logic cluster.

- [ ] **Step 3: Commit**

```bash
git add "app/(auth)/casting-player.tsx"
git commit -m "refactor(casting): finalise casting-player orchestrator"
```

---

## Final verification

- [ ] **Checks**

Run: `bun run typecheck` → PASS.
Run: `bun test utils/casting/` → PASS.

- [ ] **Manual re-test** (behaviour must be identical to before the split)

Cast a movie and an episode to the Chromecast. Verify: playback starts; the header / title / poster render; the 4 episode buttons work; audio / subtitle / quality / version switching still works; episode navigation works; the progress slider scrubs and shows trickplay; play/pause/rewind/forward work; the buffering overlay appears; swiping down dismisses the player. Nothing should behave differently from before sub-project C.

---

## Notes for the implementer

- Line numbers drift across tasks — always Read the file and match on the quoted `{/* comment */}` anchors.
- This is a refactor: there is no new behaviour to unit-test. `bun run typecheck` per task is the safety net; the final manual re-test is the behavioural check.
- If extracting a section reveals it is entangled with another (a shared variable that does not cleanly belong to one unit), keep that variable in the orchestrator and pass it as a prop / hook argument — do not duplicate it.
- Out of scope: the trickplay truncation bug, the progress-bar touch-overlap bug, the time-label position, mini-player changes, the `loadEpisode`/`currentItem` race. Do not fix them here — they belong to the later UX sub-project.

# Chromecast Player Split — Design

**Date:** 2026-05-22
**Branch:** `refactor-chromecast` (PR #1402)
**Sub-project:** C of the Chromecast refactor
**Status:** Approved design — pending implementation plan

---

## 1. Problem

`app/(auth)/casting-player.tsx` is a 1428-line god-component. One file owns: cast SDK
hooks, item fetching, live-progress tracking, slider/scrubbing, trickplay, track
selection, episode/season fetching, segment skipping, the dismiss gesture, and ~780
lines of JSX. It is hard to read, hard to change safely, and every sub-project so far
has had to navigate it.

## 2. Scope

**In scope:** a purely structural decomposition of `casting-player.tsx` into 4 custom
hooks, 6 presentational components, and a thin orchestrator.

**Out of scope — and a hard constraint:** **zero behaviour change.** This is a
mechanical extraction. No bug fixes, no feature changes, no logic edits. Known issues
in this code (the `loadEpisode` / `currentItem` race from sub-project A's review; the
trickplay window truncation, the progress-bar touch overlap, the time-label position)
are explicitly NOT touched here — they belong to a later UX sub-project, and are
easier to fix once the code lives in small focused files.

## 3. Architecture

`casting-player.tsx` becomes an orchestrator (~150-200 lines): it calls the hooks,
assembles the data, and renders the 6 components plus the 3 existing modal components.

State flows orchestrator → components by **props** (approved approach 1) — no React
context. Presentational components take typed props; all logic lives in hooks.

## 4. Hooks (`hooks/`)

| Hook | Extracts | Returns (shape) |
|---|---|---|
| `useCastPlayerItem` | `fetchedItem` state, its fetch effect, the `currentItem` derivation | `{ fetchedItem, currentItem }` |
| `useCastPlayerProgress` | slider shared values, `isScrubbing`, `trickplayTime`, `scrubPercentage`, `liveProgress`, the sync refs/effects, the `useTrickplay` call | slider state, scrub handlers, `progress`, trickplay data |
| `useCastEpisodes` | `episodes` / `nextEpisode` / `seasonData` state, their fetch effects, `loadEpisode` | `{ episodes, nextEpisode, seasonData, loadEpisode }` |
| `useCastDismissGesture` | `translateY`, `context`, `panGesture`, `dismissModal`, `animatedStyle` | `{ panGesture, animatedStyle, dismissModal }` |

Existing hooks are reused unchanged: `useCasting`, `useCastSelection`,
`useChromecastSegments`, `useTrickplay` (the latter called inside
`useCastPlayerProgress`).

`useCastPlayerProgress` is the most intricate hook (shared values, refs, the
live-progress interpolation) — it must be extracted with care and reviewed closely.

## 5. Components (`components/casting/player/`)

| Component | Extracts (JSX section) |
|---|---|
| `CastPlayerHeader` | dismiss chevron, connection indicator, settings button |
| `CastPlayerTitle` | title + episode/season info |
| `CastPlayerPoster` | poster image, buffering overlay, skip intro/credits bar |
| `CastPlayerEpisodeControls` | the 4-button row (Episodes / Previous / Next / Stop) |
| `CastPlayerProgressBar` | slider, trickplay preview, time display |
| `CastPlayerTransportControls` | rewind / play-pause / forward |

Each is a pure presentational component with typed props. The 3 modal components
(`ChromecastDeviceSheet`, `ChromecastEpisodeList`, `ChromecastSettingsMenu`) already
exist and stay as-is — the orchestrator keeps rendering them.

## 6. Constraints

- **Mechanical extraction only.** Each component's / hook's props and returns mirror
  exactly what the inline code used. No new logic, no renamed behaviour, no fixes.
- Component prop interfaces are derived from what the extracted JSX references in the
  original component scope.
- Follow existing repo conventions: hooks flat in `hooks/`; the new components grouped
  under `components/casting/player/`.

## 7. Verification

The casting UI has no unit tests (consistent with the rest of the casting UI — it is
React Native / SDK-heavy). Verification is:

- `bun run typecheck` — green after every task (catches wiring/prop errors).
- `bun test utils/casting/` — stays green (the pure-logic suites are untouched).
- A full **manual re-test** of the cast player after the split: cast a movie and an
  episode, switch audio / subtitle / quality / version, navigate episodes, scrub the
  progress bar, trigger trickplay, dismiss the player. Behaviour must be identical to
  before the split.

## 8. Files

**Created:**
- `hooks/useCastPlayerItem.ts`, `hooks/useCastPlayerProgress.ts`,
  `hooks/useCastEpisodes.ts`, `hooks/useCastDismissGesture.ts`
- `components/casting/player/CastPlayerHeader.tsx`, `CastPlayerTitle.tsx`,
  `CastPlayerPoster.tsx`, `CastPlayerEpisodeControls.tsx`,
  `CastPlayerProgressBar.tsx`, `CastPlayerTransportControls.tsx`

**Modified:**
- `app/(auth)/casting-player.tsx` → thin orchestrator.

## 9. Success criteria

- `casting-player.tsx` is ~150-200 lines and contains no inline logic clusters or
  large JSX sections — only hook calls and component composition.
- Each new file has one clear responsibility and a typed interface.
- `bun run typecheck` and `bun test utils/casting/` pass.
- The manual re-test shows behaviour identical to before the split.

## 10. Risks

- The hooks share state (progress feeds the slider, the time display, and segment
  skipping). The extraction must preserve the exact data flow and effect ordering.
  Mitigation: one hook / component per task, `bun run typecheck` after each, and a
  full manual re-test at the end.
- `useCastPlayerProgress` carries reanimated shared values and timing refs — the
  highest-risk extraction; its task gets the closest review.
- No unit tests guard the UI — the manual re-test is the only behavioural safety net.

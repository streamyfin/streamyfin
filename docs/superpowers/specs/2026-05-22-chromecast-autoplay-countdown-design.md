# Chromecast Autoplay & Next-Episode Countdown — Design

**Date:** 2026-05-22
**Branch:** `refactor-chromecast` (PR #1402)
**Sub-project:** Autoplay + countdown, of the Chromecast refactor
**Status:** DEFERRED — paused pending the chapters sub-project.

> This design is sound but on hold. During brainstorming it became clear the
> autoplay trigger should fire at the **Outro / credits media segment** (so the
> countdown runs over the credits, no black screen), not only at the hard
> `IDLE + FINISHED` end. That trigger builds naturally on chapter / media-segment
> work, so the **chapters sub-project is being done first**. When resuming:
> revise §3 to a two-path trigger — (a) playback enters the Outro segment when
> `skipOutro` is not `auto`, (b) `IDLE + FINISHED` as fallback — and fold §9 into
> §3. The next episode's intro is already auto-skipped by the existing
> `useSegmentSkipper` (`skipIntro`), so binge-watching needs no extra intro work.

---

## 1. Problem & goal

When an episode finishes on the Chromecast, playback stops — there is no
auto-advance to the next episode. Binge-watching requires the user to pick up the
phone and load the next episode manually.

**Goal:** when a cast episode finishes, automatically continue to the next episode,
with a cancellable countdown. This must work **whenever casting**, regardless of
which app screen the phone shows — the video is on the TV, the phone may be on the
home screen or locked.

## 2. Scope

**In scope:** detect a finished cast episode, resolve the next episode, run a
cancellable countdown, load the next episode, honour the shared autoplay settings.

**Out of scope (future evolution — see §9):** triggering the prompt at the start of
the credits/outro instead of at the hard end of the episode; a "skip credits"
button. These depend on chapter / media-segment work not yet in place.

## 3. Episode-end detection

A watcher subscribes to `useMediaStatus()` from `react-native-google-cast`.

- An episode has **finished** when `playerState === MediaPlayerState.IDLE` **and**
  `idleReason === MediaPlayerIdleReason.FINISHED`. Other idle reasons
  (`CANCELLED`, `INTERRUPTED`, `ERROR`) mean the user stopped or a failure — **no
  autoplay**.
- At the moment `IDLE` is reported, `mediaStatus.mediaInfo` is already cleared. So
  the watcher must **continuously capture the currently-playing item** (and its
  series context) while playback is active, and use that captured item when the
  `IDLE + FINISHED` transition fires.

## 4. Always-mounted watcher

Autoplay must fire regardless of the active screen, so the logic cannot live in the
casting-player screen (not always mounted) nor in `CastingMiniPlayer` (it returns
`null` — and unmounts its render — exactly when the episode ends).

- `useCastAutoplay` — a hook holding the watcher logic.
- `CastAutoplayWatcher` — a tiny component that calls `useCastAutoplay()` and
  renders `null`. It is mounted once, next to where `CastingMiniPlayer` is mounted
  in the layout, so it runs for the whole app lifetime.

On an `IDLE + FINISHED` transition the watcher: confirms the finished item is an
episode, resolves the next episode (§7), checks the settings (§6), and — if all
clear — starts the countdown (§5).

## 5. Countdown & overlay

The countdown state lives in a Jotai atom so the watcher can drive it and any
screen can render it:

```ts
// utils/atoms/castAutoplay.ts
type CastAutoplayState = {
  nextEpisode: BaseItemDto;
  secondsRemaining: number;
} | null;
```

- The watcher sets the atom to `{ nextEpisode, secondsRemaining: 30 }` and runs a
  1-second interval decrementing `secondsRemaining`.
- At `0`: the watcher loads `nextEpisode` on the cast (`loadCastMedia`), increments
  `autoPlayEpisodeCount`, and clears the atom.
- **Countdown duration: 30 seconds**, a single named constant.

**Overlay** — `CastAutoplayCountdown`, rendered inside `casting-player.tsx`. When
the atom is set it shows: the next episode's poster + title, "Next episode in
{n}s", and two buttons — **Play now** (load immediately) and **Cancel** (clear the
atom; no load). Because the overlay lives in the casting-player screen, it is
visible only when that screen is open.

When the casting-player screen is **not** open, the watcher still counts down and
loads — there is no intrusive full-screen overlay; a short toast is shown when the
next episode actually loads ("Playing next episode"). The toast fires
unconditionally (harmless when the overlay was also shown).

## 6. Settings (shared with the native player)

Reuse the existing settings in `utils/atoms/settings.ts` — no new settings:

- `autoPlayNextEpisode` (boolean, default `true`) — master on/off. When `false`,
  the watcher does nothing.
- `autoPlayEpisodeCount` (number) — running count of consecutive autoplays.
  Incremented each time the countdown completes a load.
- `maxAutoPlayEpisodeCount` (`{ key, value }`, default `3`) — when
  `autoPlayEpisodeCount >= maxAutoPlayEpisodeCount.value`, the watcher does **not**
  start a countdown (autoplay pauses; the user resumes manually). This mirrors the
  native player's "are you still watching?" gate.
- The count resets to `0` on any **manual** play — "Play now" in the overlay, or
  loading an episode from the episode list. (Manual intent restarts the streak.)

## 7. Next-episode resolution

`useCastEpisodes` already fetches a series' episodes and computes the next one, but
it is tied to the casting-player screen. Extract the reusable part — "given an
episode item, fetch its series' episodes and return the next one" — into a shared
async helper (e.g. `utils/casting/episodes.ts`). Both `useCastEpisodes` and
`useCastAutoplay` use it, so the next-episode logic exists once.

## 8. Units & files

**Created**
- `utils/atoms/castAutoplay.ts` — the countdown-state atom + the duration constant.
- `utils/casting/episodes.ts` — reusable "resolve next episode" helper.
- `hooks/useCastAutoplay.ts` — the watcher hook.
- `components/casting/CastAutoplayWatcher.tsx` — always-mounted host (renders null).
- `components/casting/player/CastAutoplayCountdown.tsx` — the countdown overlay.

**Modified**
- The layout file where `CastingMiniPlayer` is mounted — also mount
  `CastAutoplayWatcher`.
- `app/(auth)/casting-player.tsx` — render `CastAutoplayCountdown`.
- `hooks/useCastEpisodes.ts` — use the extracted `utils/casting/episodes.ts` helper.

## 9. Future evolution — credits trigger

The watcher's **trigger point** is deliberately isolated: today it is the
`IDLE + FINISHED` transition. When Jellyfin media-segment / chapter data for
"Outro" / "Credits" is exploited on the cast, the trigger should move to the
**start of the credits** — the countdown overlay appears over the still-playing
credits, with an added "skip credits" action. Only the trigger changes; the
countdown, atom, overlay, settings and load path stay as designed. The
implementation must keep the trigger detection in one clearly-separable place so
this swap is a localised change.

## 10. Testing

- Unit-test the pure logic with `bun test`: the next-episode resolution (given an
  episode list + current episode → the correct next episode, or none for the last
  episode) and the "should autoplay?" decision (settings + idle reason → start
  countdown or not).
- Manual: cast an episode, let it finish — the countdown overlay appears, counts
  from 30, and the next episode loads; "Cancel" stops it; "Play now" loads
  immediately; with the casting-player screen closed the next episode still loads;
  after `maxAutoPlayEpisodeCount` consecutive autoplays it stops.

## 11. Success criteria

- A finished cast episode auto-advances to the next, with a 30s cancellable
  countdown, regardless of the active app screen.
- Autoplay respects `autoPlayNextEpisode` and stops after `maxAutoPlayEpisodeCount`.
- `CANCELLED` / `ERROR` idle reasons never trigger autoplay.
- The next-episode resolution lives in one shared helper.
- `bun run typecheck` and `bun test` pass.

## 12. Risks

- The captured-item timing: the watcher must capture the playing item *before*
  `IDLE`. Capture it on every `mediaStatus` change while a real item is playing.
- The watcher and the casting-player screen could both react to the same media
  state — the atom is the single source of truth; only the watcher writes the
  countdown, only the overlay reads it.
- Loading the next episode requires the API/user context outside the player
  screen — `loadCastMedia` is a standalone function and the watcher can obtain
  `api` / `user` from the Jotai atoms, so this is available app-wide.

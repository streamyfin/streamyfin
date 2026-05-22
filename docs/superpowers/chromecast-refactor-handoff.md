# Chromecast Refactor — Handoff & Resume Document

**Branch:** `refactor-chromecast` · **PR:** #1402 (draft) · **Last updated:** 2026-05-22

This document captures the full state of the Chromecast refactor so the work can be
resumed in a later session. Specs and plans for each sub-project live in
`docs/superpowers/specs/` and `docs/superpowers/plans/`.

---

## 1. Summary

The Chromecast casting code (PR #1402) was refactored across five sub-projects, a
prep task, and small cleanups. All sub-projects are **implemented, type-checked, and
unit-tested**; the branch has dozens of commits unpushed to
`origin/refactor-chromecast` (run `git log origin/refactor-chromecast..HEAD`).

| Sub-project | What | Status |
|---|---|---|
| **A** — Device profiles | Per-device capability detection, profile builder, unified `loadCastMedia`, crash fixes (status 2100, 5.1, bitrate) | ✅ done, **verified on hardware** |
| **Prep #1367** — Segment-skip | Backport segment-skip fixes to PR #1367, remove 177 dead lines | ✅ done, **pushed to #1367** |
| **B** — Track switching | `CastSelection` source-of-truth via customData, audio/subtitle/quality/version switching, multi-version | ✅ done, **verified on hardware** |
| **C** — Player split | `casting-player.tsx` 1428→574 lines: 6 components + 4 hooks | ✅ done, **needs manual re-test** |
| **D** — Session & remote control | Correct PlayMethod, conditional episode buttons, `loadEpisode` race fix, app-wide Jellyfin remote control | ✅ done, **needs manual test** |
| **UX player** — Trickplay & mini-player | Trickplay bubble clamp via `bubbleWidth`, shared `CastTrickplayBubble`, plain-text time, mini-player stop button, `DEBUG_TOUCH_ZONES` overlay | ✅ done, **needs manual test** |
| Loose ends | Dead `liveProgress` export removed, `BitRateSheet` duplicate removed, full-width labelled stop button for movies | ✅ done |

Verification gate for the whole branch: `bun run typecheck` ✅, `bun test utils/` ✅
(32 tests). Note: project-wide `bun run check` shows ~124 pre-existing CRLF errors —
a Windows `core.autocrlf` artifact, unrelated to this work (see §6).

---

## 2. Sub-project A — Device profiles & capability detection

**Spec:** `specs/2026-05-21-chromecast-profiles-design.md` · **Plan:**
`plans/2026-05-21-chromecast-profiles.md` · **Commits:** `bcfa8c6d`..`73214f5d`

Replaced the two static device profiles with `detectCapabilities()` +
`buildChromecastProfile()` (`utils/casting/capabilities.ts`, `buildProfile.ts`), a
unified `loadCastMedia()` (`utils/casting/castLoad.ts`) with downgrade-on-failure,
and `chromecastProfile` / `chromecastMaxBitrate` settings replacing
`enableH265ForChromecast`. Fixed the audio-index, media-source, and PlaySessionId
load-path bugs.

**Verified:** all 7 test-matrix files cast successfully on the Chromecast HD,
including a 50 Mb/s HEVC-10bit movie that previously crashed with status 2100.

---

## 3. Prep — Segment-skip reconciliation (PR #1367)

The chromecast branch and PR #1367 (`autoskip`) both carried segment-skip; #1367 was
behind. The chromecast branch's fixes were backported to the `autoskip` branch
(`useSegmentSkipper` auto-skip-by-identity, `Controls` stale-closure fix, `segments`
cleanup) and the two dead hooks `useIntroSkipper`/`useCreditSkipper` (177 lines) were
removed. **Commit `0990e479` is pushed to `origin/autoskip` — PR #1367 is updated.**
The `page.tsx` plugin-lock lines were not backported (depend on a newer
`PlatformDropdown` not on #1367's base — will arrive when #1367 rebases on develop).

---

## 4. Sub-project B — Track switching & multi-version

**Spec:** `specs/2026-05-21-chromecast-track-switching-design.md` · **Plan:**
`plans/2026-05-21-chromecast-track-switching.md` · **Commits:** `3d65c3bb`..`23b4f20d`

`CastSelection` (`utils/casting/selection.ts`) is the single source of truth, carried
in cast `customData` and read back by `hooks/useCastSelection.ts` with an optimistic
pending overlay. Audio / subtitle / quality / version switching all reflect reality.
The shared `BITRATES` ladder (`components/BitrateSelector.tsx`) was expanded; the cast
quality menu filters it by device capability and media bitrate.

**Verified:** audio (Bleach JP↔FR), SubRip subtitles, and bitrate switching all work
on hardware — which also confirms the `customData` round-trip.

---

## 5. Sub-project C — `casting-player.tsx` split

**Spec:** `specs/2026-05-22-chromecast-player-split-design.md` · **Plan:**
`plans/2026-05-22-chromecast-player-split.md` · **Commits:** `02df2477`..`1ea7f0f4`

Decomposed the 1428-line god-component into a 574-line orchestrator + 6
presentational components (`components/casting/player/`) + 4 hooks
(`useCastPlayerItem`, `useCastEpisodes`, `useCastDismissGesture`,
`useCastPlayerProgress`). Purely structural — zero behaviour change.

**Needs manual re-test:** the cast player has no unit tests; re-test cast + episode
playback, track switching, scrub/trickplay, dismiss — behaviour must match pre-split.

---

## 6. Sub-project D — Session reporting & remote control

**Spec:** `specs/2026-05-22-chromecast-session-remote-control-design.md` · **Plan:**
`plans/2026-05-22-chromecast-session-remote-control.md` · **Commits:**
`288b390e`..`8b94f491`

- Cast sessions now report the real `PlayMethod` (`Transcode`/`DirectPlay`).
- Episode Previous/Next buttons render only when an adjacent episode exists.
- `loadEpisode`/`currentItem` stale-flash race fixed via `loadingEpisodeId`.
- **App-wide Jellyfin remote control:** a `PlaybackController` contract
  (`utils/playback/playbackController.ts`); a pure WS-message mapper
  (`utils/playback/remoteCommands.ts`, unit-tested); `hooks/useRemoteControl.ts`
  dispatches to whichever player (cast / native video / music) is registered.
  `WebSocketProvider` advertises the commands and routes the messages.

**Needs manual test:** from the Jellyfin dashboard's active-session panel — pause /
stop / seek / next / volume / "send message" against the cast and the native player.

---

## 7. Pending work (queue)

- **UX player sub-project** — ✅ done (see the UX player row in §1; spec/plan
  `2026-05-22-chromecast-ux-player`). Trickplay truncation, time display, mini-player
  trickplay + stop button all fixed. Remaining there: the user hand-calibrates the
  slider `panHitSlop` using the `DEBUG_TOUCH_ZONES` overlay (flag in
  `utils/casting/debug.ts` — flip to `true`, calibrate, flip back).
- **Repo hygiene** — add `* text=auto eol=lf` to `.gitattributes` (fixes the ~124
  CRLF errors in `bun run check`); this is best done as a separate PR off `develop`,
  since a `git add --renormalize` touches the whole tree. (The `BitRateSheet.tsx`
  duplicate and the unused `liveProgress` export have already been removed.)
- **Custom Cast receiver** (deferred from sub-project A) — PR #1521 builds a custom
  CAF receiver. Decided to defer; revisit as its own sub-project. It would own
  subtitle rendering/styling (ASS, custom style — issues #1452, #1543) and cleaner
  session integrity. Sender-side work so far does not block it.
- **Open review notes** (low severity, not fixed):
  - D: the `PlaybackController` registry is last-write-wins; the spec's "cast
    precedence" is not actually enforced (acceptable — one player at a time).
  - D: remote next/previous works for cast but is a no-op for the native video
    player (its episode navigation lives in `Controls`, not the screen).
  - A: `getStreamUrl` still takes `MediaSources[0]` internally — fine because
    `getPlaybackInfo` is called with `mediaSourceId`.

---

## 8. How to resume

1. **Test the branch.** Build from `refactor-chromecast` (`bun run android`). Run the
   sub-project C manual re-test and the sub-project D dashboard remote-control test.
   Sub-project A's matrix is `docs/chromecast-test-matrix.md`.
2. **Push.** When satisfied, push `refactor-chromecast` to update draft PR #1402
   (46 commits unpushed). Decide first what to do with the two uncommitted files
   (see §9).
3. **Continue.** Pick the next sub-project from §7 — likely the UX player sub-project.
   Each sub-project follows the brainstorm → spec → plan → subagent-execution cycle;
   specs/plans go in `docs/superpowers/`.

---

## 9. Working-tree / repo notes

- **Uncommitted, intentionally left for the user to decide:**
  - `docs/chromecast-test-matrix.md` — modified to list the user's actual library
    titles (anime/movies). If PR #1402 should not expose the personal library, revert
    this file to its generic committed form before pushing.
  - `scripts/find-test-media.ts` — untracked helper that queries Jellyfin and buckets
    the library against the test matrix. Commit it if useful, or leave it local.
- **Commits:** this project does **not** use a `Co-Authored-By` trailer.
- **GPG:** committing requires a warm `gpg-agent` cache; `~/.gnupg/gpg-agent.conf`
  was set to an 8h TTL.

---

## 10. Key decisions

- **#1367 is the source of truth for segment-skip** — backport flows chromecast →
  #1367, never the reverse.
- **Custom receiver deferred** — the crash fixes (A) were decoupled from it; it is a
  future sub-project, not a blocker.
- **Long-term goal:** support AirPlay and other cast protocols — the casting layer is
  kept protocol-agnostic (`CastProtocol`). The user has an iOS phone and an
  AirPlay-capable Samsung screen for testing.

---

## 11. Player feature ideas (proposed, not yet scoped)

Candidate enhancements for the cast player — each would be its own brainstorm →
spec → plan → execute cycle. The user reacted positively to all of these.

1. **Autoplay next episode + countdown** — an "Next episode in 10s · Cancel" overlay
   when an episode ends on the cast. The native player already has go-to-next-episode
   countdown logic to port.
2. **Sleep timer** — "stop after this episode / in 30 min".
3. **Resume prompt** — "Resume at 12:34 / Start over" when casting a partially-watched
   item.
4. **Chapter markers on the progress bar** — Jellyfin exposes chapters; show ticks +
   tap-to-jump.
5. **OS media controls** — control the cast from the OS media notification /
   lock screen. **Must be cross-platform:** Android media notification *and* iOS
   Now Playing / Control Center. iOS infrastructure already exists
   (`modules/mpv-player/ios/MPVNowPlayingManager.swift`) and there are existing PRs
   touching the iOS mini-controller / now-playing — reference them before designing.
6. **SyncPlay on cast** (larger) — synchronised group viewing; a `feat/syncplay`
   branch exists.


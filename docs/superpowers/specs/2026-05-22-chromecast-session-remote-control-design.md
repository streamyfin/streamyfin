# Casting Session Reporting & Remote Control — Design

**Date:** 2026-05-22
**Branch:** `refactor-chromecast` (PR #1402)
**Sub-project:** D of the Chromecast refactor
**Status:** Approved design — pending implementation plan

---

## 1. Problem

Three issues plus one missing feature:

- **PlayMethod is wrong.** `useCasting.ts` reports a hardcoded `PlayMethod:
  "DirectStream"` for every cast session. When the cast stream is a transcode
  (almost always, given a HEVC-heavy library), the Jellyfin dashboard still labels
  it "direct-play". The dashboard only reflects what the app reports.
- **Episode buttons are unconditional.** The Previous / Next buttons in the cast
  player are always shown and active, even when there is no adjacent episode.
- **`loadEpisode` / `currentItem` race.** During an episode change, `currentItem`
  (derived from cast `customData`) briefly still points at the previous episode
  while the new one loads — flagged in sub-project B's review.
- **Remote control does not exist.** `WebSocketProvider` advertises
  `SupportedCommands: ["Play"]` and handles only the `Play` WebSocket message. The
  Jellyfin dashboard's remote-control panel (pause / stop / seek / message) sends
  `Playstate` and `GeneralCommand` messages the app ignores — for the native player
  too, not just casting. The panel does nothing because the feature was never built.

## 2. Scope

**In scope**

- Report the correct `PlayMethod` (`Transcode` vs `DirectPlay`) for cast sessions.
- Show / hide the Previous / Next episode buttons based on adjacent-episode
  availability.
- Fix the `loadEpisode` / `currentItem` stale-window race.
- Implement app-wide Jellyfin remote control: handle `Playstate` and
  `GeneralCommand` WebSocket messages (transport + volume + DisplayMessage), routed
  to whichever player is active — cast, native video, or music.

**Out of scope**

- Track-switching remote commands (`SetAudioStreamIndex` / `SetSubtitleStreamIndex`).
- The custom Cast receiver.

## 3. The `PlaybackController` contract

The app has no unified playback-control abstraction — `usePlaybackManager` only does
progress reporting and metadata. Remote control needs one. Introduce a single
interface — the canonical control surface every player implements:

```ts
export interface PlaybackController {
  playPause(): void;
  pause(): void;
  unpause(): void;
  stop(): void;
  /** Absolute seek position in milliseconds. */
  seek(positionMs: number): void;
  next(): void;
  previous(): void;
  /** Volume 0–1. */
  setVolume(level: number): void;
  toggleMute(): void;
}
```

A Jotai atom holds the currently-active controller:

```ts
export const activePlaybackControllerAtom = atom<PlaybackController | null>(null);
```

This is not duplicated code — each player *implements* the same small contract; the
cast already has every method in `useCasting`.

## 4. Registration

Each playback source registers its controller into the atom when it becomes the
active playback, and clears it when it stops:

- **Cast** — a controller built from `useCasting` (`togglePlayPause`, `pause`,
  `play`, `stop`, `seek`, `setVolume`) plus episode `next` / `previous`. Registered
  while a cast session is playing; cleared on disconnect.
- **Native video player** — `app/(auth)/player/direct-player.tsx` registers a
  controller wrapping its player controls on mount; clears on unmount.
- **Music** — `MusicPlayerProvider` registers a controller while music plays.

**Priority:** a cast session takes precedence (if you are casting, the dashboard
controls the cast); then the native video player; then music. In practice only one
plays at a time, so registration is effectively last-active-wins with cast given
precedence.

## 5. WebSocket remote-control handler

A dedicated hook `useRemoteControl`, consumed by `WebSocketProvider`, handles the
incoming messages:

- `Playstate` — map `Data.Command` to the active controller:
  `PlayPause`/`Pause`/`Unpause`/`Stop`, `Seek` (uses `Data.SeekPositionTicks`),
  `NextTrack`/`PreviousTrack` → `next`/`previous`.
- `GeneralCommand` — `Data.Name`: `SetVolume` (→ `setVolume`, from
  `Data.Arguments.Volume`), `ToggleMute`/`Mute`/`Unmute` (→ `toggleMute`),
  `DisplayMessage` → an in-app toast via `sonner-native` (no controller involved).
- The existing `Play` handling is preserved unchanged.
- If no controller is registered, transport/volume commands are ignored;
  `DisplayMessage` and `Play` still work.

The string→action mapping is a pure function, unit-tested.

## 6. Capabilities

`WebSocketProvider.postFullCapabilities` currently sends `SupportedCommands:
["Play"]`. Expand it to the `GeneralCommandType` values actually handled —
`["DisplayMessage", "SetVolume", "ToggleMute", "Mute", "Unmute"]` (plus `Play`).
`SupportsMediaControl: true` is already set, which is what enables the dashboard to
send `Playstate` commands.

## 7. Small fixes

- **PlayMethod.** `loadCastMedia` already knows whether the resolved stream is a
  transcode (`getStreamUrl`'s media source carries a `TranscodingUrl`). Embed a
  `playMethod: "Transcode" | "DirectPlay"` in the cast `customData` — the same
  pattern as `playSessionId` and `selection` from sub-projects A and B. `useCasting`
  reads it and reports it in `reportPlaybackStart` / `reportPlaybackProgress`
  instead of the hardcoded `"DirectStream"`.
- **Conditional episode buttons.** `CastPlayerEpisodeControls` already receives
  `episodes` and `nextEpisode`. Hide (or disable) Previous when the current item is
  the first episode, and Next when there is no next episode.
- **`loadEpisode` race.** While an episode load is in flight, guard against acting
  on a stale `currentItem`: track the loading episode id and treat `currentItem` as
  pending until the cast `customData` reflects the new episode.

## 8. Files

**Created**
- `utils/playback/playbackController.ts` — the `PlaybackController` interface and
  `activePlaybackControllerAtom`.
- `hooks/useRemoteControl.ts` — the WebSocket remote-control message handler.

**Modified**
- `providers/WebSocketProvider.tsx` — consume `useRemoteControl`; expand
  `SupportedCommands`.
- `hooks/useCasting.ts` — report the real `PlayMethod`.
- `utils/casting/castLoad.ts`, `utils/casting/mediaInfo.ts` — embed `playMethod` in
  `customData`.
- `components/casting/player/CastPlayerEpisodeControls.tsx` — conditional buttons.
- `app/(auth)/casting-player.tsx` — register the cast `PlaybackController`; fix the
  `loadEpisode` race.
- `app/(auth)/player/direct-player.tsx` — register the native-video controller.
- `providers/MusicPlayerProvider.tsx` — register the music controller.

## 9. Testing

Unit-testable with `bun test`:
- The remote-command mapping (WS `Command` / `Name` string → controller action).

Routing, registration, capabilities, and the `DisplayMessage` toast are verified by
`bun run typecheck` and manual testing (drive the cast and native player from the
Jellyfin dashboard's remote-control panel).

## 10. Success criteria

- The Jellyfin dashboard shows `Transcode` for a transcoded cast session.
- The dashboard remote panel's pause / stop / seek / next / previous / volume
  buttons control the active player (cast or native).
- A dashboard "Send message" appears as an in-app toast.
- Previous / Next cast buttons are hidden or disabled when no adjacent episode
  exists.
- Changing episode no longer briefly shows the previous episode's data.
- `bun run typecheck` and `bun test utils/` pass.

## 11. Risks

- The native video player is screen-scoped; its controller is only registered while
  the player screen is mounted. Remote commands arriving when no player is open are
  correctly ignored — this is intended, not a bug.
- Multiple sources playing at once (e.g. music plus an idle cast session) is an
  edge case; the cast-precedence rule resolves it deterministically.
- `customData` round-trip for `playMethod` relies on the receiver echoing
  `customData` — already confirmed working in sub-project B.

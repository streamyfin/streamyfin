# Casting Session Reporting & Remote Control — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement app-wide Jellyfin remote control (Playstate / GeneralCommand) routed through a `PlaybackController` registry, fix the cast `PlayMethod` report, make the episode buttons conditional, and fix the `loadEpisode` race.

**Architecture:** A `PlaybackController` interface is the canonical control surface; each player (cast, native video, music) registers an implementation into a Jotai atom while it is active. A pure mapper turns WebSocket remote-control messages into typed actions; a `useRemoteControl` hook dispatches them to the active controller. Small cast fixes ride alongside.

**Tech Stack:** TypeScript (strict), React Native / Expo, Jotai, `@jellyfin/sdk`, `react-native-google-cast`, `sonner-native`. Pure logic is unit-tested with `bun test`.

**Spec:** `docs/superpowers/specs/2026-05-22-chromecast-session-remote-control-design.md`

**Environment note:** Windows checkout, `core.autocrlf=true` — project-wide `bun run check` reports ~124 pre-existing CRLF errors unrelated to this work. The gate is `bun run typecheck` (fully green) plus Biome on the files each task edits.

**Commit note:** Do NOT add a `Co-Authored-By` trailer to any commit message in this project.

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `utils/playback/playbackController.ts` | `PlaybackController` interface, atom, `useRegisterPlaybackController` | 1 |
| `utils/playback/remoteCommands.ts` | Pure WS-message → `RemoteAction` mapper | 2 |
| `utils/playback/remoteCommands.test.ts` | Unit tests for the mapper | 2 |
| `hooks/useRemoteControl.ts` | Dispatch remote actions to the active controller | 3 |
| `providers/WebSocketProvider.tsx` | Consume `useRemoteControl`; expand `SupportedCommands` | 4 |
| `app/(auth)/casting-player.tsx` | Register the cast controller; fix `loadEpisode` race | 5, 10 |
| `app/(auth)/player/direct-player.tsx` | Register the native-video controller | 6 |
| `providers/MusicPlayerProvider.tsx` | Register the music controller | 7 |
| `utils/casting/castLoad.ts`, `utils/casting/mediaInfo.ts` | Embed `playMethod` in customData | 8 |
| `hooks/useCasting.ts` | Report the real `PlayMethod` | 8 |
| `components/casting/player/CastPlayerEpisodeControls.tsx` | Conditional Previous / Next buttons | 9 |

---

## Task 1: `PlaybackController` contract & registry

**Files:**
- Create: `utils/playback/playbackController.ts`

- [ ] **Step 1: Write the module**

Create `utils/playback/playbackController.ts`:

```ts
/**
 * The canonical playback-control surface. Every player (cast, native video,
 * music) implements this interface and registers itself as the active
 * controller while it is playing, so remote-control commands can be routed to
 * whatever is currently playing.
 */

import { atom, useSetAtom } from "jotai";
import { useEffect } from "react";

export interface PlaybackController {
  playPause(): void;
  pause(): void;
  unpause(): void;
  stop(): void;
  /** Absolute seek position in milliseconds. */
  seek(positionMs: number): void;
  next(): void;
  previous(): void;
  /** Volume 0-1. */
  setVolume(level: number): void;
  toggleMute(): void;
}

/** The currently-active playback controller, or null when nothing is playing. */
export const activePlaybackControllerAtom = atom<PlaybackController | null>(
  null,
);

/**
 * Register `controller` as the active playback controller while `active` is
 * true. Clears the atom on unmount or when `active` becomes false — but only if
 * the atom still holds this exact controller (so a newer registration wins).
 */
export const useRegisterPlaybackController = (
  controller: PlaybackController | null,
  active: boolean,
): void => {
  const setController = useSetAtom(activePlaybackControllerAtom);
  useEffect(() => {
    if (!active || !controller) return;
    setController(controller);
    return () => {
      setController((current) => (current === controller ? null : current));
    };
  }, [active, controller, setController]);
};
```

- [ ] **Step 2: Verify types**

Run: `bun run typecheck`
Expected: PASS — no errors.

- [ ] **Step 3: Commit**

```bash
git add utils/playback/playbackController.ts
git commit -m "feat(playback): add PlaybackController contract and registry"
```

---

## Task 2: Pure remote-command mapper

**Files:**
- Create: `utils/playback/remoteCommands.ts`
- Test: `utils/playback/remoteCommands.test.ts`

- [ ] **Step 1: Write the failing test**

Create `utils/playback/remoteCommands.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { mapRemoteCommand } from "./remoteCommands";

describe("mapRemoteCommand — Playstate", () => {
  test("maps Pause", () => {
    expect(mapRemoteCommand({ MessageType: "Playstate", Data: { Command: "Pause" } }))
      .toEqual({ kind: "pause" });
  });

  test("maps Stop, PlayPause, Unpause, NextTrack, PreviousTrack", () => {
    const m = (c: string) =>
      mapRemoteCommand({ MessageType: "Playstate", Data: { Command: c } });
    expect(m("Stop")).toEqual({ kind: "stop" });
    expect(m("PlayPause")).toEqual({ kind: "playPause" });
    expect(m("Unpause")).toEqual({ kind: "unpause" });
    expect(m("NextTrack")).toEqual({ kind: "next" });
    expect(m("PreviousTrack")).toEqual({ kind: "previous" });
  });

  test("maps Seek, converting ticks to milliseconds", () => {
    expect(
      mapRemoteCommand({
        MessageType: "Playstate",
        Data: { Command: "Seek", SeekPositionTicks: 600_000_000 },
      }),
    ).toEqual({ kind: "seek", positionMs: 60_000 });
  });

  test("returns null for Seek with no position", () => {
    expect(
      mapRemoteCommand({ MessageType: "Playstate", Data: { Command: "Seek" } }),
    ).toBeNull();
  });

  test("returns null for an unknown command", () => {
    expect(
      mapRemoteCommand({ MessageType: "Playstate", Data: { Command: "Wat" } }),
    ).toBeNull();
  });
});

describe("mapRemoteCommand — GeneralCommand", () => {
  test("maps SetVolume, converting 0-100 to 0-1", () => {
    expect(
      mapRemoteCommand({
        MessageType: "GeneralCommand",
        Data: { Name: "SetVolume", Arguments: { Volume: "40" } },
      }),
    ).toEqual({ kind: "setVolume", level: 0.4 });
  });

  test("clamps SetVolume to 0-1", () => {
    const r = mapRemoteCommand({
      MessageType: "GeneralCommand",
      Data: { Name: "SetVolume", Arguments: { Volume: "250" } },
    });
    expect(r).toEqual({ kind: "setVolume", level: 1 });
  });

  test("maps ToggleMute / Mute / Unmute to toggleMute", () => {
    const m = (n: string) =>
      mapRemoteCommand({ MessageType: "GeneralCommand", Data: { Name: n } });
    expect(m("ToggleMute")).toEqual({ kind: "toggleMute" });
    expect(m("Mute")).toEqual({ kind: "toggleMute" });
    expect(m("Unmute")).toEqual({ kind: "toggleMute" });
  });

  test("maps DisplayMessage from Arguments.Text", () => {
    expect(
      mapRemoteCommand({
        MessageType: "GeneralCommand",
        Data: { Name: "DisplayMessage", Arguments: { Text: "Hello" } },
      }),
    ).toEqual({ kind: "displayMessage", text: "Hello" });
  });
});

describe("mapRemoteCommand — other", () => {
  test("returns null for unrelated message types", () => {
    expect(mapRemoteCommand({ MessageType: "KeepAlive", Data: {} })).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test utils/playback/remoteCommands.test.ts`
Expected: FAIL — `Cannot find module './remoteCommands'`.

- [ ] **Step 3: Write the implementation**

Create `utils/playback/remoteCommands.ts`:

```ts
/**
 * Pure mapping from a Jellyfin remote-control WebSocket message to a typed
 * action. Dependency-free so it is unit-testable under `bun test`.
 */

/** A WebSocket message envelope (subset). */
export interface RemoteWsMessage {
  MessageType: string;
  Data?: unknown;
}

export type RemoteAction =
  | { kind: "playPause" }
  | { kind: "pause" }
  | { kind: "unpause" }
  | { kind: "stop" }
  | { kind: "seek"; positionMs: number }
  | { kind: "next" }
  | { kind: "previous" }
  | { kind: "setVolume"; level: number }
  | { kind: "toggleMute" }
  | { kind: "displayMessage"; text: string };

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));

const mapPlaystate = (data: Record<string, unknown>): RemoteAction | null => {
  switch (data.Command) {
    case "PlayPause":
      return { kind: "playPause" };
    case "Pause":
      return { kind: "pause" };
    case "Unpause":
      return { kind: "unpause" };
    case "Stop":
      return { kind: "stop" };
    case "NextTrack":
      return { kind: "next" };
    case "PreviousTrack":
      return { kind: "previous" };
    case "Seek": {
      const ticks = data.SeekPositionTicks;
      if (typeof ticks !== "number") return null;
      return { kind: "seek", positionMs: Math.floor(ticks / 10000) };
    }
    default:
      return null;
  }
};

const mapGeneralCommand = (
  data: Record<string, unknown>,
): RemoteAction | null => {
  const args = (data.Arguments ?? {}) as Record<string, unknown>;
  switch (data.Name) {
    case "SetVolume": {
      const volume = Number(args.Volume);
      if (!Number.isFinite(volume)) return null;
      return { kind: "setVolume", level: clamp01(volume / 100) };
    }
    case "Mute":
    case "Unmute":
    case "ToggleMute":
      return { kind: "toggleMute" };
    case "DisplayMessage": {
      const text = args.Text ?? args.Header;
      if (!text) return null;
      return { kind: "displayMessage", text: String(text) };
    }
    default:
      return null;
  }
};

/** Map a remote-control WS message to a typed action, or null if unhandled. */
export const mapRemoteCommand = (
  message: RemoteWsMessage,
): RemoteAction | null => {
  const data = (message.Data ?? {}) as Record<string, unknown>;
  if (message.MessageType === "Playstate") return mapPlaystate(data);
  if (message.MessageType === "GeneralCommand") return mapGeneralCommand(data);
  return null;
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test utils/playback/remoteCommands.test.ts`
Expected: PASS — all suites pass.

- [ ] **Step 5: Commit**

```bash
git add utils/playback/remoteCommands.ts utils/playback/remoteCommands.test.ts
git commit -m "feat(playback): add pure remote-command mapper"
```

---

## Task 3: `useRemoteControl` hook

**Files:**
- Create: `hooks/useRemoteControl.ts`

- [ ] **Step 1: Write the hook**

Create `hooks/useRemoteControl.ts`:

```ts
/**
 * Dispatches Jellyfin remote-control WebSocket messages to the active
 * PlaybackController. DisplayMessage is shown as an in-app toast and needs no
 * controller.
 */

import { useAtomValue } from "jotai";
import { useEffect } from "react";
import { toast } from "sonner-native";
import { activePlaybackControllerAtom } from "@/utils/playback/playbackController";
import {
  mapRemoteCommand,
  type RemoteWsMessage,
} from "@/utils/playback/remoteCommands";

/** Handle one remote-control message (call it whenever a new WS message arrives). */
export const useRemoteControl = (lastMessage: RemoteWsMessage | null): void => {
  const controller = useAtomValue(activePlaybackControllerAtom);

  useEffect(() => {
    if (!lastMessage) return;
    const action = mapRemoteCommand(lastMessage);
    if (!action) return;

    if (action.kind === "displayMessage") {
      toast(action.text);
      return;
    }

    if (!controller) return;

    switch (action.kind) {
      case "playPause":
        controller.playPause();
        break;
      case "pause":
        controller.pause();
        break;
      case "unpause":
        controller.unpause();
        break;
      case "stop":
        controller.stop();
        break;
      case "seek":
        controller.seek(action.positionMs);
        break;
      case "next":
        controller.next();
        break;
      case "previous":
        controller.previous();
        break;
      case "setVolume":
        controller.setVolume(action.level);
        break;
      case "toggleMute":
        controller.toggleMute();
        break;
    }
  }, [lastMessage, controller]);
};
```

- [ ] **Step 2: Verify types**

Run: `bun run typecheck`
Expected: PASS — no errors.

> If `sonner-native`'s `toast` export name differs, check an existing usage with
> `grep -rn "sonner-native" --include="*.tsx" components app | head -3` and match it.

- [ ] **Step 3: Commit**

```bash
git add hooks/useRemoteControl.ts
git commit -m "feat(playback): add useRemoteControl dispatch hook"
```

---

## Task 4: Wire remote control into `WebSocketProvider`

**Files:**
- Modify: `providers/WebSocketProvider.tsx`

- [ ] **Step 1: Consume the hook**

In `providers/WebSocketProvider.tsx`, add the import:

```ts
import { useRemoteControl } from "@/hooks/useRemoteControl";
```

Inside the `WebSocketProvider` component body (after `lastMessage` is declared), add:

```ts
  // Route Jellyfin remote-control messages to the active player.
  useRemoteControl(lastMessage);
```

- [ ] **Step 2: Expand advertised capabilities**

In the `postFullCapabilities` call, replace:

```ts
            SupportedCommands: ["Play"],
```

with:

```ts
            SupportedCommands: [
              "Play",
              "DisplayMessage",
              "SetVolume",
              "ToggleMute",
              "Mute",
              "Unmute",
            ],
```

- [ ] **Step 3: Verify types**

Run: `bun run typecheck`
Expected: PASS — no errors.

> `SupportedCommands` is typed as `GeneralCommandType[]` by the Jellyfin SDK. The
> six strings above are all valid `GeneralCommandType` values, so the array
> literal type-checks. If the SDK rejects a literal, that value is not a valid
> `GeneralCommandType` — remove it and report it.

- [ ] **Step 4: Commit**

```bash
git add providers/WebSocketProvider.tsx
git commit -m "feat(playback): handle remote-control messages over WebSocket"
```

---

## Task 5: Register the cast `PlaybackController`

**Files:**
- Modify: `app/(auth)/casting-player.tsx`

- [ ] **Step 1: Build and register the controller**

Read `app/(auth)/casting-player.tsx`. It uses `useCasting` (which exposes
`togglePlayPause`, `pause`, `play`, `seek`, `skipForward`, `skipBackward`, `stop`,
`setVolume`, `progress`, `volume`) and `useCastEpisodes` (`loadEpisode`, `episodes`,
`nextEpisode`), and has `currentItem`.

Add a memoised `PlaybackController` built from those, and register it while a cast
session is active. Concretely:

```tsx
import { useMemo } from "react";
import {
  type PlaybackController,
  useRegisterPlaybackController,
} from "@/utils/playback/playbackController";
```

Build the controller (place this near the other `useMemo`s, after `castingControls`
and the episode/selection hooks are available):

```tsx
  const castController = useMemo<PlaybackController>(
    () => ({
      playPause: () => {
        castingControls.togglePlayPause();
      },
      pause: () => {
        castingControls.pause();
      },
      unpause: () => {
        castingControls.play();
      },
      stop: () => {
        castingControls.stop();
      },
      seek: (positionMs) => {
        castingControls.seek(positionMs);
      },
      next: () => {
        if (nextEpisode) loadEpisode(nextEpisode);
      },
      previous: () => {
        const idx = episodes.findIndex((e) => e.Id === currentItem?.Id);
        if (idx > 0) loadEpisode(episodes[idx - 1]);
      },
      setVolume: (level) => {
        castingControls.setVolume(level);
      },
      toggleMute: () => {
        castingControls.setVolume(castingControls.volume > 0 ? 0 : 1);
      },
    }),
    [castingControls, episodes, nextEpisode, loadEpisode, currentItem?.Id],
  );

  useRegisterPlaybackController(castController, castState === CastState.CONNECTED);
```

> Verify the exact names against `useCasting`'s return and `useCastEpisodes`'s
> return — the methods listed above are what those hooks expose. `castState` /
> `CastState` are already imported in this file. If `castingControls` does not
> expose `volume`, derive the mute-toggle from whatever volume value it does
> expose, or from `currentSelection` — keep the intent (mute ↔ unmute).

- [ ] **Step 2: Verify**

Run: `bun run typecheck`
Expected: PASS — no errors.

Run: `bunx biome check "app/(auth)/casting-player.tsx"`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add "app/(auth)/casting-player.tsx"
git commit -m "feat(casting): register cast PlaybackController for remote control"
```

---

## Task 6: Register the native-video `PlaybackController`

**Files:**
- Modify: `app/(auth)/player/direct-player.tsx`

- [ ] **Step 1: Build and register the controller**

Read `app/(auth)/player/direct-player.tsx` and locate its playback controls — the
play, pause, seek, and (if present) next/previous-episode handlers it already uses
for its on-screen controls (it has a video player ref and `usePlaybackManager` for
`previousItem` / `nextItem`).

Add a memoised `PlaybackController` wrapping those existing handlers, and register
it with `useRegisterPlaybackController(controller, true)` — `true` because the
controller should be active for the whole lifetime of the player screen (the hook
clears it automatically on unmount).

```tsx
import {
  type PlaybackController,
  useRegisterPlaybackController,
} from "@/utils/playback/playbackController";
```

Build the controller from the screen's existing control functions (do not invent
new playback logic — reuse what the on-screen buttons call). For `setVolume` /
`toggleMute`, if the native player exposes no volume control, implement them as
no-ops (the dashboard volume slider then simply has no effect on local video — that
is acceptable and honest). `seek` takes milliseconds — convert to whatever unit the
player's seek expects.

- [ ] **Step 2: Verify**

Run: `bun run typecheck`
Expected: PASS — no errors.

Run: `bunx biome check "app/(auth)/player/direct-player.tsx"`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add "app/(auth)/player/direct-player.tsx"
git commit -m "feat(player): register native-video PlaybackController"
```

---

## Task 7: Register the music `PlaybackController`

**Files:**
- Modify: `providers/MusicPlayerProvider.tsx`

- [ ] **Step 1: Build and register the controller**

Read `providers/MusicPlayerProvider.tsx` and locate its playback controls (play /
pause / stop / seek / skip-next / skip-previous / volume — whatever it exposes for
the music UI).

Add a memoised `PlaybackController` wrapping those, and register it with
`useRegisterPlaybackController(controller, isMusicActive)` where `isMusicActive` is
the provider's existing "is a track loaded / playing" condition. Reuse the
provider's existing control functions — do not add new playback logic.

```tsx
import {
  type PlaybackController,
  useRegisterPlaybackController,
} from "@/utils/playback/playbackController";
```

If the music player exposes no volume API, make `setVolume` / `toggleMute` no-ops.

- [ ] **Step 2: Verify**

Run: `bun run typecheck`
Expected: PASS — no errors.

Run: `bunx biome check providers/MusicPlayerProvider.tsx`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add providers/MusicPlayerProvider.tsx
git commit -m "feat(music): register music PlaybackController"
```

---

## Task 8: Report the real cast `PlayMethod`

**Files:**
- Modify: `utils/casting/castLoad.ts`, `utils/casting/mediaInfo.ts`, `hooks/useCasting.ts`

- [ ] **Step 1: Carry `playMethod` in customData**

In `utils/casting/mediaInfo.ts`, add an optional parameter to `buildCastMediaInfo`,
alongside `playSessionId` and `selection`:

```ts
  /** "Transcode" when the stream is a server transcode, else "DirectPlay". */
  playMethod?: "Transcode" | "DirectPlay";
```

Destructure `playMethod` in the function signature, and add it to the
`slimCustomData` object (extend its inline type with `playMethod?: "Transcode" |
"DirectPlay"`, the same way `selection` was added).

- [ ] **Step 2: Determine and pass `playMethod` in `castLoad.ts`**

In `utils/casting/castLoad.ts`, inside `attemptLoad`, after `getStreamUrl` returns
`data`, determine the play method from whether the resolved media source is a
transcode:

```ts
  const playMethod: "Transcode" | "DirectPlay" = data.mediaSource?.TranscodingUrl
    ? "Transcode"
    : "DirectPlay";
```

Pass `playMethod` into the `buildCastMediaInfo({ ... })` call.

> `getStreamUrl` returns `{ url, sessionId, mediaSource }`; `mediaSource` is a
> `MediaSourceInfo` whose `TranscodingUrl` is set when the server chose to
> transcode. Confirm the returned shape in `utils/jellyfin/media/getStreamUrl.ts`.

- [ ] **Step 3: Report it in `useCasting.ts`**

In `hooks/useCasting.ts`, the progress reporting currently sets
`PlayMethod: activeProtocol === "chromecast" ? "DirectStream" : "DirectPlay"` in
both `reportPlaybackStart` and `reportPlaybackProgress`. Read the real play method
from customData near the existing `playSessionId` derivation:

```ts
  const playMethod =
    (mediaStatus?.mediaInfo?.customData as
      | { playMethod?: "Transcode" | "DirectPlay" }
      | undefined)?.playMethod ?? "Transcode";
```

Replace both hardcoded `PlayMethod:` expressions with `PlayMethod: playMethod`. Add
`playMethod` to the progress-reporting `useEffect` dependency array.

> Default to `"Transcode"` — a cast stream is a transcode far more often than not,
> so it is the safer fallback when customData has not yet arrived.

- [ ] **Step 4: Verify**

Run: `bun run typecheck`
Expected: PASS — no errors.

Run: `bun test utils/casting/`
Expected: PASS — all suites pass.

- [ ] **Step 5: Commit**

```bash
git add utils/casting/castLoad.ts utils/casting/mediaInfo.ts hooks/useCasting.ts
git commit -m "fix(casting): report the real PlayMethod to Jellyfin"
```

---

## Task 9: Conditional episode buttons

**Files:**
- Modify: `components/casting/player/CastPlayerEpisodeControls.tsx`

- [ ] **Step 1: Make Previous / Next conditional**

Read `components/casting/player/CastPlayerEpisodeControls.tsx`. It receives
`episodes`, `nextEpisode`, and `currentItemId`. The Previous button currently
renders always (disabled when `episodes.findIndex(...) <= 0`); the Next button
renders always (disabled when `!nextEpisode`).

Change both so they are **not rendered at all** when there is no adjacent episode:
- Previous: render only when `episodes.findIndex((e) => e.Id === currentItemId) > 0`.
- Next: render only when `nextEpisode` is truthy.

Keep the Episodes-list and Stop buttons unconditional. Preserve the row layout —
if the row uses fixed spacing, ensure removing a button does not break alignment
(the remaining buttons should stay evenly placed; adjust the container's
`justifyContent` / gap only if needed, behaviour of the remaining buttons unchanged).

- [ ] **Step 2: Verify**

Run: `bun run typecheck`
Expected: PASS — no errors.

Run: `bunx biome check components/casting/player/CastPlayerEpisodeControls.tsx`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add components/casting/player/CastPlayerEpisodeControls.tsx
git commit -m "feat(casting): hide episode buttons when no adjacent episode"
```

---

## Task 10: Fix the `loadEpisode` / `currentItem` race

**Files:**
- Modify: `app/(auth)/casting-player.tsx`

- [ ] **Step 1: Guard against the stale `currentItem`**

Read `app/(auth)/casting-player.tsx`. `loadEpisode` (from `useCastEpisodes`) loads a
new episode on the cast; `currentItem` is derived from the cast `customData` and
updates only once the cast reports the new episode — leaving a window where
`currentItem` still describes the previous episode.

Fix: track the id of the episode being loaded, and treat `currentItem` as "pending"
until the cast's `customData` item id matches it. Concretely:

- Add a ref `pendingEpisodeIdRef` (a `useRef<string | null>(null)`).
- When `loadEpisode` is invoked, set `pendingEpisodeIdRef.current` to the target
  episode id. (Wrap the `loadEpisode` call sites, or wrap the function the cast
  player passes to `CastPlayerEpisodeControls` / the episode list, so the ref is set
  whenever an episode load starts.)
- Clear the ref once `currentItem?.Id === pendingEpisodeIdRef.current` (the cast has
  caught up).
- While `pendingEpisodeIdRef.current` is set and does not match `currentItem?.Id`,
  the player is mid-transition — guard the derivations that would act on the stale
  item (the episode-controls indices and the selection menu) so they do not flash
  the previous episode's data. The simplest correct guard: while pending, suppress
  rendering the episode-dependent secondary UI, or show the loading state, until
  `currentItem` matches.

Keep this minimal and behaviour-preserving for the non-racing path — when no load
is pending, nothing changes.

> This is a real but small bug. If, on reading the file, the cleanest fix is to
> have `useCastEpisodes` expose a `loadingEpisodeId` rather than a ref in the
> screen, do that instead — keep the fix where it reads most naturally. Report
> which approach you took.

- [ ] **Step 2: Verify**

Run: `bun run typecheck`
Expected: PASS — no errors.

Run: `bun test utils/casting/`
Expected: PASS.

Run: `bunx biome check "app/(auth)/casting-player.tsx"`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add "app/(auth)/casting-player.tsx"
git commit -m "fix(casting): guard against stale currentItem during episode load"
```

---

## Final verification

- [ ] **Checks**

Run: `bun test utils/` → PASS (`remoteCommands` plus the existing `casting` suites).
Run: `bun run typecheck` → PASS.

- [ ] **Manual verification**

From the Jellyfin web dashboard's "Devices" / active-session view, with the app
casting:
- The session shows `Transcode` (not direct-play) for a transcoded stream.
- The remote panel's pause / play / stop / seek / next / previous control the cast.
- The volume control changes the cast volume; mute toggles it.
- "Send message" shows a toast in the app.
- Repeat with the native video player open (not casting): transport + message work;
  volume is a no-op if the native player has no volume API.
- In the cast player, Previous is absent on the first episode, Next absent on the
  last.
- Changing episode shows no flash of the previous episode's title/tracks.

---

## Notes for the implementer

- Line numbers drift — match on quoted code.
- `bun test` is Bun's native runner; `remoteCommands.ts` is pure (no imports) so its
  test runs cleanly. Do not write a test that imports `useRemoteControl.ts` or
  `playbackController.ts` — they pull React / jotai.
- Tasks 5-7 are integration: reuse each player's existing control functions, do not
  reimplement playback logic. A `setVolume` / `toggleMute` no-op is acceptable where
  a player has no volume API.
- Do NOT add a `Co-Authored-By` trailer to commit messages.
- Out of scope: track-switching remote commands, the custom receiver.

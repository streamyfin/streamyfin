# Chromecast Track Switching & Multi-Version — Design

**Date:** 2026-05-21
**Branch:** `refactor-chromecast` (PR #1402)
**Sub-project:** B of the Chromecast refactor
**Status:** Approved design — pending implementation plan

---

## 1. Problem

Audio, subtitle, and quality switching on the Chromecast player are unreliable. The
visible symptom: the UI labels a track (e.g. Japanese audio) while the cast actually
plays a different one (e.g. French).

Root cause — track selection is built on React state that desyncs from what is
actually loaded on the receiver:

- **Audio.** `selectedAudioTrackIndex` is reset to `null` by `loadEpisode`. It is
  re-initialised only by a `useEffect` keyed on `fetchedItem`, which does **not**
  refresh on an episode change (`currentItem` updates from cast `customData`, not a
  refetch). So after an episode change the index stays `null` and the menu falls back
  to `availableAudioTracks[0]` — an arbitrary track, not the server default that is
  actually playing.
- **Quality.** `selectedMediaSource` is hardcoded to `availableMediaSources[0]`
  ("Max"). There is no state for it at all — picking a quality never updates the UI.
- **`availableMediaSources` is fake.** It is a list of synthetic bitrate variants
  (Max / 8 / 4 / 2 / 1 Mb/s) dressed up as `MediaSource` objects. The item's real
  `MediaSources` (multi-version files) are ignored — only `[0]` is ever used.
- **No source of truth.** A transcoded cast stream collapses to a single baked-in
  audio track, so the only truth for "what is selected" is the set of indices last
  sent to `getStreamUrl`. Today that truth is scattered across React state that drifts.

## 2. Scope

**In scope**

- Reliable switching of audio track, subtitle track, quality (bitrate cap), and
  version (real `MediaSource`).
- A single source of truth for the active selection, so the UI always reflects what
  is actually loaded on the cast.
- A real multi-version selector built from the item's actual `MediaSources`,
  separated from the bitrate "Quality" axis.

**Out of scope** (other sub-projects)

- Subtitle rendering and styling — sub-project: custom receiver.
- Sidecar VTT vs burned-in vs receiver-rendered subtitle delivery — a single
  decision belonging to the custom-receiver sub-project (see §10).
- Splitting `casting-player.tsx` (52 KB) — sub-project C.
- Remote-control panel, episode navigation — sub-project D.

## 3. Subtitle delivery

Sub-project B keeps the **current burned-in** delivery: the server burns the chosen
subtitle into the transcoded video; a change triggers a stream reload like any other.
B treats a subtitle purely as an index in the selection model — it is **receiver
delivery-agnostic** and contains no burned-in/sidecar branching.

The burned-in vs sidecar-VTT vs receiver-rendered decision is deferred in full to the
custom-receiver sub-project, where an actual receiver type exists to detect. This
mirrors sub-project A, which decoupled the custom receiver from the crash fixes.

## 4. The selection model

A single object represents everything loaded on the cast:

```ts
export interface CastSelection {
  /** Which MediaSource (version) is playing. */
  mediaSourceId: string;
  /** Absolute MediaStream index of the audio track. */
  audioStreamIndex: number;
  /** Absolute MediaStream index of the subtitle track; -1 = subtitles off. */
  subtitleStreamIndex: number;
  /** Quality cap in bits/second; undefined = unconstrained. */
  maxBitrate?: number;
}
```

`resolveSelection(item, partial)` produces a complete `CastSelection` from a partial
one by filling missing fields with server defaults:

- `mediaSourceId` → the requested source, else the item's first `MediaSource`.
- `audioStreamIndex` → `resolveDefaultAudioIndex(item, mediaSourceId)` (the helper
  added in sub-project A — reuse it).
- `subtitleStreamIndex` → the source's `DefaultSubtitleStreamIndex`, else `-1`.
- `maxBitrate` → passed through (`undefined` allowed).

Used on first load and on every episode change. On an explicit switch the caller
already holds the full current selection, so it merges `{...current, ...partial}`.

## 5. Source of truth — customData (approach A3)

`loadCastMedia` knows the exact `CastSelection` it sent. It embeds the resolved
selection into the Cast `customData`, exactly as sub-project A did with
`playSessionId`. `buildCastMediaInfo`'s slim `customData` gains `selection`.

The Default Media Receiver echoes `customData` back in `mediaStatus.mediaInfo`.
`casting-player` reads `mediaStatus.mediaInfo.customData.selection` — that is the
**truth**: what is actually loaded on the cast. It cannot desync, it survives
leaving and re-entering the player, and it survives app backgrounding.

### Optimistic pending state

A switch triggers a stream reload (re-transcode), which takes a few seconds. To keep
the UI responsive:

1. The user picks a track. The UI sets a local `pendingSelection` (the chosen value)
   and triggers the reload.
2. The UI renders `pendingSelection` immediately.
3. When the new `mediaStatus` arrives with a `customData.selection` that matches the
   request, `pendingSelection` is cleared and the UI reads the truth again.
4. If the reload fails, `pendingSelection` is cleared and the UI reverts to the truth.

The UI's effective selection is: `pendingSelection ?? customData.selection ??
<default derived from currentItem>`.

## 6. `useCastSelection` hook

A new hook, `hooks/useCastSelection.ts`, encapsulates approach A3:

- Reads `customData.selection` from `mediaStatus` as the truth.
- Holds the `pendingSelection` and clears it on reconciliation or failure.
- Exposes `currentSelection` (the effective selection) and `applySelection(partial)`,
  which merges the partial into the current selection, sets pending, and invokes a
  caller-supplied reload callback.

The reload itself stays in `casting-player` (it owns `remoteMediaClient`,
`castDevice`, `api`). The hook owns only selection state. This keeps `casting-player`
thinner and gives sub-project C (the file split) a clean unit to extract.

## 7. `casting-player.tsx` rework

- **Remove:** raw `selectedAudioTrackIndex` / `selectedSubtitleTrackIndex` state, the
  synthetic `availableMediaSources` bitrate generator, the hardcoded
  `selectedMediaSource={availableMediaSources[0]}`, and the `setSelected…(null)` calls
  in `loadEpisode`.
- **Add:** `useCastSelection` for the active selection.
- `availableVersions` — the item's real `currentItem.MediaSources` (id, name,
  bitrate, container).
- `availableQualities` — the bitrate-cap options, kept as a **separate axis** from
  version; this is the real `maxStreamingBitrate` transcode cap, no longer disguised
  as media sources.
- `availableAudioTracks` / `availableSubtitleTracks` — derived from the **selected
  version's** `MediaStreams`, not always `MediaSources[0]`.
- Every "selected" indicator reads from `currentSelection`.

## 8. `ChromecastSettingsMenu.tsx` rework

Distinct sections: **Version** (shown only when the item has more than one
`MediaSource`), **Quality** (bitrate cap), **Audio**, **Subtitles**, **Speed**. Each
section's selected row is driven by `currentSelection` — the `[0]` fallback is gone.

## 9. Episode change

`loadEpisode` calls `loadCastMedia`, which resolves the new episode's defaults via
`resolveSelection` and embeds them in `customData`. `useCastSelection` reads the new
`customData.selection`, so the UI re-syncs automatically. The `setSelected…(null)`
calls are removed. This fixes the "UI says Japanese, plays French" bug at its root.

## 10. Reload semantics

Every audio / subtitle / quality / version change is a `loadCastMedia` reload
(re-transcode) that resumes at the current position — the same mechanism
`loadEpisode` already uses. Burned-in subtitles mean a subtitle change reloads too;
this is consistent with audio. The `pendingSelection` covers the re-buffer gap.

## 11. Files

| File | Change |
|---|---|
| `utils/casting/types.ts` | Add `CastSelection` |
| `utils/casting/castLoad.ts` | Add `resolveSelection`; embed the resolved selection in the load |
| `utils/casting/mediaInfo.ts` | `buildCastMediaInfo` customData carries `selection` |
| `hooks/useCastSelection.ts` | New — A3 selection state (truth + pending) |
| `app/(auth)/casting-player.tsx` | Replace track state with `useCastSelection`; real versions + separate quality axis |
| `components/chromecast/ChromecastSettingsMenu.tsx` | Separate Version / Quality sections; selected rows from `currentSelection` |

## 12. Testing

Pure, unit-testable with `bun test`:

- `resolveSelection` — default resolution for each field, partial merge.
- The effective-selection merge (`pending ?? truth ?? default`).

UI and integration paths are verified by `bun run typecheck` and manual casting.

## 13. Success criteria

- Switching audio: the UI label always matches the track that actually plays.
- Switching subtitle, quality, and version all reflect in the UI and apply to the
  stream.
- After an episode change, the UI shows the new episode's real default tracks — the
  Japanese/French desync is gone.
- Leaving and re-entering the casting player preserves the correct selection display.
- A multi-version item shows a working Version selector.
- `bun run typecheck` passes; `bun test utils/casting/` passes.

## 14. Risks

- The customData round-trip depends on the receiver echoing `customData` in
  `mediaStatus` — confirmed working in sub-project A via `playSessionId`.
- During a reload there is a brief window where `customData` is stale; the
  `pendingSelection` overlay covers it.
- Multi-version **episodes** require Jellyfin 12.0 (PR #16828); multi-version
  **movies** work on current Jellyfin. The Version selector simply shows whatever
  `MediaSources` the item exposes, so it degrades gracefully on older servers.
- The downgrade-on-failure retry (sub-project A) clamps bitrate internally; the
  `customData.selection` reflects the user's intended selection, not the retry's
  internal clamp. This is intentional — the selection model represents user choice.

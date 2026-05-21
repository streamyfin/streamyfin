# Chromecast Track Switching & Multi-Version — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Chromecast audio / subtitle / quality / version switching reliable by carrying a single `CastSelection` source of truth in the cast `customData`, with an optimistic pending overlay.

**Architecture:** A pure `CastSelection` model is resolved by `loadCastMedia` and embedded in the cast `customData`. The receiver echoes it back in `mediaStatus`, so the UI always reflects what is actually loaded. A `useCastSelection` hook holds the truth plus an optimistic `pending` selection during a reload. The casting player exposes real `MediaSources` as versions and reuses the app-wide `BITRATES` ladder for quality.

**Tech Stack:** TypeScript (strict), React Native / Expo, `@jellyfin/sdk`, `react-native-google-cast`, Jotai. Tests use Bun's native runner (`bun test`).

**Spec:** `docs/superpowers/specs/2026-05-21-chromecast-track-switching-design.md`

**Environment note:** Windows checkout, `core.autocrlf=true` — a project-wide `bun run check` reports ~124 pre-existing CRLF errors unrelated to this work. The correctness gate is `bun run typecheck` (must be green) plus Biome on the files each task edits.

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `utils/casting/types.ts` | Add the `CastSelection` interface | 1 |
| `utils/casting/selection.ts` | `resolveDefaultAudioIndex`, `resolveSelection`, `selectionsEqual` | 1 |
| `utils/casting/selection.test.ts` | Unit tests for the selection helpers | 1 |
| `utils/casting/castLoad.ts` | Import audio-index helper from `selection.ts`; resolve + embed `CastSelection` | 1, 3 |
| `utils/casting/mediaInfo.ts` | `buildCastMediaInfo` customData carries `selection` | 2 |
| `hooks/useCastSelection.ts` | New — selection state (customData truth + optimistic pending) | 4 |
| `components/BitrateSelector.tsx` | Expand the shared `BITRATES` ladder | 5 |
| `app/(auth)/casting-player.tsx` | Use `useCastSelection`; real versions + quality from `BITRATES` | 6 |
| `components/chromecast/ChromecastSettingsMenu.tsx` | Version / Quality / Audio / Subtitle sections from the selection | 6 |

---

## Task 1: `CastSelection` model & selection helpers

**Files:**
- Modify: `utils/casting/types.ts`
- Create: `utils/casting/selection.ts`
- Test: `utils/casting/selection.test.ts`
- Modify: `utils/casting/castLoad.ts`

- [ ] **Step 1: Add the `CastSelection` type**

In `utils/casting/types.ts`, append before the final line:

```ts
/**
 * What is currently loaded on the cast — the single source of truth for
 * audio / subtitle / quality / version selection.
 */
export interface CastSelection {
  /** MediaSource (version) id. */
  mediaSourceId: string;
  /** Absolute MediaStream index of the audio track. */
  audioStreamIndex: number;
  /** Absolute MediaStream index of the subtitle track; -1 = subtitles off. */
  subtitleStreamIndex: number;
  /** Quality cap in bits/second; undefined = unconstrained. */
  maxBitrate?: number;
}
```

- [ ] **Step 2: Write the failing test**

Create `utils/casting/selection.test.ts`:

```ts
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { describe, expect, test } from "bun:test";
import {
  resolveDefaultAudioIndex,
  resolveSelection,
  selectionsEqual,
} from "./selection";

const item: BaseItemDto = {
  Id: "item-1",
  MediaSources: [
    {
      Id: "src-a",
      DefaultAudioStreamIndex: 2,
      DefaultSubtitleStreamIndex: 3,
      MediaStreams: [
        { Type: "Video", Index: 0 },
        { Type: "Audio", Index: 1, IsDefault: false },
        { Type: "Audio", Index: 2, IsDefault: true },
        { Type: "Subtitle", Index: 3 },
      ],
    },
    {
      Id: "src-b",
      MediaStreams: [
        { Type: "Video", Index: 0 },
        { Type: "Audio", Index: 1, IsDefault: false },
      ],
    },
  ],
};

describe("resolveDefaultAudioIndex", () => {
  test("uses the source's DefaultAudioStreamIndex when present", () => {
    expect(resolveDefaultAudioIndex(item, "src-a")).toBe(2);
  });

  test("falls back to the first audio stream when no default flag", () => {
    expect(resolveDefaultAudioIndex(item, "src-b")).toBe(1);
  });
});

describe("resolveSelection", () => {
  test("fills every field from server defaults of the first source", () => {
    const sel = resolveSelection(item, {});
    expect(sel.mediaSourceId).toBe("src-a");
    expect(sel.audioStreamIndex).toBe(2);
    expect(sel.subtitleStreamIndex).toBe(3);
    expect(sel.maxBitrate).toBeUndefined();
  });

  test("a partial overrides defaults and keeps the rest", () => {
    const sel = resolveSelection(item, { audioStreamIndex: 1, maxBitrate: 4_000_000 });
    expect(sel.audioStreamIndex).toBe(1);
    expect(sel.maxBitrate).toBe(4_000_000);
    expect(sel.subtitleStreamIndex).toBe(3);
  });

  test("switching version resolves that version's defaults", () => {
    const sel = resolveSelection(item, { mediaSourceId: "src-b" });
    expect(sel.mediaSourceId).toBe("src-b");
    expect(sel.audioStreamIndex).toBe(1);
    expect(sel.subtitleStreamIndex).toBe(-1);
  });
});

describe("selectionsEqual", () => {
  test("true for identical selections", () => {
    const a = { mediaSourceId: "s", audioStreamIndex: 1, subtitleStreamIndex: -1 };
    expect(selectionsEqual(a, { ...a })).toBe(true);
  });

  test("false when any field differs", () => {
    const a = { mediaSourceId: "s", audioStreamIndex: 1, subtitleStreamIndex: -1 };
    expect(selectionsEqual(a, { ...a, audioStreamIndex: 2 })).toBe(false);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `bun test utils/casting/selection.test.ts`
Expected: FAIL — `Cannot find module './selection'`.

- [ ] **Step 4: Write the implementation**

Create `utils/casting/selection.ts`:

```ts
/**
 * Cast selection resolution — pure helpers, no React Native imports, so they
 * are unit-testable under `bun test`.
 */

import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import type { CastSelection } from "@/utils/casting/types";

/**
 * Resolve the default audio stream index for an item / media source.
 * Prefers the source's `DefaultAudioStreamIndex`, then the first audio stream.
 */
export const resolveDefaultAudioIndex = (
  item: BaseItemDto,
  mediaSourceId?: string,
): number | undefined => {
  const source = mediaSourceId
    ? item.MediaSources?.find((s) => s.Id === mediaSourceId)
    : item.MediaSources?.[0];
  if (source?.DefaultAudioStreamIndex != null) {
    return source.DefaultAudioStreamIndex;
  }
  const streams = source?.MediaStreams ?? item.MediaStreams;
  const audio =
    streams?.find((s) => s.Type === "Audio" && s.IsDefault) ??
    streams?.find((s) => s.Type === "Audio");
  return audio?.Index ?? undefined;
};

/**
 * Complete a partial selection with the item's server defaults.
 * Used on first load, on episode change, and when switching version.
 */
export const resolveSelection = (
  item: BaseItemDto,
  partial: Partial<CastSelection>,
): CastSelection => {
  const mediaSourceId =
    partial.mediaSourceId ?? item.MediaSources?.[0]?.Id ?? "";
  const source = item.MediaSources?.find((s) => s.Id === mediaSourceId);

  return {
    mediaSourceId,
    audioStreamIndex:
      partial.audioStreamIndex ??
      resolveDefaultAudioIndex(item, mediaSourceId) ??
      -1,
    subtitleStreamIndex:
      partial.subtitleStreamIndex ?? source?.DefaultSubtitleStreamIndex ?? -1,
    maxBitrate: partial.maxBitrate,
  };
};

/** True when two selections are equivalent — used to reconcile optimistic state. */
export const selectionsEqual = (
  a: CastSelection,
  b: CastSelection,
): boolean =>
  a.mediaSourceId === b.mediaSourceId &&
  a.audioStreamIndex === b.audioStreamIndex &&
  a.subtitleStreamIndex === b.subtitleStreamIndex &&
  a.maxBitrate === b.maxBitrate;
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `bun test utils/casting/selection.test.ts`
Expected: PASS — all suites pass.

- [ ] **Step 6: Move `resolveDefaultAudioIndex` out of `castLoad.ts`**

`castLoad.ts` currently defines and exports its own `resolveDefaultAudioIndex`. Delete that definition from `utils/casting/castLoad.ts` (the whole `export const resolveDefaultAudioIndex = ( ... );` block) and import it instead. Add to the imports of `castLoad.ts`:

```ts
import { resolveDefaultAudioIndex } from "@/utils/casting/selection";
```

> Place the import in alphabetical order among the `@/utils/casting/*` imports.
> The Biome pre-commit hook will fix ordering if needed.

- [ ] **Step 7: Verify types**

Run: `bun run typecheck`
Expected: PASS — no errors.

> If typecheck reports `resolveDefaultAudioIndex` imported elsewhere from `castLoad`,
> repoint that import to `@/utils/casting/selection`.

- [ ] **Step 8: Commit**

```bash
git add utils/casting/types.ts utils/casting/selection.ts utils/casting/selection.test.ts utils/casting/castLoad.ts
git commit -m "feat(casting): add CastSelection model and resolution helpers"
```

---

## Task 2: customData carries the selection

**Files:**
- Modify: `utils/casting/mediaInfo.ts`

- [ ] **Step 1: Add the `selection` parameter**

In `utils/casting/mediaInfo.ts`, add the import:

```ts
import type { CastSelection } from "@/utils/casting/types";
```

Find the parameter object's `playSessionId` entry:

```ts
  /** Jellyfin PlaySessionId, embedded in customData for progress reporting. */
  playSessionId?: string;
}) => {
```

Replace it with:

```ts
  /** Jellyfin PlaySessionId, embedded in customData for progress reporting. */
  playSessionId?: string;
  /** Active track / quality / version selection, embedded in customData. */
  selection?: CastSelection;
}) => {
```

- [ ] **Step 2: Destructure and embed `selection`**

Find the function signature opening and add `selection` to the destructured params:

```ts
export const buildCastMediaInfo = ({
  item,
  streamUrl,
  api,
  contentType,
  isLive = false,
  playSessionId,
}: {
```

Replace with:

```ts
export const buildCastMediaInfo = ({
  item,
  streamUrl,
  api,
  contentType,
  isLive = false,
  playSessionId,
  selection,
}: {
```

Then find the `slimCustomData` declaration:

```ts
  const slimCustomData: Partial<BaseItemDto> & { playSessionId?: string } = {
    playSessionId,
    Id: item.Id,
```

Replace it with:

```ts
  const slimCustomData: Partial<BaseItemDto> & {
    playSessionId?: string;
    selection?: CastSelection;
  } = {
    playSessionId,
    selection,
    Id: item.Id,
```

- [ ] **Step 3: Verify types**

Run: `bun run typecheck`
Expected: PASS — no errors.

- [ ] **Step 4: Commit**

```bash
git add utils/casting/mediaInfo.ts
git commit -m "feat(casting): embed CastSelection in cast customData"
```

---

## Task 3: `loadCastMedia` resolves and embeds the selection

**Files:**
- Modify: `utils/casting/castLoad.ts`

- [ ] **Step 1: Import `resolveSelection`**

In `utils/casting/castLoad.ts`, add to the imports:

```ts
import { resolveDefaultAudioIndex, resolveSelection } from "@/utils/casting/selection";
```

(This replaces the `resolveDefaultAudioIndex`-only import added in Task 1 — merge them into one line.)

- [ ] **Step 2: Resolve and use the selection in `attemptLoad`**

In `castLoad.ts`, the `attemptLoad` function currently computes `audioStreamIndex`
and calls `getStreamUrl` then `buildCastMediaInfo`. Replace the body of `attemptLoad`
(everything between the opening `{` and the closing `}` of the arrow function) with:

```ts
  const { api, item, userId, client, options } = params;
  const profile = buildChromecastProfile(caps);

  const selection = resolveSelection(item, {
    mediaSourceId: options?.mediaSourceId,
    audioStreamIndex: options?.audioStreamIndex,
    subtitleStreamIndex: options?.subtitleStreamIndex,
    maxBitrate: options?.maxBitrate,
  });

  const startPositionMs = options?.startPositionMs ?? 0;

  const data = await getStreamUrl({
    api,
    item,
    userId,
    startTimeTicks: Math.floor(startPositionMs * 10000),
    deviceProfile: profile,
    audioStreamIndex: selection.audioStreamIndex,
    subtitleStreamIndex: selection.subtitleStreamIndex,
    maxStreamingBitrate: selection.maxBitrate,
    mediaSourceId: selection.mediaSourceId,
  });

  if (!data?.url) {
    throw new Error("getStreamUrl returned no URL");
  }

  await client.loadMedia({
    mediaInfo: buildCastMediaInfo({
      item,
      streamUrl: data.url,
      api,
      playSessionId: data.sessionId ?? undefined,
      selection,
    }),
    startTime: startPositionMs / 1000,
  });
```

> `resolveDefaultAudioIndex` is now used only inside `resolveSelection`. After this
> change `castLoad.ts` no longer references `resolveDefaultAudioIndex` directly — if
> typecheck flags it as an unused import, remove it from the import in Step 1 and
> import only `resolveSelection`.

- [ ] **Step 3: Verify types**

Run: `bun run typecheck`
Expected: PASS — no errors.

- [ ] **Step 4: Run the casting tests**

Run: `bun test utils/casting/`
Expected: PASS — all suites pass.

- [ ] **Step 5: Commit**

```bash
git add utils/casting/castLoad.ts
git commit -m "feat(casting): resolve and embed full CastSelection on load"
```

---

## Task 4: `useCastSelection` hook

**Files:**
- Create: `hooks/useCastSelection.ts`

- [ ] **Step 1: Write the hook**

Create `hooks/useCastSelection.ts`:

```ts
/**
 * Source of truth for the active cast track / quality / version selection.
 *
 * Truth = the CastSelection echoed back in the cast media customData. A local
 * `pending` selection is shown optimistically while a reload re-transcodes, then
 * cleared once the cast reports it (reconciled) or the reload fails.
 */

import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { useCallback, useEffect, useState } from "react";
import type { MediaStatus } from "react-native-google-cast";
import { resolveSelection, selectionsEqual } from "@/utils/casting/selection";
import type { CastSelection } from "@/utils/casting/types";

interface UseCastSelectionParams {
  currentItem: BaseItemDto | null;
  mediaStatus: MediaStatus | null | undefined;
  /** Reload the cast stream with the given selection. Resolves true on success. */
  reload: (selection: CastSelection) => Promise<boolean>;
}

interface UseCastSelectionResult {
  /** Effective selection: optimistic pending, else cast truth, else default. */
  currentSelection: CastSelection | null;
  /** Merge a partial selection, show it optimistically, and reload the stream. */
  applySelection: (partial: Partial<CastSelection>) => void;
}

export const useCastSelection = ({
  currentItem,
  mediaStatus,
  reload,
}: UseCastSelectionParams): UseCastSelectionResult => {
  const [pending, setPending] = useState<CastSelection | null>(null);

  // Truth: the selection the cast reports as loaded, via customData.
  const truth =
    (
      mediaStatus?.mediaInfo?.customData as
        | { selection?: CastSelection }
        | undefined
    )?.selection ?? null;

  const currentSelection: CastSelection | null =
    pending ??
    truth ??
    (currentItem ? resolveSelection(currentItem, {}) : null);

  // A new media item invalidates any pending selection from the previous one.
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on item id only
  useEffect(() => {
    setPending(null);
  }, [currentItem?.Id]);

  // Reconcile: once the cast reports the pending selection as loaded, clear it.
  useEffect(() => {
    if (pending && truth && selectionsEqual(pending, truth)) {
      setPending(null);
    }
  }, [pending, truth]);

  const applySelection = useCallback(
    (partial: Partial<CastSelection>) => {
      if (!currentSelection) return;
      const next: CastSelection = { ...currentSelection, ...partial };
      setPending(next);
      reload(next).then((ok) => {
        if (!ok) setPending(null);
      });
    },
    [currentSelection, reload],
  );

  return { currentSelection, applySelection };
};
```

- [ ] **Step 2: Verify types**

Run: `bun run typecheck`
Expected: PASS — no errors.

- [ ] **Step 3: Commit**

```bash
git add hooks/useCastSelection.ts
git commit -m "feat(casting): add useCastSelection hook"
```

---

## Task 5: Expand the shared `BITRATES` ladder

**Files:**
- Modify: `components/BitrateSelector.tsx`

- [ ] **Step 1: Replace the `BITRATES` array**

In `components/BitrateSelector.tsx`, replace the entire `export const BITRATES: Bitrate[] = [ ... ];`
declaration (including its trailing `.sort(...)`) with:

```ts
export const BITRATES: Bitrate[] = [
  { key: "Max", value: undefined },
  { key: "200 Mb/s", value: 200000000 },
  { key: "180 Mb/s", value: 180000000 },
  { key: "140 Mb/s", value: 140000000 },
  { key: "120 Mb/s", value: 120000000 },
  { key: "110 Mb/s", value: 110000000 },
  { key: "100 Mb/s", value: 100000000 },
  { key: "90 Mb/s", value: 90000000 },
  { key: "80 Mb/s", value: 80000000 },
  { key: "70 Mb/s", value: 70000000 },
  { key: "60 Mb/s", value: 60000000 },
  { key: "50 Mb/s", value: 50000000 },
  { key: "40 Mb/s", value: 40000000 },
  { key: "30 Mb/s", value: 30000000 },
  { key: "20 Mb/s", value: 20000000 },
  { key: "15 Mb/s", value: 15000000 },
  { key: "10 Mb/s", value: 10000000 },
  { key: "8 Mb/s", value: 8000000 },
  { key: "5 Mb/s", value: 5000000 },
  { key: "4 Mb/s", value: 4000000 },
  { key: "3 Mb/s", value: 3000000 },
  { key: "2 Mb/s", value: 2000000 },
  { key: "1 Mb/s", value: 1000000 },
  { key: "720 Kb/s", value: 720000 },
  { key: "420 Kb/s", value: 420000 },
].sort(
  (a, b) =>
    (b.value || Number.POSITIVE_INFINITY) -
    (a.value || Number.POSITIVE_INFINITY),
);
```

> This drops the stray `height: 1080` properties on the old `8`/`4 Mb/s` entries —
> they were not part of the `Bitrate` type and are unused.

- [ ] **Step 2: Verify types and Biome**

Run: `bun run typecheck`
Expected: PASS — no errors.

Run: `bunx biome check components/BitrateSelector.tsx`
Expected: PASS — no errors on this file.

- [ ] **Step 3: Commit**

```bash
git add components/BitrateSelector.tsx
git commit -m "feat(player): expand shared BITRATES ladder"
```

---

## Task 6: Casting player & settings menu rework

**Files:**
- Modify: `components/chromecast/ChromecastSettingsMenu.tsx`
- Modify: `app/(auth)/casting-player.tsx`

This task is interdependent — `casting-player.tsx` passes the new props that
`ChromecastSettingsMenu.tsx` defines, so both change together. `bun run typecheck`
must be green only at the end (Step 5).

- [ ] **Step 1: Rewrite `ChromecastSettingsMenu.tsx`**

Replace the entire contents of `components/chromecast/ChromecastSettingsMenu.tsx` with:

```tsx
/**
 * Chromecast Settings Menu
 * Configure version, quality (bitrate cap), audio, subtitles, and playback speed.
 * Every "selected" row is driven by the active CastSelection — no [0] fallbacks.
 */

import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/components/common/Text";
import type { AudioTrack, SubtitleTrack } from "@/utils/casting/types";

export interface VersionOption {
  id: string;
  name: string;
}

export interface QualityOption {
  key: string;
  value: number | undefined;
}

interface ChromecastSettingsMenuProps {
  visible: boolean;
  onClose: () => void;
  versions: VersionOption[];
  selectedVersionId: string;
  onVersionChange: (id: string) => void;
  qualities: QualityOption[];
  selectedMaxBitrate: number | undefined;
  onQualityChange: (value: number | undefined) => void;
  audioTracks: AudioTrack[];
  selectedAudioIndex: number;
  onAudioChange: (index: number) => void;
  subtitleTracks: SubtitleTrack[];
  /** -1 = subtitles off. */
  selectedSubtitleIndex: number;
  onSubtitleChange: (index: number) => void;
  playbackSpeed: number;
  onPlaybackSpeedChange: (speed: number) => void;
}

const PLAYBACK_SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
const ACCENT = "#a855f7";

export const ChromecastSettingsMenu: React.FC<ChromecastSettingsMenuProps> = ({
  visible,
  onClose,
  versions,
  selectedVersionId,
  onVersionChange,
  qualities,
  selectedMaxBitrate,
  onQualityChange,
  audioTracks,
  selectedAudioIndex,
  onAudioChange,
  subtitleTracks,
  selectedSubtitleIndex,
  onSubtitleChange,
  playbackSpeed,
  onPlaybackSpeedChange,
}) => {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const [expandedSection, setExpandedSection] = useState<string | null>(null);

  const toggleSection = (section: string) => {
    setExpandedSection(expandedSection === section ? null : section);
  };

  const renderSectionHeader = (
    title: string,
    icon: keyof typeof Ionicons.glyphMap,
    sectionKey: string,
  ) => (
    <Pressable
      onPress={() => toggleSection(sectionKey)}
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: "#333",
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Ionicons name={icon} size={20} color='white' />
        <Text style={{ color: "white", fontSize: 16, fontWeight: "500" }}>
          {title}
        </Text>
      </View>
      <Ionicons
        name={expandedSection === sectionKey ? "chevron-up" : "chevron-down"}
        size={20}
        color='#999'
      />
    </Pressable>
  );

  const renderRow = (
    key: string | number,
    label: string,
    sublabel: string | null,
    selected: boolean,
    onPress: () => void,
  ) => (
    <Pressable
      key={key}
      onPress={() => {
        onPress();
        setExpandedSection(null);
      }}
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        padding: 16,
        backgroundColor: selected ? "#2a2a2a" : "transparent",
      }}
    >
      <View>
        <Text style={{ color: "white", fontSize: 15 }}>{label}</Text>
        {sublabel ? (
          <Text style={{ color: "#999", fontSize: 13, marginTop: 2 }}>
            {sublabel}
          </Text>
        ) : null}
      </View>
      {selected ? (
        <Ionicons name='checkmark' size={20} color={ACCENT} />
      ) : null}
    </Pressable>
  );

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType='slide'
      onRequestClose={onClose}
    >
      <Pressable
        style={{
          flex: 1,
          backgroundColor: "rgba(0, 0, 0, 0.85)",
          justifyContent: "flex-end",
        }}
        onPress={onClose}
      >
        <Pressable
          style={{
            backgroundColor: "#1a1a1a",
            borderTopLeftRadius: 16,
            borderTopRightRadius: 16,
            maxHeight: "80%",
            paddingBottom: insets.bottom,
          }}
          onPress={(e) => e.stopPropagation()}
        >
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              padding: 16,
              borderBottomWidth: 1,
              borderBottomColor: "#333",
            }}
          >
            <Text style={{ color: "white", fontSize: 18, fontWeight: "600" }}>
              {t("casting_player.playback_settings")}
            </Text>
            <Pressable onPress={onClose} style={{ padding: 8 }}>
              <Ionicons name='close' size={24} color='white' />
            </Pressable>
          </View>

          <ScrollView>
            {/* Version — only when the item has more than one MediaSource */}
            {versions.length > 1 &&
              renderSectionHeader(
                t("casting_player.version"),
                "albums-outline",
                "version",
              )}
            {versions.length > 1 && expandedSection === "version" && (
              <View style={{ paddingVertical: 8 }}>
                {versions.map((v) =>
                  renderRow(
                    v.id,
                    v.name,
                    null,
                    v.id === selectedVersionId,
                    () => onVersionChange(v.id),
                  ),
                )}
              </View>
            )}

            {/* Quality (bitrate cap) */}
            {renderSectionHeader(
              t("casting_player.quality"),
              "film-outline",
              "quality",
            )}
            {expandedSection === "quality" && (
              <View style={{ paddingVertical: 8 }}>
                {qualities.map((q) =>
                  renderRow(
                    q.key,
                    q.key,
                    null,
                    q.value === selectedMaxBitrate,
                    () => onQualityChange(q.value),
                  ),
                )}
              </View>
            )}

            {/* Audio — only when more than one track */}
            {audioTracks.length > 1 &&
              renderSectionHeader(
                t("casting_player.audio"),
                "musical-notes",
                "audio",
              )}
            {audioTracks.length > 1 && expandedSection === "audio" && (
              <View style={{ paddingVertical: 8 }}>
                {audioTracks.map((track) =>
                  renderRow(
                    track.index,
                    track.displayTitle ||
                      track.language ||
                      t("casting_player.unknown"),
                    track.codec ? track.codec.toUpperCase() : null,
                    track.index === selectedAudioIndex,
                    () => onAudioChange(track.index),
                  ),
                )}
              </View>
            )}

            {/* Subtitles */}
            {subtitleTracks.length > 0 &&
              renderSectionHeader(
                t("casting_player.subtitles"),
                "text",
                "subtitles",
              )}
            {subtitleTracks.length > 0 && expandedSection === "subtitles" && (
              <View style={{ paddingVertical: 8 }}>
                {renderRow(
                  "off",
                  t("casting_player.none"),
                  null,
                  selectedSubtitleIndex < 0,
                  () => onSubtitleChange(-1),
                )}
                {subtitleTracks.map((track) =>
                  renderRow(
                    track.index,
                    track.displayTitle ||
                      track.language ||
                      t("casting_player.unknown"),
                    [
                      track.codec ? track.codec.toUpperCase() : "",
                      track.isForced ? t("casting_player.forced") : "",
                    ]
                      .filter(Boolean)
                      .join(" • ") || null,
                    track.index === selectedSubtitleIndex,
                    () => onSubtitleChange(track.index),
                  ),
                )}
              </View>
            )}

            {/* Playback speed */}
            {renderSectionHeader(
              t("casting_player.playback_speed"),
              "speedometer",
              "speed",
            )}
            {expandedSection === "speed" && (
              <View style={{ paddingVertical: 8 }}>
                {PLAYBACK_SPEEDS.map((speed) =>
                  renderRow(
                    speed,
                    speed === 1 ? t("casting_player.normal") : `${speed}x`,
                    null,
                    Math.abs(playbackSpeed - speed) < 0.01,
                    () => onPlaybackSpeedChange(speed),
                  ),
                )}
              </View>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
};
```

> The new translation key `casting_player.version` is used. Add it to
> `translations/en.json` under the existing `casting_player` object, value
> `"Version"`. Do not touch other locale files — English is the source locale and
> the app falls back to it.

- [ ] **Step 2: Rework track state in `casting-player.tsx`**

In `app/(auth)/casting-player.tsx`:

**(a)** Add imports (alphabetical order among existing `@/` imports):

```ts
import { useCastSelection } from "@/hooks/useCastSelection";
import { BITRATES } from "@/components/BitrateSelector";
import { detectCapabilities } from "@/utils/casting/capabilities";
import { resolveSelection } from "@/utils/casting/selection";
import type { CastSelection } from "@/utils/casting/types";
```

**(b)** Remove the two track-index state declarations:

```ts
  const [selectedAudioTrackIndex, setSelectedAudioTrackIndex] = useState<
    number | null
  >(null);
  const [selectedSubtitleTrackIndex, setSelectedSubtitleTrackIndex] = useState<
    number | null
  >(null);
```

Keep `const [currentPlaybackSpeed, setCurrentPlaybackSpeed] = useState(1);`.

**(c)** Remove the entire `useEffect` block titled `// Initialize track selection
from server defaults when item data arrives` (it begins `useEffect(() => { if
(!fetchedItem) return; ...` and sets `setSelectedAudioTrackIndex` /
`setSelectedSubtitleTrackIndex`).

- [ ] **Step 3: Replace `reloadWithSettings` with `reloadWithSelection`**

In `casting-player.tsx`, replace the whole `const reloadWithSettings = useCallback(
... );` block with:

```tsx
  // Reload the cast stream with a full selection; resolves true on success.
  const reloadWithSelection = useCallback(
    async (selection: CastSelection): Promise<boolean> => {
      if (!api || !user?.Id || !currentItem?.Id || !remoteMediaClient) {
        console.warn("[Casting Player] Cannot reload - missing required data");
        return false;
      }
      const currentPosition = mediaStatus?.streamPosition ?? 0;
      const result = await loadCastMedia({
        client: remoteMediaClient,
        device: castDevice,
        api,
        item: currentItem,
        userId: user.Id,
        profileMode: settings.chromecastProfile,
        maxBitrateSetting: settings.chromecastMaxBitrate,
        options: {
          mediaSourceId: selection.mediaSourceId,
          audioStreamIndex: selection.audioStreamIndex,
          subtitleStreamIndex: selection.subtitleStreamIndex,
          maxBitrate: selection.maxBitrate,
          startPositionMs: currentPosition * 1000,
        },
      });
      if (!result.ok) {
        console.error(
          "[Casting Player] Failed to reload stream:",
          result.error,
        );
        return false;
      }
      return true;
    },
    [
      api,
      user?.Id,
      currentItem,
      remoteMediaClient,
      castDevice,
      mediaStatus?.streamPosition,
      settings.chromecastProfile,
      settings.chromecastMaxBitrate,
    ],
  );

  const { currentSelection, applySelection } = useCastSelection({
    currentItem,
    mediaStatus,
    reload: reloadWithSelection,
  });
```

- [ ] **Step 4: Update `loadEpisode`, the track memos, and the menu JSX**

**(a)** In `loadEpisode`, remove these two lines (after the `if (!result.ok)` block):

```ts
        setSelectedAudioTrackIndex(null);
        setSelectedSubtitleTrackIndex(null);
```

(`useCastSelection` resets on item change — no manual reset needed.)

**(b)** Replace the `availableMediaSources` `useMemo` block entirely with these three
memos:

```tsx
  // The MediaSource currently selected, for deriving its tracks.
  const selectedSource = useMemo(
    () =>
      currentItem?.MediaSources?.find(
        (s) => s.Id === currentSelection?.mediaSourceId,
      ) ??
      currentItem?.MediaSources?.[0] ??
      null,
    [currentItem?.MediaSources, currentSelection?.mediaSourceId],
  );

  // Real alternate versions (multi-version items).
  const availableVersions = useMemo(
    () =>
      (currentItem?.MediaSources ?? []).map((s, i) => ({
        id: s.Id ?? `source-${i}`,
        name: s.Name || `${t("casting_player.version")} ${i + 1}`,
      })),
    [currentItem?.MediaSources, t],
  );

  // Quality tiers from the shared ladder, capped to BOTH the device's
  // capability and the media's own bitrate — a tier above either ceiling
  // would behave identically to "Max", so it is not offered.
  const availableQualities = useMemo(() => {
    const caps = detectCapabilities(castDevice, {
      profileMode: settings.chromecastProfile,
      maxBitrate: settings.chromecastMaxBitrate,
    });
    const mediaBitrate =
      selectedSource?.Bitrate ??
      currentItem?.MediaStreams?.find((s) => s.Type === "Video")?.BitRate ??
      Number.POSITIVE_INFINITY;
    const ceiling = Math.min(caps.maxVideoBitrate, mediaBitrate);
    return BITRATES.filter(
      (b) => b.value === undefined || b.value <= ceiling,
    );
  }, [
    castDevice,
    settings.chromecastProfile,
    settings.chromecastMaxBitrate,
    selectedSource,
    currentItem?.MediaStreams,
  ]);
```

**(c)** Replace the `availableAudioTracks` and `availableSubtitleTracks` `useMemo`
blocks entirely with (they now derive from the selected version's streams):

```tsx
  const availableAudioTracks = useMemo(() => {
    const streams = selectedSource?.MediaStreams ?? currentItem?.MediaStreams;
    if (!streams) return [];
    return streams
      .filter((stream) => stream.Type === "Audio")
      .map((stream) => ({
        index: stream.Index ?? 0,
        language: stream.Language || "Unknown",
        displayTitle:
          stream.DisplayTitle ||
          `${stream.Language || "Unknown"} ${stream.Codec || ""}`.trim(),
        codec: stream.Codec || "Unknown",
        channels: stream.Channels,
        bitrate: stream.BitRate,
      }));
  }, [selectedSource, currentItem?.MediaStreams]);

  const availableSubtitleTracks = useMemo(() => {
    const streams = selectedSource?.MediaStreams ?? currentItem?.MediaStreams;
    if (!streams) return [];
    return streams
      .filter((stream) => stream.Type === "Subtitle")
      .map((stream) => ({
        index: stream.Index ?? 0,
        language: stream.Language || "Unknown",
        displayTitle:
          stream.DisplayTitle ||
          [
            stream.Language || "Unknown",
            stream.IsForced ? " (Forced)" : "",
            stream.Title ? ` - ${stream.Title}` : "",
          ].join(""),
        codec: stream.Codec || "Unknown",
        isForced: stream.IsForced || false,
        isExternal: stream.IsExternal || false,
      }));
  }, [selectedSource, currentItem?.MediaStreams]);
```

**(d)** Replace the entire `<ChromecastSettingsMenu ... />` element with:

```tsx
          <ChromecastSettingsMenu
            visible={showSettings}
            onClose={() => setShowSettings(false)}
            versions={availableVersions}
            selectedVersionId={currentSelection?.mediaSourceId ?? ""}
            onVersionChange={(id) => {
              if (!currentItem) return;
              applySelection(resolveSelection(currentItem, { mediaSourceId: id }));
            }}
            qualities={availableQualities}
            selectedMaxBitrate={currentSelection?.maxBitrate}
            onQualityChange={(value) => applySelection({ maxBitrate: value })}
            audioTracks={availableAudioTracks}
            selectedAudioIndex={currentSelection?.audioStreamIndex ?? -1}
            onAudioChange={(index) =>
              applySelection({ audioStreamIndex: index })
            }
            subtitleTracks={availableSubtitleTracks}
            selectedSubtitleIndex={currentSelection?.subtitleStreamIndex ?? -1}
            onSubtitleChange={(index) =>
              applySelection({ subtitleStreamIndex: index })
            }
            playbackSpeed={currentPlaybackSpeed}
            onPlaybackSpeedChange={(speed) => {
              setCurrentPlaybackSpeed(speed);
              remoteMediaClient?.setPlaybackRate(speed).catch(console.error);
            }}
          />
```

- [ ] **Step 5: Verify types, tests and Biome**

Run: `bun run typecheck`
Expected: PASS — no errors.

> If typecheck flags an unused symbol (e.g. a now-unused `useState` import, or
> `fetchedItem` if the removed init effect was its only use), remove the dead
> reference. If it flags a leftover `reloadWithSettings` / `selectedAudioTrackIndex`
> reference, that line was missed in Steps 2-4 — find and rework it.

Run: `bun test utils/casting/`
Expected: PASS — all suites pass.

Run: `bunx biome check "app/(auth)/casting-player.tsx" components/chromecast/ChromecastSettingsMenu.tsx translations/en.json`
Expected: PASS — no errors on these files.

- [ ] **Step 6: Commit**

```bash
git add "app/(auth)/casting-player.tsx" components/chromecast/ChromecastSettingsMenu.tsx translations/en.json
git commit -m "feat(casting): reliable track switching with CastSelection truth"
```

---

## Final verification

- [ ] **Run the full check suite**

Run: `bun test utils/casting/`
Expected: PASS — `selection`, `buildProfile`, `capabilities`, `castErrors` suites all pass.

Run: `bun run typecheck`
Expected: PASS — no errors.

- [ ] **Manual verification**

Cast a multi-audio episode to the Chromecast HD:
- The audio menu's checkmark matches the language actually playing.
- Switch audio → after the reload, the menu reflects the new track and it plays.
- Switch subtitle, quality, and (on a multi-version movie) version — each reflects
  and applies.
- Change episode → the menu shows the new episode's real default tracks (no
  Japanese/French desync).
- Leave the casting player and re-enter → the selection display is still correct.

---

## Notes for the implementer

- **Line numbers drift.** Match on quoted code, not line numbers.
- **`bun test`** is Bun's built-in runner. `selection.ts` is pure (type-only imports)
  so its test runs cleanly. Do not add a test that imports `castLoad.ts` or
  `useCastSelection.ts` — they pull React Native modules the runner cannot load.
- **Out of scope:** subtitle rendering / styling / sidecar VTT (custom-receiver
  sub-project), the `casting-player.tsx` file split (sub-project C), the remote
  control panel (sub-project D). Do not start them.
- Speed is intentionally not part of `CastSelection` — it is a live Cast playback
  rate (`setPlaybackRate`), not a stream-reload property.
- **Known duplication (do not fix here):** `BITRATES` / `Bitrate` are defined twice
  — in `components/BitrateSelector.tsx` (the live one, imported by the native player
  and settings) and a stale near-copy in `components/BitRateSheet.tsx`. Task 5 edits
  only `BitrateSelector.tsx`. Removing the duplicate is out of scope for sub-project
  B — flag it for a later cleanup.

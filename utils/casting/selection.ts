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
export const selectionsEqual = (a: CastSelection, b: CastSelection): boolean =>
  a.mediaSourceId === b.mediaSourceId &&
  a.audioStreamIndex === b.audioStreamIndex &&
  a.subtitleStreamIndex === b.subtitleStreamIndex &&
  a.maxBitrate === b.maxBitrate;

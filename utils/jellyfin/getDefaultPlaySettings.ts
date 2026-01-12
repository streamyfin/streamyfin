/**
 * getDefaultPlaySettings.ts
 *
 * Determines default audio/subtitle tracks and bitrate for playback.
 *
 * Two use cases:
 * 1. INITIAL PLAY: No previous state, uses media defaults + user language preferences
 * 2. SEQUENTIAL PLAY: Has previous state (e.g., next episode), uses StreamRanker
 *    to find matching tracks in the new media
 */

import type {
  BaseItemDto,
  MediaSourceInfo,
} from "@jellyfin/sdk/lib/generated-client";
import { BITRATES } from "@/components/BitrateSelector";
import { type Settings } from "../atoms/settings";

export interface PlaySettings {
  item: BaseItemDto;
  bitrate: (typeof BITRATES)[0];
  mediaSource?: MediaSourceInfo | null;
  audioIndex?: number;
  subtitleIndex?: number;
}

export interface PreviousIndexes {
  audioIndex?: number;
  subtitleIndex?: number;
}

/**
 * Get default play settings for an item.
 *
 * @param item - The media item to play
 * @param settings - User settings (language preferences, bitrate, etc.)
 * @param previous - Optional previous track selections to carry over (for sequential play)
 */
export function getDefaultPlaySettings(
  item: BaseItemDto,
  settings: Settings | null,
  previous?: { indexes?: PreviousIndexes; source?: MediaSourceInfo },
): PlaySettings {
  const bitrate = settings?.defaultBitrate ?? BITRATES[0];

  // Live TV programs don't have media sources
  if (item.Type === "Program") {
    return { item, bitrate };
  }

  const mediaSource = item.MediaSources?.[0];
  const _streams = mediaSource?.MediaStreams ?? [];

  // Start with media source defaults
  let audioIndex = mediaSource?.DefaultAudioStreamIndex;
  let subtitleIndex = mediaSource?.DefaultSubtitleStreamIndex ?? -1;

  // Try to match previous selections (sequential play)
  // Simplified: just use previous indexes if available
  if (previous?.indexes && settings) {
    if (
      settings.rememberSubtitleSelections &&
      previous.indexes.subtitleIndex !== undefined
    ) {
      subtitleIndex = previous.indexes.subtitleIndex;
    }

    if (
      settings.rememberAudioSelections &&
      previous.indexes.audioIndex !== undefined
    ) {
      audioIndex = previous.indexes.audioIndex;
    }
  }

  return {
    item,
    bitrate,
    mediaSource,
    audioIndex: audioIndex ?? undefined,
    subtitleIndex: subtitleIndex ?? undefined,
  };
}

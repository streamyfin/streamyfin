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
import {
  AudioStreamRanker,
  StreamRanker,
  SubtitleStreamRanker,
} from "../streamRanker";

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
  const streams = mediaSource?.MediaStreams ?? [];

  // Start with media source defaults
  let audioIndex = mediaSource?.DefaultAudioStreamIndex;
  let subtitleIndex = mediaSource?.DefaultSubtitleStreamIndex ?? -1;

  // Try to match previous selections (sequential play)
  if (previous?.indexes && previous?.source && settings) {
    if (
      settings.rememberSubtitleSelections &&
      previous.indexes.subtitleIndex !== undefined
    ) {
      const ranker = new StreamRanker(new SubtitleStreamRanker());
      const result = { DefaultSubtitleStreamIndex: subtitleIndex };
      ranker.rankStream(
        previous.indexes.subtitleIndex,
        previous.source,
        streams,
        result,
      );
      subtitleIndex = result.DefaultSubtitleStreamIndex;
    }

    if (
      settings.rememberAudioSelections &&
      previous.indexes.audioIndex !== undefined
    ) {
      const ranker = new StreamRanker(new AudioStreamRanker());
      const result = { DefaultAudioStreamIndex: audioIndex };
      ranker.rankStream(
        previous.indexes.audioIndex,
        previous.source,
        streams,
        result,
      );
      audioIndex = result.DefaultAudioStreamIndex;
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

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
  MediaStream,
} from "@jellyfin/sdk/lib/generated-client";
import { SubtitlePlaybackMode } from "@jellyfin/sdk/lib/generated-client";
import { BITRATES } from "@/components/BitrateSelector";
import { langEq } from "@/utils/jellyfin/subtitleUtils";
import { getSeriesTrackMemory } from "@/utils/seriesTrackMemory";
import { type Settings } from "../atoms/settings";
import {
  AudioStreamRanker,
  StreamRanker,
  SubtitleStreamRanker,
} from "../streamRanker";
import { ORIGINAL_LANGUAGE } from "./serverVersion";

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
 * Find a track by language code.
 *
 * Comparison goes through {@link langEq} rather than string equality: the stored
 * preference is a Jellyfin CultureDto code (.NET-style 639-2/T — "deu", "fra",
 * "swe") while MediaStreams carry 639-2/B ("ger", "fre") or bare 639-1 ("de",
 * "sv"). The previous `substring(0, 2)` fallback was not a language mapping at
 * all — it turned "swe" into "sw", which is Swahili, so a Swedish preference
 * matched Swahili tracks and missed "sv"-tagged Swedish ones.
 *
 * @param forcedOnly - If true, only match forced subtitles
 */
function findTrackByLanguage(
  streams: MediaStream[],
  languageCode: string | undefined,
  streamType: "Audio" | "Subtitle",
  forcedOnly = false,
): number | undefined {
  if (!languageCode) return undefined;

  const candidates = streams.filter((s) => {
    if (s.Type !== streamType) return false;
    if (forcedOnly && !s.IsForced) return false;
    return langEq(s.Language, languageCode);
  });

  // Prefer default track if multiple match
  const defaultTrack = candidates.find((s) => s.IsDefault);
  return defaultTrack?.Index ?? candidates[0]?.Index;
}

/**
 * Apply subtitle mode logic to determine the final subtitle index.
 *
 * @param streams - Available media streams
 * @param settings - User settings containing subtitleMode
 * @param defaultIndex - The current default subtitle index
 * @param audioLanguage - The selected audio track's language (for Smart mode)
 * @param subtitleLanguageCode - The user's preferred subtitle language
 * @returns The final subtitle index (-1 for disabled)
 */
function applySubtitleMode(
  streams: MediaStream[],
  settings: Settings,
  defaultIndex: number,
  audioLanguage: string | undefined,
  subtitleLanguageCode: string | undefined,
): number {
  const subtitleStreams = streams.filter((s) => s.Type === "Subtitle");
  const mode = settings.subtitleMode ?? SubtitlePlaybackMode.Default;

  switch (mode) {
    case SubtitlePlaybackMode.None:
      // Always disable subtitles
      return -1;

    case SubtitlePlaybackMode.OnlyForced: {
      // Only show forced subtitles, prefer matching language
      const forcedMatch = findTrackByLanguage(
        streams,
        subtitleLanguageCode,
        "Subtitle",
        true,
      );
      if (forcedMatch !== undefined) return forcedMatch;
      // Fallback to any forced subtitle
      const anyForced = subtitleStreams.find((s) => s.IsForced);
      return anyForced?.Index ?? -1;
    }

    case SubtitlePlaybackMode.Always: {
      // Always enable subtitles, prefer language match
      const alwaysMatch = findTrackByLanguage(
        streams,
        subtitleLanguageCode,
        "Subtitle",
      );
      if (alwaysMatch !== undefined) return alwaysMatch;
      // Fallback to first available or current default
      return subtitleStreams[0]?.Index ?? defaultIndex;
    }

    case SubtitlePlaybackMode.Smart: {
      // Enable subtitles only when audio language differs from subtitle preference
      if (audioLanguage && subtitleLanguageCode) {
        const audioLang = audioLanguage.toLowerCase();
        const subLang = subtitleLanguageCode.toLowerCase();
        // If audio matches subtitle preference, disable subtitles
        if (
          audioLang === subLang ||
          audioLang.startsWith(subLang.substring(0, 2)) ||
          subLang.startsWith(audioLang.substring(0, 2))
        ) {
          return -1;
        }
      }
      // Audio doesn't match preference, enable subtitles
      const smartMatch = findTrackByLanguage(
        streams,
        subtitleLanguageCode,
        "Subtitle",
      );
      return smartMatch ?? subtitleStreams[0]?.Index ?? -1;
    }
    default:
      // Use language preference if set, else keep Jellyfin default
      if (subtitleLanguageCode) {
        const langMatch = findTrackByLanguage(
          streams,
          subtitleLanguageCode,
          "Subtitle",
        );
        if (langMatch !== undefined) return langMatch;
      }
      return defaultIndex;
  }
}

/**
 * Get default play settings for an item.
 *
 * @param item - The media item to play
 * @param settings - User settings (language preferences, bitrate, etc.)
 * @param previous - Optional previous track selections to carry over (for sequential play)
 */
export function getDefaultPlaySettings(
  item: BaseItemDto | null | undefined,
  settings: Settings | null,
  previous?: { indexes?: PreviousIndexes; source?: MediaSourceInfo },
): PlaySettings {
  const bitrate = settings?.defaultBitrate ?? BITRATES[0];

  // Handle undefined/null item
  if (!item) {
    return { item: {} as BaseItemDto, bitrate };
  }

  // Live TV programs don't have media sources
  if (item.Type === "Program") {
    return { item, bitrate };
  }

  const mediaSource = item.MediaSources?.[0];
  const streams = mediaSource?.MediaStreams ?? [];

  // Start with media source defaults
  let audioIndex = mediaSource?.DefaultAudioStreamIndex;
  let subtitleIndex = mediaSource?.DefaultSubtitleStreamIndex ?? -1;

  // Track whether we matched previous selections (for language preference fallback)
  let matchedPreviousAudio = false;
  let matchedPreviousSubtitle = false;

  // Try to match previous selections (sequential play)
  if (previous?.indexes && previous?.source && settings) {
    if (
      settings.rememberSubtitleSelections &&
      previous.indexes.subtitleIndex !== undefined
    ) {
      const ranker = new StreamRanker(new SubtitleStreamRanker());
      const result = {
        DefaultSubtitleStreamIndex: subtitleIndex,
        matched: false,
      };
      ranker.rankStream(
        previous.indexes.subtitleIndex,
        previous.source,
        streams,
        result,
      );
      // Use the ranker's explicit match signal — this also covers a deliberate
      // "subtitles off" (-1) and the case where the match equals the default.
      if (result.matched) {
        subtitleIndex = result.DefaultSubtitleStreamIndex;
        matchedPreviousSubtitle = true;
      }
    }

    if (
      settings.rememberAudioSelections &&
      previous.indexes.audioIndex !== undefined
    ) {
      const ranker = new StreamRanker(new AudioStreamRanker());
      const result = { DefaultAudioStreamIndex: audioIndex, matched: false };
      ranker.rankStream(
        previous.indexes.audioIndex,
        previous.source,
        streams,
        result,
      );
      // Use the ranker's explicit match signal
      if (result.matched) {
        audioIndex = result.DefaultAudioStreamIndex;
        matchedPreviousAudio = true;
      }
    }
  }

  // Per-series memory: a track deliberately picked in the player is stored
  // by language per series and beats server defaults on a fresh session.
  // The sequential-play carry-over above is fresher and wins when it matched.
  if (item.Type === "Episode" && item.SeriesId && settings) {
    const memory = getSeriesTrackMemory(item.SeriesId);
    if (memory) {
      if (
        settings.rememberAudioSelections &&
        !matchedPreviousAudio &&
        memory.audioLang
      ) {
        const match = findTrackByLanguage(streams, memory.audioLang, "Audio");
        if (match !== undefined) {
          audioIndex = match;
          matchedPreviousAudio = true;
        }
      }
      if (settings.rememberSubtitleSelections && !matchedPreviousSubtitle) {
        if (memory.subtitleLang === "off") {
          subtitleIndex = -1;
          matchedPreviousSubtitle = true;
        } else if (memory.subtitleLang) {
          const match = findTrackByLanguage(
            streams,
            memory.subtitleLang,
            "Subtitle",
          );
          if (match !== undefined) {
            subtitleIndex = match;
            matchedPreviousSubtitle = true;
          }
        }
      }
    }
  }

  // Language preferences + subtitle mode, applied on every path.
  //
  // This used to be opt-in per caller, and the callers disagreed: the item pages
  // and the mobile next-episode handler passed the flag while every TV and
  // native-player next-episode handler did not. The result was that advancing an
  // episode on Apple TV kept the *server's* DefaultSubtitleStreamIndex — which
  // comes from the server-side user profile, a different setting the user likely
  // never touched — and could land on a track in an unrelated language while the
  // same show on the phone resolved correctly.
  //
  // Unconditional is safe: with no preference set and subtitleMode Default, both
  // blocks below are no-ops, so only users who configured a preference see any
  // change. The carry-over still wins where it matched (the matched* guards).
  if (settings) {
    const preferredAudioLanguage =
      settings.defaultAudioLanguage?.ThreeLetterISOLanguageName ?? undefined;
    // The original-language preference is not an ISO code: the server already
    // resolved it into DefaultAudioStreamIndex, so leave that choice alone
    // instead of matching the sentinel against the stream languages.
    const audioLanguageCode =
      preferredAudioLanguage === ORIGINAL_LANGUAGE
        ? undefined
        : preferredAudioLanguage;
    const subtitleLanguageCode =
      settings.defaultSubtitleLanguage?.ThreeLetterISOLanguageName ?? undefined;

    // Apply audio language preference if no previous selection matched
    if (!matchedPreviousAudio && audioLanguageCode) {
      const langMatch = findTrackByLanguage(
        streams,
        audioLanguageCode,
        "Audio",
      );
      if (langMatch !== undefined) {
        audioIndex = langMatch;
      }
    }

    // Get the selected audio track's language for Smart mode
    const selectedAudioTrack = streams.find(
      (s) => s.Type === "Audio" && s.Index === audioIndex,
    );
    const selectedAudioLanguage =
      selectedAudioTrack?.Language ??
      selectedAudioTrack?.DisplayTitle ??
      undefined;

    // Apply subtitle mode logic if no previous selection matched
    if (!matchedPreviousSubtitle) {
      subtitleIndex = applySubtitleMode(
        streams,
        settings,
        subtitleIndex,
        selectedAudioLanguage,
        subtitleLanguageCode,
      );
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

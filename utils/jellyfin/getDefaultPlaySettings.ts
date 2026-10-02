/**
 * getDefaultPlaySettings.ts
 *
 * Determines default audio/subtitle tracks and bitrate for playback.
 *
 * Two use cases:
 * 1. INITIAL PLAY: Server defaults, with scoped identities for new episodes/offline files
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
import type { DownloadedItem } from "@/providers/Downloads/types";
import { langEq } from "@/utils/jellyfin/subtitleUtils";
import {
  getItemTrackMemory,
  getSeriesTrackMemory,
  type RememberedTrack,
} from "@/utils/seriesTrackMemory";
import { buildAudioMenu, buildSubtitleMenu } from "@/utils/subtitles/trackMenu";
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
  /** Explicit soundtrack selection to carry to another file. */
  audioIndex?: number;
  /** Explicit subtitle selection, including -1 for off. */
  subtitleIndex?: number;
}

/** Pinned choices and file shape recorded when a download was created. */
export type DownloadedTrackIndexes = Partial<DownloadedItem["userData"]>;

/** Context needed for carry-over or local-file resolution, without player-specific state. */
export interface PlaySettingsOptions {
  /** Previous episode's deliberate selections. */
  indexes?: PreviousIndexes;
  /** Previous source used to identify those selections. */
  source?: MediaSourceInfo;
  /** Authenticated server/user cache namespace. */
  memoryScope?: string;
  /** Resolve against a downloaded file rather than server metadata. */
  offline?: boolean;
  /** Track indexes and transcoding status pinned in the download record. */
  downloaded?: DownloadedTrackIndexes | null;
  /** Actual downloaded source; the server item's sources are not valid offline. */
  downloadedMediaSource?: MediaSourceInfo;
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

/** Match either track kind using its identity; indexes only break ties in the same file. */
function matchRememberedTrack(
  selection: RememberedTrack,
  kind: "audio" | "subtitle",
  streams: MediaStream[],
  preferSameIndex = false,
): number | undefined {
  const strategy =
    kind === "audio" ? new AudioStreamRanker() : new SubtitleStreamRanker();
  return (
    new StreamRanker(strategy).findMatchingStream(
      selection.stream,
      streams,
      preferSameIndex,
    )?.Index ?? undefined
  );
}

/**
 * Local identities apply to offline files and new episodes. Online replay is
 * owned by Jellyfin, so a stale local cache never replaces its remembered choice.
 */
export function getRememberedTrackIndexes(
  item: BaseItemDto,
  settings: Settings | null,
  options: PlaySettingsOptions = {},
): PreviousIndexes {
  const hasPlaybackHistory =
    (item.UserData?.PlayCount ?? 0) > 0 ||
    (item.UserData?.PlaybackPositionTicks ?? 0) > 0 ||
    !!item.UserData?.LastPlayedDate;
  if (
    !options.offline &&
    (item.Type !== "Episode" || !item.SeriesId || hasPlaybackHistory)
  )
    return {};

  const memory = options.offline
    ? getItemTrackMemory(item.Id ?? "", options.memoryScope)
    : getSeriesTrackMemory(item.SeriesId ?? "", options.memoryScope);
  if (!memory) return {};
  const source = options.offline
    ? options.downloadedMediaSource
    : item.MediaSources?.[0];
  const streams = source?.MediaStreams ?? [];
  let audioStreams = streams;
  let subtitleStreams = streams;
  let canDisableSubtitles = true;
  if (options.offline) {
    const isTranscoded =
      options.downloaded?.isTranscoded ?? !!source?.TranscodingUrl;
    audioStreams = buildAudioMenu(streams, {
      selectedIndex: options.downloaded?.audioStreamIndex,
      isTranscoding: isTranscoded,
      offlineTranscoded: isTranscoded,
    }).flatMap((row) => (row.stream ? [row.stream] : []));
    const rows = buildSubtitleMenu(streams, {
      selectedIndex: options.downloaded?.subtitleStreamIndex ?? -1,
      offLabel: "",
      isTranscoding: isTranscoded,
      ...(isTranscoded && {
        offlineTranscoded: {
          burnedInIndex: options.downloaded?.subtitleStreamIndex,
        },
      }),
    });
    subtitleStreams = rows
      .filter((row) => row.kind === "server")
      .flatMap((row) => (row.stream ? [row.stream] : []));
    canDisableSubtitles = rows.some((row) => row.kind === "off");
  }
  const result: PreviousIndexes = {};
  if (settings?.rememberAudioSelections && memory.audio) {
    result.audioIndex = matchRememberedTrack(
      memory.audio,
      "audio",
      audioStreams,
      !!options.offline && memory.audio.mediaSourceId === source?.Id,
    );
  }
  if (settings?.rememberSubtitleSelections && memory.subtitle) {
    if (memory.subtitle === "off") {
      if (canDisableSubtitles) result.subtitleIndex = -1;
    } else {
      result.subtitleIndex = matchRememberedTrack(
        memory.subtitle,
        "subtitle",
        subtitleStreams,
        !!options.offline && memory.subtitle.mediaSourceId === source?.Id,
      );
    }
  }
  return result;
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
        // If audio matches subtitle preference, disable subtitles
        if (langEq(audioLanguage, subtitleLanguageCode)) {
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
  previous: PlaySettingsOptions = {},
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

  const mediaSource = previous.offline
    ? previous.downloadedMediaSource
    : item.MediaSources?.[0];
  const streams = mediaSource?.MediaStreams ?? [];

  // Start with media source defaults
  let audioIndex = mediaSource?.DefaultAudioStreamIndex;
  let subtitleIndex = mediaSource?.DefaultSubtitleStreamIndex ?? -1;
  if (previous.offline) {
    audioIndex = previous.downloaded?.audioStreamIndex ?? audioIndex;
    subtitleIndex = previous.downloaded?.subtitleStreamIndex ?? subtitleIndex;
  }

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

  const remembered = getRememberedTrackIndexes(item, settings, previous);
  if (!matchedPreviousAudio && remembered.audioIndex !== undefined) {
    audioIndex = remembered.audioIndex;
    matchedPreviousAudio = true;
  }
  if (!matchedPreviousSubtitle && remembered.subtitleIndex !== undefined) {
    subtitleIndex = remembered.subtitleIndex;
    matchedPreviousSubtitle = true;
  }

  // Preferences are a display/download fallback only when the server did not
  // provide a choice. Never override Jellyfin's remembered online defaults.
  if (settings && !previous.offline) {
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
    if (
      !matchedPreviousAudio &&
      mediaSource?.DefaultAudioStreamIndex == null &&
      audioLanguageCode
    ) {
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
    if (
      !matchedPreviousSubtitle &&
      mediaSource?.DefaultSubtitleStreamIndex == null
    ) {
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

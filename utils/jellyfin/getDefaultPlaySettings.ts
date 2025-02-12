// utils/getDefaultPlaySettings.ts
import { BITRATES } from "@/components/BitrateSelector";
import {
  BaseItemDto,
  MediaSourceInfo,
} from "@jellyfin/sdk/lib/generated-client";
import { Settings, useSettings } from "../atoms/settings";
import {
  AudioStreamRanker,
  StreamRanker,
  SubtitleStreamRanker,
} from "../streamRanker";

interface PlaySettings {
  item: BaseItemDto;
  bitrate: (typeof BITRATES)[0];
  mediaSource?: MediaSourceInfo | null;
  audioIndex?: number | undefined;
  subtitleIndex?: number | undefined;
}

export interface previousIndexes {
  audioIndex?: number;
  subtitleIndex?: number;
}

interface TrackOptions {
  DefaultAudioStreamIndex: number | undefined;
  DefaultSubtitleStreamIndex: number | undefined;
}

// Used getting default values for the next player.
export function getDefaultPlaySettings(
  item: BaseItemDto,
  settings: Settings,
  previousIndexes?: previousIndexes,
  previousSource?: MediaSourceInfo
): PlaySettings {
  if (item.Type === "Program") {
    return {
      item,
      bitrate: BITRATES[0],
      mediaSource: undefined,
      audioIndex: undefined,
      subtitleIndex: undefined,
    };
  }

  // 1. Get first media source

  const mediaSource = item.MediaSources?.[0];

  // 2. Get default or preferred audio
  const defaultAudioIndex = mediaSource?.DefaultAudioStreamIndex;
  const preferedAudioIndex = mediaSource?.MediaStreams?.find(
    (x) => x.Type === "Audio" && x.Language === settings?.defaultAudioLanguage
  )?.Index;
  const firstAudioIndex = mediaSource?.MediaStreams?.find(
    (x) => x.Type === "Audio"
  )?.Index;

  // We prefer the previous track over the default track.
  let trackOptions: TrackOptions = {
    DefaultAudioStreamIndex: defaultAudioIndex ?? -1,
    DefaultSubtitleStreamIndex: mediaSource?.DefaultSubtitleStreamIndex ?? -1,
  };

  const mediaStreams = mediaSource?.MediaStreams ?? [];
  if (settings?.rememberSubtitleSelections && previousIndexes) {
    if (previousIndexes.subtitleIndex !== undefined && previousSource) {
      const subtitleRanker = new SubtitleStreamRanker();
      const ranker = new StreamRanker(subtitleRanker);
      ranker.rankStream(
        previousIndexes.subtitleIndex,
        previousSource,
        mediaStreams,
        trackOptions
      );
    }
  }

  if (settings?.rememberAudioSelections && previousIndexes) {
    if (previousIndexes.audioIndex !== undefined && previousSource) {
      const audioRanker = new AudioStreamRanker();
      const ranker = new StreamRanker(audioRanker);
      ranker.rankStream(
        previousIndexes.audioIndex,
        previousSource,
        mediaStreams,
        trackOptions
      );
    }
  }

  // 4. Get default bitrate from settings or fallback to max
  const bitrate = settings.defaultBitrate ?? BITRATES[0];

  return {
    item,
    bitrate,
    mediaSource,
    audioIndex: trackOptions.DefaultAudioStreamIndex,
    subtitleIndex: trackOptions.DefaultSubtitleStreamIndex,
  };
}

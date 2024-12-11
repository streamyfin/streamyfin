// utils/getDefaultPlaySettings.ts
import { BITRATES } from "@/components/BitrateSelector";
import {
  BaseItemDto,
  MediaSourceInfo,
} from "@jellyfin/sdk/lib/generated-client";
import { Settings, useSettings } from "../atoms/settings";
import { StreamRanker, SubtitleStreamRanker } from "../streamRanker";

interface PlaySettings {
  item: BaseItemDto;
  bitrate: (typeof BITRATES)[0];
  mediaSource?: MediaSourceInfo | null;
  audioIndex?: number | undefined;
  subtitleIndex?: number | undefined;
}

// Used getting default values for the next player.
export function getDefaultPlaySettings(
  item: BaseItemDto,
  settings: Settings,
  previousIndex?: number,
  previousItem?: BaseItemDto,
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
  let trackOptions = {};
  const mediaStreams = mediaSource?.MediaStreams ?? [];
  if (settings?.rememberSubtitleSelections) {
    if (previousIndex !== undefined && previousSource) {
      const subtitleRanker = new SubtitleStreamRanker();
      const ranker = new StreamRanker(subtitleRanker);
      ranker.rankStream(
        previousIndex,
        previousSource,
        mediaStreams,
        trackOptions
      );
    }
  }

  const finalSubtitleIndex = mediaSource?.DefaultAudioStreamIndex;

  // 4. Get default bitrate
  const bitrate = BITRATES.sort(
    (a, b) => (b.value || Infinity) - (a.value || Infinity)
  )[0];

  return {
    item,
    bitrate,
    mediaSource,
    audioIndex: preferedAudioIndex ?? defaultAudioIndex ?? firstAudioIndex,
    subtitleIndex: finalSubtitleIndex || -1,
  };
}

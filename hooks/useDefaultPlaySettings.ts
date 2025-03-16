import { BITRATES, Bitrate } from "@/components/BitrateSelector";
import type { Settings } from "@/utils/atoms/settings";
import {
  type BaseItemDto,
  MediaSourceInfo,
} from "@jellyfin/sdk/lib/generated-client";
import { useMemo } from "react";

// Used only for initial play settings.
const useDefaultPlaySettings = (
  item: BaseItemDto,
  settings: Settings | null,
) => {
  const playSettings = useMemo(() => {
    // 1. Get first media source
    const mediaSource = item.MediaSources?.[0];

    // 2. Get default or preferred audio
    const defaultAudioIndex = mediaSource?.DefaultAudioStreamIndex;
    const preferedAudioIndex = mediaSource?.MediaStreams?.find(
      (x) =>
        x.Type === "Audio" &&
        x.Language ===
          settings?.defaultAudioLanguage?.ThreeLetterISOLanguageName,
    )?.Index;

    const firstAudioIndex = mediaSource?.MediaStreams?.find(
      (x) => x.Type === "Audio",
    )?.Index;

    // 4. Get default bitrate from settings or fallback to max
    const bitrate = settings?.defaultBitrate ?? BITRATES[0];

    return {
      defaultAudioIndex:
        preferedAudioIndex || defaultAudioIndex || firstAudioIndex || undefined,
      defaultSubtitleIndex: mediaSource?.DefaultSubtitleStreamIndex || -1,
      defaultMediaSource: mediaSource || undefined,
      defaultBitrate: bitrate || undefined,
    };
  }, [
    item.MediaSources,
    settings?.defaultAudioLanguage,
    settings?.defaultSubtitleLanguage,
  ]);

  return playSettings;
};

export default useDefaultPlaySettings;

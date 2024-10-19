import { Bitrate, BITRATES } from "@/components/BitrateSelector";
import { Settings } from "@/utils/atoms/settings";
import {
  BaseItemDto,
  MediaSourceInfo,
} from "@jellyfin/sdk/lib/generated-client";
import { useMemo } from "react";

const useDefaultPlaySettings = (
  item: BaseItemDto,
  settings: Settings | null
) => {
  const playSettings = useMemo(() => {
    // 1. Get first media source
    const mediaSource = item.MediaSources?.[0];

    // 2. Get default or preferred audio
    const defaultAudioIndex = mediaSource?.DefaultAudioStreamIndex;
    const preferedAudioIndex = mediaSource?.MediaStreams?.find(
      (x) => x.Language === settings?.defaultAudioLanguage
    )?.Index;
    const firstAudioIndex = mediaSource?.MediaStreams?.find(
      (x) => x.Type === "Audio"
    )?.Index;

    // 3. Get default or preferred subtitle
    const preferedSubtitleIndex = mediaSource?.MediaStreams?.find(
      (x) => x.Language === settings?.defaultSubtitleLanguage?.value
    )?.Index;
    const defaultSubtitleIndex = mediaSource?.MediaStreams?.find(
      (stream) => stream.Type === "Subtitle" && stream.IsDefault
    )?.Index;

    // 4. Get default bitrate
    const bitrate = BITRATES[0];

    return {
      defaultAudioIndex:
        preferedAudioIndex || defaultAudioIndex || firstAudioIndex || undefined,
      defaultSubtitleIndex:
        preferedSubtitleIndex || defaultSubtitleIndex || undefined,
      defaultMediaSource: mediaSource || undefined,
      defaultBitrate: bitrate || undefined,
    };
  }, [item, settings]);

  return playSettings;
};

export default useDefaultPlaySettings;

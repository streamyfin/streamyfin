import { type BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { useMemo } from "react";
import type { Settings } from "@/utils/atoms/settings";
import { getDefaultPlaySettings } from "@/utils/jellyfin/getDefaultPlaySettings";

/**
 * React hook wrapper for getDefaultPlaySettings.
 * Used in UI components for initial playback (no previous track state).
 */
const useDefaultPlaySettings = (item: BaseItemDto, settings: Settings | null) =>
  useMemo(() => {
    const { mediaSource, audioIndex, subtitleIndex, bitrate } =
      getDefaultPlaySettings(item, settings);

    return {
      defaultMediaSource: mediaSource,
      defaultAudioIndex: audioIndex,
      defaultSubtitleIndex: subtitleIndex,
      defaultBitrate: bitrate,
    };
  }, [item, settings]);

export default useDefaultPlaySettings;

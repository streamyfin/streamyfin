import { type BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { useMemo } from "react";
import type { Settings } from "@/utils/atoms/settings";
import {
  getDefaultPlaySettings,
  type PlaySettingsOptions,
} from "@/utils/jellyfin/getDefaultPlaySettings";
import { useTrackSelectionMemory } from "./useTrackSelectionMemory";

/**
 * React hook wrapper for getDefaultPlaySettings.
 * Used in UI components for initial playback (no previous track state).
 *
 * @param item - The media item to play
 * @param settings - User settings (language preferences, bitrate, etc.)
 */
const useDefaultPlaySettings = (
  item: BaseItemDto | null | undefined,
  settings: Settings | null,
  options?: PlaySettingsOptions,
) => {
  const { memoryScope } = useTrackSelectionMemory();
  const offline = options?.offline;
  const downloaded = options?.downloaded;
  const downloadedMediaSource = options?.downloadedMediaSource;
  const indexes = options?.indexes;
  const source = options?.source;
  return useMemo(() => {
    const { mediaSource, audioIndex, subtitleIndex, bitrate } =
      getDefaultPlaySettings(item, settings, {
        offline,
        downloaded,
        downloadedMediaSource,
        indexes,
        source,
        memoryScope,
      });

    return {
      defaultMediaSource: mediaSource,
      defaultAudioIndex: audioIndex,
      defaultSubtitleIndex: subtitleIndex,
      defaultBitrate: bitrate,
    };
  }, [
    item,
    settings,
    offline,
    downloaded,
    downloadedMediaSource,
    indexes,
    source,
    memoryScope,
  ]);
};

export default useDefaultPlaySettings;

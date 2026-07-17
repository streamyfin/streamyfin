import { type BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { useMemo } from "react";
import type { Settings } from "@/utils/atoms/settings";
import {
  getDefaultPlaySettings,
  type PlaySettingsOptions,
} from "@/utils/jellyfin/getDefaultPlaySettings";

/**
 * React hook wrapper for getDefaultPlaySettings.
 * Used in UI components for initial playback (no previous track state).
 *
 * @param item - The media item to play
 * @param settings - User settings (language preferences, bitrate, etc.)
 * @param options - Optional flags to control behavior (e.g., applyLanguagePreferences for TV)
 */
const useDefaultPlaySettings = (
  item: BaseItemDto | null | undefined,
  settings: Settings | null,
  options?: PlaySettingsOptions,
) =>
  useMemo(() => {
    const { mediaSource, audioIndex, subtitleIndex, bitrate } =
      getDefaultPlaySettings(item, settings, undefined, options);

    return {
      defaultMediaSource: mediaSource,
      defaultAudioIndex: audioIndex,
      defaultSubtitleIndex: subtitleIndex,
      defaultBitrate: bitrate,
    };
  }, [item, settings, options]);

export default useDefaultPlaySettings;

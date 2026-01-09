import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { useMemo } from "react";
import type { Settings } from "@/utils/atoms/settings";

/**
 * Determines the appropriate playback speed for a media item based on a three-tier priority system:
 * 1. Media-specific speed (highest priority)
 * 2. Series-specific speed (medium priority)
 * 3. Default speed (lowest priority)
 */
const usePlaybackSpeed = (
  item: BaseItemDto | null,
  settings: Settings | null,
): { readonly playbackSpeed: number } => {
  const playbackSpeed = useMemo(() => {
    if (!settings || !item) {
      return 1.0;
    }

    // Start with the lowest priority: default playback speed
    let selectedPlaybackSpeed = settings.defaultPlaybackSpeed;

    // Second priority: use what is set for Series if it is a Series
    if (item.SeriesId && settings.playbackSpeedPerShow[item.SeriesId]) {
      selectedPlaybackSpeed = settings.playbackSpeedPerShow[item.SeriesId];
    }

    // Highest priority: use what is set for Media if it is set
    if (item.Id && settings.playbackSpeedPerMedia[item.Id] !== undefined) {
      selectedPlaybackSpeed = settings.playbackSpeedPerMedia[item.Id];
    }

    return selectedPlaybackSpeed;
  }, [
    item?.Id,
    item?.SeriesId,
    settings?.defaultPlaybackSpeed,
    settings?.playbackSpeedPerMedia,
    settings?.playbackSpeedPerShow,
  ]);

  return { playbackSpeed };
};

export default usePlaybackSpeed;

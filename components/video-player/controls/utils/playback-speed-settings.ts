import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import type { Settings } from "@/utils/atoms/settings";

export enum PlaybackSpeedScope {
  Media = "media",
  Show = "show",
  All = "all",
}

interface ClearConflictingSettingsResult {
  readonly updatedPerMedia: Settings["playbackSpeedPerMedia"];
  readonly updatedPerShow: Settings["playbackSpeedPerShow"];
}

/**
 * Clears conflicting playback speed settings based on the selected scope.
 *
 * When setting a playback speed at a certain scope, this function removes
 * any more specific settings that would override the new setting:
 * - "all" scope: clears both media-specific and show-specific settings
 * - "media" scope: clears show-specific settings
 * - "show" scope: clears media-specific settings
 */
export const clearConflictingSettings = (
  scope: PlaybackSpeedScope,
  item: BaseItemDto | undefined,
  perMedia: Settings["playbackSpeedPerMedia"],
  perShow: Settings["playbackSpeedPerShow"],
): ClearConflictingSettingsResult => {
  const updatedPerMedia = { ...perMedia };
  const updatedPerShow = { ...perShow };

  if (scope === "all") {
    // Clear both media-specific and show-specific settings
    if (item?.Id && updatedPerMedia[item.Id] !== undefined) {
      delete updatedPerMedia[item.Id];
    }
    if (item?.SeriesId && updatedPerShow[item.SeriesId] !== undefined) {
      delete updatedPerShow[item.SeriesId];
    }
  } else if (scope === "media") {
    // Clear show-specific setting only
    if (item?.SeriesId && updatedPerShow[item.SeriesId] !== undefined) {
      delete updatedPerShow[item.SeriesId];
    }
  } else if (scope === "show") {
    // Clear media-specific setting only
    if (item?.Id && updatedPerMedia[item.Id] !== undefined) {
      delete updatedPerMedia[item.Id];
    }
  }

  return { updatedPerMedia, updatedPerShow };
};

/**
 * Updates playback speed settings based on the selected scope and speed.
 *
 * This function handles both clearing conflicting settings and updating
 * the appropriate setting based on the scope:
 * - "all": updates the default playback speed
 * - "media": sets a speed for the specific media item
 * - "show": sets a speed for the entire show
 */
export const updatePlaybackSpeedSettings = (
  speed: number,
  scope: PlaybackSpeedScope,
  item: BaseItemDto | undefined,
  settings: Settings,
  updateSettings: (updates: Partial<Settings>) => void,
): void => {
  const { updatedPerMedia, updatedPerShow } = clearConflictingSettings(
    scope,
    item,
    settings.playbackSpeedPerMedia,
    settings.playbackSpeedPerShow,
  );

  if (scope === "all") {
    updateSettings({
      defaultPlaybackSpeed: speed,
      playbackSpeedPerMedia: updatedPerMedia,
      playbackSpeedPerShow: updatedPerShow,
    });
  } else if (scope === "media" && item?.Id) {
    updatedPerMedia[item.Id] = speed;
    updateSettings({
      playbackSpeedPerMedia: updatedPerMedia,
      playbackSpeedPerShow: updatedPerShow,
    });
  } else if (scope === "show" && item?.SeriesId) {
    updatedPerShow[item.SeriesId] = speed;
    updateSettings({
      playbackSpeedPerShow: updatedPerShow,
      playbackSpeedPerMedia: updatedPerMedia,
    });
  }
};

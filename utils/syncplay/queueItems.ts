import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { SYNCPLAY_QUEUE_ADD_LIMIT } from "@/constants/SyncPlay";

const VIDEO_TYPES = new Set(["Movie", "Episode", "Video", "MusicVideo"]);

/**
 * The ids a group can queue from what a page holds: its one video, or the
 * episodes of a season or a show. Missing episodes have nothing to play.
 */
export const syncPlayQueueIds = (
  items: (BaseItemDto | null | undefined)[],
): string[] =>
  items
    .filter(
      (item): item is BaseItemDto & { Id: string } =>
        !!item?.Id &&
        VIDEO_TYPES.has(item.Type ?? "") &&
        item.LocationType !== "Virtual",
    )
    .slice(0, SYNCPLAY_QUEUE_ADD_LIMIT)
    .map((item) => item.Id);

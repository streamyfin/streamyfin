import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import {
  SYNCPLAY_ITEM_LOOKUP_CHUNK,
  SYNCPLAY_QUEUE_ADD_LIMIT,
} from "@/constants/SyncPlay";
import type { SyncPlayQueueItem } from "./types";

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

/**
 * The videos behind a queue, as one string: each id once, in an order that
 * does not follow the queue's. A reorder, or a second copy of a video, is
 * then no reason to look anything up again.
 */
export const syncPlayLookupKey = (playlist: SyncPlayQueueItem[]): string =>
  [...new Set(playlist.map((entry) => entry.ItemId))].sort().join(",");

/** The ids of one lookup, split so that no request outgrows its query string. */
export const syncPlayLookupChunks = (ids: string[]): string[][] => {
  const unique = [...new Set(ids)];
  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += SYNCPLAY_ITEM_LOOKUP_CHUNK)
    chunks.push(unique.slice(i, i + SYNCPLAY_ITEM_LOOKUP_CHUNK));
  return chunks;
};

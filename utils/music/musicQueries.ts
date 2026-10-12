import type { ItemsApiGetItemsRequest } from "@jellyfin/sdk/lib/generated-client/api/items-api";
import { MUSIC_PLAY_QUEUE_MAX_ITEMS } from "@/constants/Music";

/** Where Play all and Shuffle take their songs from. */
export interface MusicQueueSource {
  userId: string;
  /** A music library, or a folder inside one. */
  parentId: string;
  /** Every song below `parentId`, or only the ones directly in it. */
  recursive: boolean;
}

/**
 * The order of a song list. Play all queues in the same order, so the queue
 * starts with the song at the top of the list the user is looking at.
 */
const SONG_ORDER: Pick<ItemsApiGetItemsRequest, "sortBy" | "sortOrder"> = {
  sortBy: ["SortName"],
  sortOrder: ["Ascending"],
};

/** One page of the Songs tab: every song in the library. */
export const buildSongsPageQuery = (
  userId: string,
  libraryId: string,
  page: { startIndex: number; limit: number },
): ItemsApiGetItemsRequest => ({
  userId,
  parentId: libraryId,
  recursive: true,
  includeItemTypes: ["Audio"],
  ...SONG_ORDER,
  ...page,
});

/**
 * Every subfolder of a folder, with its path. A folder that holds songs is an
 * album to the server, which renames it after the album tag of its first song,
 * so only the path still has the name the folder has on disk.
 */
export const buildSubfoldersQuery = (
  userId: string,
  folderId: string,
): ItemsApiGetItemsRequest => ({
  userId,
  parentId: folderId,
  recursive: false,
  filters: ["IsFolder"],
  fields: ["Path"],
  enableTotalRecordCount: false,
});

/** One page of the songs directly in a folder. */
export const buildFolderSongsPageQuery = (
  userId: string,
  folderId: string,
  page: { startIndex: number; limit: number },
): ItemsApiGetItemsRequest => ({
  userId,
  parentId: folderId,
  recursive: false,
  includeItemTypes: ["Audio"],
  ...SONG_ORDER,
  ...page,
});

/**
 * The request behind Play all and Shuffle. Shuffle lets the server pick the
 * order, so the cap draws a random sample of every song below the folder.
 */
export const buildMusicQueueQuery = (
  { userId, parentId, recursive }: MusicQueueSource,
  { shuffle }: { shuffle: boolean },
): ItemsApiGetItemsRequest => ({
  userId,
  parentId,
  recursive,
  includeItemTypes: ["Audio"],
  ...(shuffle ? { sortBy: ["Random"] } : SONG_ORDER),
  limit: MUSIC_PLAY_QUEUE_MAX_ITEMS,
  enableTotalRecordCount: false,
});

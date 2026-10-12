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
 * One page of a folder as it is on disk: its subfolders first, then its songs.
 * The server types a folder that holds songs as an album and one that holds
 * folders as a plain folder, so the page asks for no type at all.
 */
export const buildFolderPageQuery = (
  userId: string,
  folderId: string,
  page: { startIndex: number; limit: number },
): ItemsApiGetItemsRequest => ({
  userId,
  parentId: folderId,
  recursive: false,
  sortBy: ["IsFolder", ...(SONG_ORDER.sortBy ?? [])],
  sortOrder: ["Descending", ...(SONG_ORDER.sortOrder ?? [])],
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

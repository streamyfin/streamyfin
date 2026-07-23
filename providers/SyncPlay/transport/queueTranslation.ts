/**
 * queueTranslation — expand container items into a real playable queue.
 *
 * The server takes the queue we send via `syncPlaySetNewQueue` and
 * rebroadcasts it verbatim to every group member. Sending a container
 * ID (Series, Season, BoxSet, Playlist) means every receiver fails to
 * open the player because they can't directly play a container. We must
 * expand to real playable item IDs before sending the queue.
 *
 * Video-focused: music (MusicArtist/MusicGenre) and photo branches are
 * intentionally omitted. Live TV (Program), Episode auto-advance, and
 * folder expansion are preserved because they're the common video flows.
 */

import type { Api } from "@jellyfin/sdk";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import {
  getItemsApi,
  getTvShowsApi,
  getUserApi,
  getUserLibraryApi,
} from "@jellyfin/sdk/lib/utils/api";

export interface TranslateOptions {
  ids?: string[];
  shuffle?: boolean;
  queryOptions?: Record<string, unknown>;
}

const PLAYBACK_FIELDS = ["Chapters", "Trickplay"] as const;

async function getCurrentUser(api: Api) {
  const user = (await getUserApi(api).getCurrentUser()).data;
  if (!user?.Id) {
    throw new Error("SyncPlay queueTranslation: no authenticated user");
  }
  return user;
}

async function queryItems(
  api: Api,
  userId: string,
  params: Record<string, unknown>,
): Promise<BaseItemDto[]> {
  const res = await getItemsApi(api).getItems({
    limit: 300,
    fields: PLAYBACK_FIELDS as unknown as never,
    excludeLocationTypes: ["Virtual"] as unknown as never,
    enableTotalRecordCount: false,
    collapseBoxSetItems: false,
    ...params,
    userId,
  });
  return res.data.Items ?? [];
}

function fetchFolderChildren(
  api: Api,
  userId: string,
  params: Record<string, unknown>,
): Promise<BaseItemDto[]> {
  return queryItems(api, userId, {
    filters: ["IsNotFolder"],
    recursive: true,
    ...params,
  });
}

/**
 * Resolve item IDs into full `BaseItemDto`s.
 *
 *  - single ID → `getItem` (cheap, no Items wrapper)
 *  - multi ID → `getItems` with playback defaults
 */
export async function getItemsForPlayback(
  api: Api,
  ids: string[],
): Promise<BaseItemDto[]> {
  if (!ids.length) return [];
  const userId = (await getCurrentUser(api)).Id as string;
  if (ids.length === 1) {
    const res = await getUserLibraryApi(api).getItem({
      userId,
      itemId: ids[0],
    });
    return res.data ? [res.data] : [];
  }
  return queryItems(api, userId, { ids });
}

/**
 * Expand a "first item" into a real playable queue.
 *
 *  - Program → channel items
 *  - Playlist → playlist children
 *  - IsFolder (Series, Season, BoxSet, MusicAlbum, ...) → recursive descendants
 *  - single Episode (when `EnableNextEpisodeAutoPlay`) → remaining series episodes
 *  - everything else → passthrough (Movies, Audio, single Episode w/ autoplay off)
 *
 * Preserves the caller's `ids` order so the receiver sees the same
 * queue order the sender intended.
 */
export async function translateItemsForPlayback(
  api: Api,
  items: BaseItemDto[],
  options: TranslateOptions = {},
): Promise<BaseItemDto[]> {
  if (!items.length) return [];

  const workingItems =
    items.length > 1 && options.ids
      ? [...items].sort(
          (a, b) =>
            (options.ids ?? []).indexOf(a.Id ?? "") -
            (options.ids ?? []).indexOf(b.Id ?? ""),
        )
      : items;

  const firstItem = workingItems[0];

  if (firstItem.Type === "Program" && firstItem.ChannelId) {
    return getItemsForPlayback(api, [firstItem.ChannelId]);
  }

  const user = await getCurrentUser(api);
  const userId = user.Id as string;

  if (firstItem.Type === "Playlist") {
    return queryItems(api, userId, {
      parentId: firstItem.Id,
      sortBy: options.shuffle ? ["Random"] : undefined,
    });
  }

  if (firstItem.IsFolder) {
    // Series, Season, BoxSet, MusicAlbum, etc.
    const sortBy = options.shuffle
      ? ["Random"]
      : firstItem.Type === "BoxSet"
        ? ["SortName"]
        : undefined;
    return fetchFolderChildren(api, userId, {
      parentId: firstItem.Id,
      mediaTypes: ["Audio", "Video"],
      sortBy,
      ...(options.queryOptions ?? {}),
    });
  }

  if (firstItem.Type === "Episode" && workingItems.length === 1) {
    // Single-episode auto-next: load all remaining episodes in the
    // series, starting at this one. Gated on the user preference so we
    // don't surprise users who disabled autoplay.
    if (!user.Configuration?.EnableNextEpisodeAutoPlay || !firstItem.SeriesId) {
      return workingItems;
    }
    const res = await getTvShowsApi(api).getEpisodes({
      seriesId: firstItem.SeriesId,
      userId,
      isMissing: false,
      fields: PLAYBACK_FIELDS as unknown as never,
      // SDK omits `isVirtualUnaired` from typed request; server honours
      // it. Cast keeps wire payload identical to jellyfin-web.
      ...({ isVirtualUnaired: false } as Record<string, unknown>),
    } as Parameters<ReturnType<typeof getTvShowsApi>["getEpisodes"]>[0]);
    const all = res.data.Items ?? [];
    // Drop everything before firstItem; keep firstItem and everything
    // after. Empty list if firstItem isn't in the series (shouldn't
    // happen, but matches upstream's behaviour).
    let foundItem = false;
    return all.filter((e) => {
      if (foundItem) return true;
      if (e.Id === firstItem.Id) {
        foundItem = true;
        return true;
      }
      return false;
    });
  }

  // Movies, Audio, single Episode w/ autoplay off, etc.
  return workingItems;
}

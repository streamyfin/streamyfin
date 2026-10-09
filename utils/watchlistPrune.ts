import type { Api } from "@jellyfin/sdk";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { getItemsApi, getUserLibraryApi } from "@jellyfin/sdk/lib/utils/api";

const isContainer = (item: BaseItemDto) =>
  item.Type === "Series" || item.Type === "Season";

/**
 * Jellyfin computes `Played` for a season or show from its episodes: true once
 * every episode is played. That is exactly "finished" for the watchlist.
 */
const isWatchlistedAndWatched = (item: BaseItemDto) =>
  item.UserData?.Likes === true && item.UserData?.Played === true;

export interface WatchlistPruneResult {
  /** The ids taken off the watchlist, including those of items that failed later. */
  removed: string[];
  /** One error per item that could not be checked through to the end. */
  failures: unknown[];
}

/**
 * Takes finished items off the KefinTweaks watchlist (Jellyfin's Likes rating).
 *
 * Call it with the ids of items that were NOT played before the action that
 * just finished: marked played, or a playback stop was reported. The server's
 * `Played` cannot tell a fresh finish from an earlier one, so an item already
 * played (added back for a rewatch) has to be left out by the caller.
 *
 * For each item it checks the item, then the season and show above it
 * (finishing the last episode finishes them too), and, when a whole season or
 * show was marked played, the watchlisted seasons and episodes inside it.
 * Anything watchlisted and now fully played gets `likes=false`.
 *
 * Reads the server's state rather than trusting the caller's, so a stop report
 * for an episode abandoned halfway removes nothing.
 *
 * Never rejects: a failing item is reported in `failures` and the rest are
 * still checked, so ratings already cleared are always returned.
 */
export async function removeWatchedFromWatchlist(
  api: Api,
  userId: string,
  itemIds: string[],
): Promise<WatchlistPruneResult> {
  const userLibrary = getUserLibraryApi(api);
  const removed = new Set<string>();
  const failures: unknown[] = [];

  // Episodes in one batch share their season and show: fetch each once.
  const fetched = new Map<string, Promise<BaseItemDto>>();
  const getItem = (itemId: string) => {
    let pending = fetched.get(itemId);
    if (!pending) {
      pending = userLibrary.getItem({ itemId, userId }).then((r) => r.data);
      fetched.set(itemId, pending);
    }
    return pending;
  };

  for (const itemId of itemIds) {
    try {
      const item = await getItem(itemId);
      // An unfinished episode leaves its season and show unfinished as well.
      if (!item.UserData?.Played) continue;

      const parentIds = [
        item.Type === "Episode" ? item.SeasonId : undefined,
        item.Type === "Episode" || item.Type === "Season"
          ? item.SeriesId
          : undefined,
      ].filter((id): id is string => !!id);
      const candidates: BaseItemDto[] = [
        item,
        ...(await Promise.all(parentIds.map(getItem))),
      ];

      if (isContainer(item) && item.Id) {
        const { data } = await getItemsApi(api).getItems({
          userId,
          parentId: item.Id,
          recursive: true,
          filters: ["Likes"],
          includeItemTypes: ["Season", "Episode"],
        });
        candidates.push(...(data.Items ?? []));
      }

      for (const candidate of candidates) {
        if (!candidate.Id || removed.has(candidate.Id)) continue;
        if (!isWatchlistedAndWatched(candidate)) continue;
        await userLibrary.updateUserItemRating({
          itemId: candidate.Id,
          userId,
          likes: false,
        });
        removed.add(candidate.Id);
      }
    } catch (error) {
      failures.push(error);
    }
  }

  return { removed: [...removed], failures };
}

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

/**
 * Takes finished items off the KefinTweaks watchlist (Jellyfin's Likes rating).
 *
 * Call it after items were marked played or a playback stop was reported, with
 * the ids of those items. For each one it checks the item, then the season and
 * show above it (finishing the last episode finishes them too), and, when a
 * whole season or show was marked played, the watchlisted seasons and
 * episodes inside it. Anything watchlisted and now fully played gets
 * `likes=false`.
 *
 * Reads the server's state rather than trusting the caller's, so a stop report
 * for an episode abandoned halfway removes nothing.
 *
 * Each item, parent and rating update stands alone: one the server cannot
 * serve is reported in `failed` and the rest of the batch still goes through.
 *
 * @returns the ids taken off the watchlist, and the ids that could not be
 * loaded or updated.
 */
export async function removeWatchedFromWatchlist(
  api: Api,
  userId: string,
  itemIds: string[],
): Promise<{ removed: string[]; failed: string[] }> {
  const userLibrary = getUserLibraryApi(api);
  const removed = new Set<string>();
  const failed = new Set<string>();

  const getItem = async (itemId: string): Promise<BaseItemDto | null> => {
    try {
      return (await userLibrary.getItem({ itemId, userId })).data;
    } catch {
      failed.add(itemId);
      return null;
    }
  };

  for (const itemId of itemIds) {
    const item = await getItem(itemId);
    if (!item) continue;
    const candidates: BaseItemDto[] = [item];

    const parentIds = [
      item.Type === "Episode" ? item.SeasonId : undefined,
      item.Type === "Episode" || item.Type === "Season"
        ? item.SeriesId
        : undefined,
    ].filter((id): id is string => !!id);
    for (const parentId of parentIds) {
      const parent = await getItem(parentId);
      if (parent) candidates.push(parent);
    }

    if (isContainer(item) && item.Id && item.UserData?.Played) {
      try {
        const { data } = await getItemsApi(api).getItems({
          userId,
          parentId: item.Id,
          recursive: true,
          filters: ["Likes"],
          includeItemTypes: ["Season", "Episode"],
        });
        candidates.push(...(data.Items ?? []));
      } catch {
        failed.add(item.Id);
      }
    }

    for (const candidate of candidates) {
      if (!candidate.Id || removed.has(candidate.Id)) continue;
      if (!isWatchlistedAndWatched(candidate)) continue;
      try {
        await userLibrary.updateUserItemRating({
          itemId: candidate.Id,
          userId,
          likes: false,
        });
        removed.add(candidate.Id);
        failed.delete(candidate.Id);
      } catch {
        failed.add(candidate.Id);
      }
    }
  }

  return { removed: [...removed], failed: [...failed] };
}

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
 * @returns the ids taken off the watchlist.
 */
export async function removeWatchedFromWatchlist(
  api: Api,
  userId: string,
  itemIds: string[],
): Promise<string[]> {
  const userLibrary = getUserLibraryApi(api);
  const removed = new Set<string>();

  const getItem = async (itemId: string) =>
    (await userLibrary.getItem({ itemId, userId })).data;

  for (const itemId of itemIds) {
    const item = await getItem(itemId);
    const candidates: BaseItemDto[] = [item];

    const parentIds = [
      item.Type === "Episode" ? item.SeasonId : undefined,
      item.Type === "Episode" || item.Type === "Season"
        ? item.SeriesId
        : undefined,
    ].filter((id): id is string => !!id);
    for (const parentId of parentIds) {
      candidates.push(await getItem(parentId));
    }

    if (isContainer(item) && item.Id && item.UserData?.Played) {
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
  }

  return [...removed];
}

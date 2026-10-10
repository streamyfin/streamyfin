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

  // Episodes in one batch share their season and show: fetch each once. A
  // failed lookup is cached too, so it is reported once and not retried.
  const fetched = new Map<string, Promise<BaseItemDto | null>>();
  const getItem = (itemId: string) => {
    let pending = fetched.get(itemId);
    if (!pending) {
      pending = userLibrary
        .getItem({ itemId, userId })
        .then((response) => response.data)
        .catch(() => {
          failed.add(itemId);
          return null;
        });
      fetched.set(itemId, pending);
    }
    return pending;
  };

  // Items in a batch share seasons and shows, and run in parallel: start each
  // rating update once, and let a second candidate wait on the first.
  const unliking = new Map<string, Promise<void>>();
  const unlike = (itemId: string) => {
    let pending = unliking.get(itemId);
    if (!pending) {
      pending = userLibrary
        .updateUserItemRating({ itemId, userId, likes: false })
        .then(() => {
          removed.add(itemId);
          failed.delete(itemId);
        })
        .catch(() => {
          failed.add(itemId);
        });
      unliking.set(itemId, pending);
    }
    return pending;
  };

  const prune = async (itemId: string) => {
    const item = await getItem(itemId);
    // An unfinished item leaves its season and show unfinished as well.
    if (!item?.UserData?.Played) return;

    const parentIds = [
      item.Type === "Episode" ? item.SeasonId : undefined,
      item.Type === "Episode" || item.Type === "Season"
        ? item.SeriesId
        : undefined,
    ].filter((id): id is string => !!id);
    const parents = await Promise.all(parentIds.map(getItem));
    const candidates: BaseItemDto[] = [
      item,
      ...parents.filter((parent): parent is BaseItemDto => !!parent),
    ];

    if (isContainer(item) && item.Id) {
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

    await Promise.all(
      candidates
        .filter(isWatchlistedAndWatched)
        .map((candidate) => candidate.Id)
        .filter((id): id is string => !!id)
        .map(unlike),
    );
  };

  await Promise.all(itemIds.map(prune));

  return { removed: [...removed], failed: [...failed] };
}

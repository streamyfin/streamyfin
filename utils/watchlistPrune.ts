import type { Api } from "@jellyfin/sdk";
import {
  type BaseItemDto,
  ItemFields,
  ItemFilter,
} from "@jellyfin/sdk/lib/generated-client/models";
import { getItemsApi, getUserLibraryApi } from "@jellyfin/sdk/lib/utils/api";
import { isAlternateVersion } from "@/utils/jellyfin/mediaSourceVersion";

/**
 * Marking a folder played marks every item under it on the server, whatever
 * kind of folder it is: a show, a season, a collection, a library folder.
 */
const isContainer = (item: BaseItemDto) => item.IsFolder === true;

/**
 * Whether the server counts the item as completed: played, with its resume
 * position reset. Played alone is not enough: Jellyfin 12 keeps it through a
 * rewatch (jellyfin#15762), where 10.11 cleared it when playback started. A
 * season or show has no position of its own, and Jellyfin computes its Played
 * from its episodes: true once every episode is played.
 */
const isFinished = (item: BaseItemDto) =>
  item.UserData?.Played === true && !item.UserData.PlaybackPositionTicks;

const isWatchlistedAndFinished = (item: BaseItemDto) =>
  item.UserData?.Likes === true && isFinished(item);

/**
 * Jellyfin reads a folder with nothing playable in it (a show with no episode
 * yet, only virtual ones) as played: no played item against a total of zero.
 * Only a folder with items under it can have been watched.
 */
const hasPlayableItems = (item: BaseItemDto) =>
  !item.IsFolder || (item.RecursiveItemCount ?? 0) > 0;

/**
 * Whether the item's LastPlayedDate has moved since playback started. Both
 * values are the server's own serialization of that field, one read before
 * the start report (see `lastPlayedDatesAtStart`) and one after the stop, so
 * a date that did not move compares equal.
 */
const movedSince = (item: BaseItemDto, lastPlayedAtStart: string | null) =>
  (item.UserData?.LastPlayedDate ?? null) !== lastPlayedAtStart;

/**
 * What a stop report hands `removeWatchedFromWatchlist` for the item it
 * closed: the LastPlayedDate the item had when playback started, null when it
 * had none. `item` is the item as the server held it before the start report:
 * the one the player fetched from the server, or for an item played from the
 * downloads record, the one `fetchItemAtStart` read. Never the record's own,
 * whose date the app writes. Nothing for an alternate version: Jellyfin 12
 * writes its playback to the version's own UserData, which the player did not
 * read before the start report (12.2 only shows the item the most recent
 * version's date, through VersionResumeData.ApplyTo), so the stop counts on
 * Played alone.
 */
export const lastPlayedDatesAtStart = (
  item: BaseItemDto,
  mediaSourceId: string | null | undefined,
): ReadonlyMap<string, string | null> | undefined =>
  item.Id && !isAlternateVersion(item.Id, item.MediaSources, mediaSourceId)
    ? new Map([[item.Id, item.UserData?.LastPlayedDate ?? null]])
    : undefined;

/**
 * A downloaded item as the server holds it, for `lastPlayedDatesAtStart`:
 * the downloads record's item with the user data the server has for it. The
 * record's own LastPlayedDate is the app's, stamped on the phone's clock at
 * every local progress report (three fractional digits where the server
 * writes up to seven), or a copy of the server's from the last sync that the
 * server may have moved past since. Against the server's after the stop it
 * reads as moved whatever the playback did. Read before the start report,
 * which moves the date on 10.11.
 *
 * Resolves to null when the server does not answer. The player then leaves
 * the watchlist alone after the stop: without a date the server wrote, a
 * finished watch and a 12.2 rewatch left under 5% look the same, and a
 * finished item left on the watchlist costs less than a wanted one taken off.
 */
export async function fetchItemAtStart(
  api: Api,
  userId: string,
  item: BaseItemDto,
  signal?: AbortSignal,
): Promise<BaseItemDto | null> {
  if (!item.Id) return null;
  try {
    const { data } = await getItemsApi(api).getItemUserData(
      { itemId: item.Id, userId },
      { signal },
    );
    return { ...item, UserData: data };
  } catch {
    return null;
  }
}

/**
 * Takes finished items off the KefinTweaks watchlist (Jellyfin's Likes rating).
 *
 * Call it after items were marked played or a playback stop was reported, with
 * the ids of those items. For each one it checks the item, then the season and
 * show above it (finishing the last episode finishes them too), and, when a
 * folder was marked played (a show, a season, a collection, a library folder),
 * the watchlisted items anywhere under it. Anything watchlisted and now
 * finished gets `likes=false`.
 *
 * Reads the server's state rather than trusting the caller's, and removes only
 * what the server now counts as completed: `Played` true and the resume
 * position reset to 0. On Jellyfin 10.11 starting a played item clears Played;
 * on 12 Played stays true through a rewatch, but an abandoned one keeps its
 * resume position while a finished one is reset to 0. Either way a stop report
 * for an episode abandoned halfway removes nothing.
 *
 * A rewatch left under the minimum resume percentage (5% by default) has its
 * position dropped with Played kept, so on 12 only the date tells it from a
 * finished one. A stop report therefore passes `lastPlayedAtStart`, from
 * `lastPlayedDatesAtStart`, and such an item counts only if its LastPlayedDate
 * moved during the playback. 10.11 moves it at every start, where Played
 * decides alone. 12.2 moves it at the start of an unplayed item, and when a
 * progress or stop report completes the item or keeps a resume point. 12.0
 * and 12.1 move it at every start without clearing Played, so there that
 * rewatch still reads as finished.
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
  lastPlayedAtStart?: ReadonlyMap<string, string | null>,
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
    if (!item) return;

    // Undefined when the caller passed no date for the item: Played decides.
    const dateAtStart = lastPlayedAtStart?.get(itemId);
    const watched =
      isFinished(item) &&
      (dateAtStart === undefined || movedSince(item, dateAtStart));

    const candidates: BaseItemDto[] = [];
    // An unfinished item leaves its season and show unfinished as well.
    if (watched) {
      const parentIds = [
        item.Type === "Episode" ? item.SeasonId : undefined,
        item.Type === "Episode" || item.Type === "Season"
          ? item.SeriesId
          : undefined,
      ].filter((id): id is string => !!id);
      const parents = await Promise.all(parentIds.map(getItem));
      candidates.push(
        item,
        ...parents.filter((parent): parent is BaseItemDto => !!parent),
      );
    }

    // Not gated on the folder's own state: Jellyfin computes a show's or a
    // collection's Played from its items, but a library keeps its own, and
    // every item found is checked on its own below.
    if (isContainer(item) && item.Id) {
      try {
        const { data } = await getItemsApi(api).getItems({
          userId,
          parentId: item.Id,
          recursive: true,
          filters: [ItemFilter.Likes],
          fields: [ItemFields.RecursiveItemCount],
          enableImages: false,
          enableTotalRecordCount: false,
        });
        candidates.push(...(data.Items ?? []).filter(hasPlayableItems));
      } catch {
        failed.add(item.Id);
      }
    }

    await Promise.all(
      candidates
        .filter(isWatchlistedAndFinished)
        .map((candidate) => candidate.Id)
        .filter((id): id is string => !!id)
        .map(unlike),
    );
  };

  await Promise.all(itemIds.map(prune));

  return { removed: [...removed], failed: [...failed] };
}

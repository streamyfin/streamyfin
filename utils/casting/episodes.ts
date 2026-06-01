/**
 * Episode-list helpers for the casting player and the autoplay watcher.
 */

import type { Api } from "@jellyfin/sdk";
import type {
  BaseItemDto,
  UserDto,
} from "@jellyfin/sdk/lib/generated-client/models";
import { getTvShowsApi } from "@jellyfin/sdk/lib/utils/api";

/** The episode following `currentId` in `episodes`, or null if none / not found. */
export const findNextEpisode = (
  episodes: BaseItemDto[],
  currentId: string | null | undefined,
): BaseItemDto | null => {
  const index = episodes.findIndex((e) => e.Id === currentId);
  if (index < 0 || index + 1 >= episodes.length) return null;
  return episodes[index + 1];
};

/**
 * Fetch every episode of the series that owns the current episode.
 * Mirrors the call previously inlined in `useCastEpisodes`: no season filter,
 * and the same `userId` quirk (undefined when an access token is present, else
 * the empty string) so the request payload stays byte-identical.
 */
export const fetchSeriesEpisodes = async (
  api: Api,
  _user: UserDto,
  seriesId: string,
): Promise<BaseItemDto[]> => {
  const res = await getTvShowsApi(api).getEpisodes({
    seriesId,
    userId: api.accessToken ? undefined : "",
  });
  // Drop "Virtual" (missing) episodes — e.g. an empty Specials/Season 0 entry
  // that has no media file. They must not appear in the cast episode list nor
  // be offered as prev/next/autoplay targets (they can't be cast).
  return (res.data.Items ?? []).filter((e) => e.LocationType !== "Virtual");
};

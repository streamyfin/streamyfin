import { SEERR_SEASON_BADGES } from "@/constants/Seerr";
import {
  type MediaRequest,
  MediaRequestStatus,
  MediaStatus,
  type TvDetails,
} from "./types";

/**
 * What a season's request says, in the library's terms.
 *
 * A request speaks in `MediaRequestStatus`, numbered differently from the
 * library's `MediaStatus`. Read as a library status, a pending request (1)
 * meant "unknown", and the season offered itself to be requested again.
 */
const REQUESTED_AS: Record<MediaRequestStatus, MediaStatus> = {
  [MediaRequestStatus.PENDING]: MediaStatus.PENDING,
  [MediaRequestStatus.APPROVED]: MediaStatus.PENDING,
  // Nothing stands in the way of asking again.
  [MediaRequestStatus.DECLINED]: MediaStatus.UNKNOWN,
  // Waiting on an administrator to retry, not on the user to ask twice.
  [MediaRequestStatus.FAILED]: MediaStatus.PENDING,
  [MediaRequestStatus.COMPLETED]: MediaStatus.AVAILABLE,
};

const requestedStatus = (
  requests: MediaRequest[],
  seasonNumber: number,
): MediaStatus | undefined => {
  const named = requests.flatMap((request) =>
    (request.seasons ?? []).filter((s) => s.seasonNumber === seasonNumber),
  );
  const season =
    named.find((s) => s.status !== MediaRequestStatus.DECLINED) ?? named[0];

  return season && REQUESTED_AS[season.status];
};

/**
 * Every season of a series with where it stands, as a status icon reads it.
 *
 * The library's own view comes first: a season Seerr has seen in Jellyfin or
 * Sonarr carries its availability. A season that is only requested has no
 * library entry until a scan finds it, so its requests speak for it.
 */
export const seasonsWithStatus = (details: TvDetails) => {
  // The specials were never read from the library here, and still are not.
  const inLibrary =
    details.mediaInfo?.seasons?.filter((s) => s.seasonNumber !== 0) ?? [];
  const requests = details.mediaInfo?.requests ?? [];

  return details.seasons.map((season) => ({
    ...season,
    status:
      inLibrary.find((s) => s.seasonNumber === season.seasonNumber)?.status ??
      requestedStatus(requests, season.seasonNumber) ??
      MediaStatus.UNKNOWN,
  }));
};

/**
 * The season badges of a request card: the first few, then how many more.
 */
export const seasonBadges = (
  seasonNumbers: number[],
  more: (count: number) => string,
): string[] => {
  const shown = seasonNumbers
    .slice(0, SEERR_SEASON_BADGES)
    .map((number) => number.toString());
  const rest = seasonNumbers.length - shown.length;
  return rest > 0 ? [...shown, more(rest)] : shown;
};

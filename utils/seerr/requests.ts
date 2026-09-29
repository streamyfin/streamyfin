import { mediaTypeOf } from "./media";
import { hasPermission, Permission } from "./permissions";
import {
  MediaRequestStatus,
  MediaStatus,
  MediaType,
  type MovieDetails,
  type MovieResult,
  type PersonCreditCast,
  type TvDetails,
  type TvResult,
} from "./types";

/** Where a title stands that leaves nothing to ask for. */
const SETTLED = new Set([
  MediaStatus.AVAILABLE,
  MediaStatus.BLOCKLISTED,
  MediaStatus.PENDING,
  MediaStatus.PROCESSING,
]);

/**
 * Whether someone holding `permissions` may ask for `item`.
 *
 * The permission depends on the kind of title, read from the title itself.
 * Reading it from `mediaInfo` took every title Seerr had never seen, the ones
 * a request is for, for a series.
 */
export const canRequest = (
  item:
    | MovieResult
    | TvResult
    | MovieDetails
    | TvDetails
    | PersonCreditCast
    | undefined,
  permissions: number,
): boolean => {
  if (!item) return false;

  const media = item.mediaInfo;
  const asked = media?.requests?.some(
    (r) =>
      r.status === MediaRequestStatus.PENDING ||
      r.status === MediaRequestStatus.APPROVED,
  );
  if (asked || (media?.status !== undefined && SETTLED.has(media.status))) {
    return false;
  }

  return hasPermission(
    [
      Permission.REQUEST,
      mediaTypeOf(item) === MediaType.MOVIE
        ? Permission.REQUEST_MOVIE
        : Permission.REQUEST_TV,
    ],
    permissions,
    { type: "or" },
  );
};

/**
 * Whether someone holding `permissions` may request for another user.
 *
 * Seerr refuses a request that names its user, even the caller's own id,
 * from anyone without Manage Users and Manage Requests together, and reads
 * another user's quota under the same two. Its own request modal only lists
 * the users for them (AdvancedRequester).
 */
export const canRequestForOthers = (permissions: number): boolean =>
  hasPermission(
    [Permission.MANAGE_USERS, Permission.MANAGE_REQUESTS],
    permissions,
  );

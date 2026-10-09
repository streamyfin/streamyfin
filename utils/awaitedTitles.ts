import type { Api } from "@jellyfin/sdk";
import {
  AWAITED_TITLE_EVENT,
  MY_AWAITED_TITLES_PATH,
} from "@/constants/Notifications";
import type { MyEvent } from "@/utils/notificationPreferences";
import {
  MediaStatus,
  MediaType,
  type MovieDetails,
  type TvDetails,
} from "@/utils/seerr/types";

/** Seerr's two kinds of title, which the plugin matches the same way. */
export type AwaitedMediaType = "movie" | "tv";

/** A title the signed in person waits for, as the plugin describes it. */
export type AwaitedTitle = {
  mediaType: AwaitedMediaType;
  tmdbId: number;
  tvdbId?: number | null;
  title: string;
  year?: number | null;
  addedAt: string;
  /** It arrived during a pause, and is told once the pause is over. */
  arrived: boolean;
};

/** What the app sends to wait for a title. */
export type AwaitTitleRequest = {
  mediaType: AwaitedMediaType;
  tmdbId: number;
  tvdbId?: number;
  title: string;
  year?: number;
};

export const getAwaitedTitles = async (api: Api): Promise<AwaitedTitle[]> =>
  (await api.get<AwaitedTitle[]>(MY_AWAITED_TITLES_PATH)).data;

export const awaitTitle = async (
  api: Api,
  request: AwaitTitleRequest,
): Promise<AwaitedTitle[]> =>
  (await api.post<AwaitedTitle[]>(MY_AWAITED_TITLES_PATH, request)).data;

export const stopAwaitingTitle = async (
  api: Api,
  mediaType: AwaitedMediaType,
  tmdbId: number,
): Promise<AwaitedTitle[]> =>
  (
    await api.delete<AwaitedTitle[]>(
      `${MY_AWAITED_TITLES_PATH}/${mediaType}/${tmdbId}`,
    )
  ).data;

const same =
  (mediaType: AwaitedMediaType, tmdbId: number) => (title: AwaitedTitle) =>
    title.mediaType === mediaType && title.tmdbId === tmdbId;

export const isAwaited = (
  list: AwaitedTitle[] | undefined,
  mediaType: AwaitedMediaType,
  tmdbId: number,
): boolean => !!list?.some(same(mediaType, tmdbId));

/** The list with a title added, first, as the plugin answers it. */
export const withAwaited = (
  list: AwaitedTitle[],
  request: AwaitTitleRequest,
  addedAt: string,
): AwaitedTitle[] =>
  isAwaited(list, request.mediaType, request.tmdbId)
    ? list
    : [{ ...request, addedAt, arrived: false }, ...list];

export const withoutAwaited = (
  list: AwaitedTitle[],
  mediaType: AwaitedMediaType,
  tmdbId: number,
): AwaitedTitle[] => list.filter((title) => !same(mediaType, tmdbId)(title));

const yearOf = (date: string | undefined): number | undefined => {
  const year = Number.parseInt(date?.slice(0, 4) ?? "", 10);
  return Number.isNaN(year) ? undefined : year;
};

/**
 * What a Seerr page asks the plugin to wait for. A show carries its TVDB id when Seerr has it:
 * many shows in Jellyfin only have that one. Undefined for a title it cannot name.
 */
export const awaitRequestFrom = (
  details: MovieDetails | TvDetails | undefined,
  mediaType: MediaType,
): AwaitTitleRequest | undefined => {
  if (!details?.id) return undefined;
  const movie = mediaType === MediaType.MOVIE;
  const title = movie
    ? (details as MovieDetails).title
    : (details as TvDetails).name;
  if (!title) return undefined;

  const year = yearOf(
    movie
      ? (details as MovieDetails).releaseDate
      : (details as TvDetails).firstAirDate,
  );
  const tvdbId = movie ? undefined : details.externalIds?.tvdbId;
  return {
    mediaType: movie ? "movie" : "tv",
    tmdbId: details.id,
    ...(tvdbId ? { tvdbId } : {}),
    title,
    ...(year ? { year } : {}),
  };
};

const ON_THE_SERVER: ReadonlySet<MediaStatus> = new Set([
  MediaStatus.AVAILABLE,
  MediaStatus.PARTIALLY_AVAILABLE,
]);

/**
 * Whether a Seerr page offers to wait for its title: one the server does not have, which the
 * person did not ask for themselves, since Seerr already tells them, while the event reaches them.
 */
export const showsAwaitButton = ({
  details,
  seerrUserId,
  events,
}: {
  details: MovieDetails | TvDetails | undefined;
  seerrUserId: number | undefined;
  events: MyEvent[] | undefined;
}): boolean => {
  if (!details) return false;
  const event = events?.find((e) => e.key === AWAITED_TITLE_EVENT);
  if (!event?.enabled) return false;

  const media = details.mediaInfo;
  if (media?.jellyfinMediaId) return false;
  if (media?.status !== undefined && ON_THE_SERVER.has(media.status)) {
    return false;
  }
  return !media?.requests?.some(
    (request) =>
      seerrUserId !== undefined && request.requestedBy?.id === seerrUserId,
  );
};

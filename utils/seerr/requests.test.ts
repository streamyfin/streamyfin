import { Permission } from "./permissions";
import {
  canRequest,
  canRequestForOthers,
  canRequestMore,
  requestOffer,
} from "./requests";
import {
  type MediaInfo,
  type MediaRequest,
  MediaRequestStatus,
  MediaStatus,
  MediaType,
  type MovieDetails,
  type MovieResult,
  type TvDetails,
  type TvResult,
  type User,
} from "./types";

const stamps = { createdAt: "2026-09-26", updatedAt: "2026-09-26" };

const someone: User = {
  id: 108,
  permissions: 0,
  displayName: "Someone",
  ...stamps,
};

// Neither title is known to Seerr yet, which is the case a request is for:
// no mediaInfo until someone asks or the library has it.
const newFilm: MovieResult = {
  id: 438631,
  mediaType: MediaType.MOVIE,
  title: "Dune",
};

const newSeries: TvResult = {
  id: 1399,
  mediaType: MediaType.TV,
  name: "Game of Thrones",
};

const filmDetails: MovieDetails = {
  id: 438631,
  title: "Dune",
  spokenLanguages: [],
  releases: {},
  keywords: [],
};

const known = (
  status: MediaStatus,
  requests: MediaRequest[] = [],
): MediaInfo => ({
  id: 1,
  tmdbId: 438631,
  status,
  mediaType: MediaType.MOVIE,
  requests,
});

const request = (status: MediaRequestStatus): MediaRequest => ({
  id: 7,
  status,
  media: known(MediaStatus.UNKNOWN),
  requestedBy: someone,
});

describe("canRequest", () => {
  // Read through mediaInfo, a title Seerr had never seen was always taken for
  // a series, so a film asked for the permission to request series.
  test("lets someone who may request films ask for a new film", () => {
    expect(canRequest(newFilm, Permission.REQUEST_MOVIE)).toBe(true);
    expect(canRequest(filmDetails, Permission.REQUEST_MOVIE)).toBe(true);
  });

  test("keeps someone who may only request series from asking for a film", () => {
    expect(canRequest(newFilm, Permission.REQUEST_TV)).toBe(false);
  });

  test("lets someone who may request series ask for a new series", () => {
    expect(canRequest(newSeries, Permission.REQUEST_TV)).toBe(true);
    expect(canRequest(newSeries, Permission.REQUEST_MOVIE)).toBe(false);
  });

  test("lets someone who may request anything ask for either", () => {
    expect(canRequest(newFilm, Permission.REQUEST)).toBe(true);
    expect(canRequest(newSeries, Permission.REQUEST)).toBe(true);
  });

  test("refuses someone without any request permission", () => {
    expect(canRequest(newFilm, 0)).toBe(false);
  });

  test("refuses a title the library has, or is fetching, or blocks", () => {
    for (const status of [
      MediaStatus.AVAILABLE,
      MediaStatus.PENDING,
      MediaStatus.PROCESSING,
      MediaStatus.BLOCKLISTED,
    ]) {
      const film = { ...newFilm, mediaInfo: known(status) };
      expect(canRequest(film, Permission.REQUEST)).toBe(false);
    }
  });

  test("refuses a title someone already asked for", () => {
    for (const status of [
      MediaRequestStatus.PENDING,
      MediaRequestStatus.APPROVED,
    ]) {
      const film = {
        ...newFilm,
        mediaInfo: known(MediaStatus.UNKNOWN, [request(status)]),
      };
      expect(canRequest(film, Permission.REQUEST)).toBe(false);
    }
  });

  test("lets a declined title be asked for again", () => {
    const film = {
      ...newFilm,
      mediaInfo: known(MediaStatus.UNKNOWN, [
        request(MediaRequestStatus.DECLINED),
      ]),
    };

    expect(canRequest(film, Permission.REQUEST)).toBe(true);
  });

  test("refuses when there is nothing to request", () => {
    expect(canRequest(undefined, Permission.REQUEST)).toBe(false);
  });
});

// Seerr refuses a request that names its user, even the caller's own id,
// from anyone without both permissions, and lists its users for the same
// people only (MediaRequest.request, AdvancedRequester).
describe("canRequestForOthers", () => {
  test("takes Manage Users and Manage Requests together", () => {
    expect(
      canRequestForOthers(Permission.MANAGE_USERS | Permission.MANAGE_REQUESTS),
    ).toBe(true);
  });

  test("not with only one of them", () => {
    expect(canRequestForOthers(Permission.MANAGE_USERS)).toBe(false);
    expect(canRequestForOthers(Permission.MANAGE_REQUESTS)).toBe(false);
  });

  test("not with advanced requests", () => {
    expect(
      canRequestForOthers(Permission.REQUEST | Permission.REQUEST_ADVANCED),
    ).toBe(false);
  });

  test("an administrator can", () => {
    expect(canRequestForOthers(Permission.ADMIN)).toBe(true);
  });
});

// Seerr's "Request more" (RequestButton): a series Seerr knows, with a season
// it could still request, that the user may request series for. It opens the
// same season list as the first request.
describe("canRequestMore", () => {
  const seriesRequest: MediaRequest = {
    ...request(MediaRequestStatus.PENDING),
    seasons: [{ id: 1, seasonNumber: 1, status: MediaRequestStatus.PENDING }],
  } as MediaRequest;
  const series = (
    mediaInfo: MediaInfo | undefined,
    seasons = [0, 1, 2],
  ): TvDetails =>
    ({
      id: 1399,
      name: "Game of Thrones",
      seasons: seasons.map((seasonNumber) => ({
        id: seasonNumber,
        seasonNumber,
        episodeCount: 10,
      })),
      mediaInfo,
    }) as unknown as TvDetails;
  const partly = (status = MediaStatus.PENDING): MediaInfo => ({
    ...known(status, [seriesRequest]),
    mediaType: MediaType.TV,
  });

  test("offers it while a season is left to request", () => {
    expect(canRequestMore(series(partly()), Permission.REQUEST)).toBe(true);
    expect(canRequestMore(series(partly()), Permission.REQUEST_TV)).toBe(true);
  });

  // Seerr offers "Request more", not "Request", once it knows the series,
  // even when nothing is pending: a series partly in the library.
  test("offers it on a series partly in the library", () => {
    expect(
      canRequestMore(
        series({
          ...known(MediaStatus.PARTIALLY_AVAILABLE),
          mediaType: MediaType.TV,
        }),
        Permission.REQUEST,
      ),
    ).toBe(true);
  });

  test("not once every season is requested or in the library", () => {
    expect(canRequestMore(series(partly(), [1]), Permission.REQUEST)).toBe(
      false,
    );
  });

  test("counts the specials only when the server shows them", () => {
    const onlySpecialsLeft = series(partly(), [0, 1]);
    expect(canRequestMore(onlySpecialsLeft, Permission.REQUEST)).toBe(false);
    expect(
      canRequestMore(onlySpecialsLeft, Permission.REQUEST, { specials: true }),
    ).toBe(true);
  });

  // Seerr's plain Request covers a series it has never seen.
  test("not on a series Seerr does not know yet", () => {
    expect(canRequestMore(series(undefined), Permission.REQUEST)).toBe(false);
    expect(
      canRequestMore(
        series({ ...known(MediaStatus.UNKNOWN), mediaType: MediaType.TV }),
        Permission.REQUEST,
      ),
    ).toBe(false);
  });

  test("not on a blocklisted series", () => {
    expect(
      canRequestMore(
        series(partly(MediaStatus.BLOCKLISTED)),
        Permission.REQUEST,
      ),
    ).toBe(false);
  });

  test("not without a permission to request series", () => {
    expect(canRequestMore(series(partly()), Permission.REQUEST_MOVIE)).toBe(
      false,
    );
    expect(canRequestMore(series(partly()), 0)).toBe(false);
  });
});

// What a title's page offers, the phone's and the TV's alike, and what its
// seasons' own request buttons follow: Seerr's Request on a title it does
// not know, its Request more on a series it knows with seasons left.
describe("requestOffer", () => {
  const knownSeries = {
    id: 1399,
    name: "Game of Thrones",
    seasons: [1, 2].map((seasonNumber) => ({
      id: seasonNumber,
      seasonNumber,
      episodeCount: 10,
    })),
    mediaInfo: {
      ...known(MediaStatus.PARTIALLY_AVAILABLE),
      mediaType: MediaType.TV,
    },
  } as unknown as TvDetails;

  test("offers Request on a title Seerr does not know", () => {
    expect(requestOffer(newSeries, MediaType.TV, Permission.REQUEST)).toEqual({
      canRequest: true,
      requestMore: false,
      offersRequest: true,
    });
  });

  test("offers Request more on a series it knows with seasons left", () => {
    const offer = requestOffer(knownSeries, MediaType.TV, Permission.REQUEST);
    expect(offer.requestMore).toBe(true);
    expect(offer.offersRequest).toBe(true);
  });

  test("offers nothing to someone who may not request", () => {
    expect(requestOffer(knownSeries, MediaType.TV, 0).offersRequest).toBe(
      false,
    );
    expect(requestOffer(newSeries, MediaType.TV, 0).offersRequest).toBe(false);
  });

  test("never offers Request more on a film", () => {
    expect(
      requestOffer(filmDetails, MediaType.MOVIE, Permission.REQUEST)
        .requestMore,
    ).toBe(false);
  });
});

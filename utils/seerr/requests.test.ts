import { Permission } from "./permissions";
import { canRequest, canRequestForOthers } from "./requests";
import {
  type MediaInfo,
  type MediaRequest,
  MediaRequestStatus,
  MediaStatus,
  MediaType,
  type MovieDetails,
  type MovieResult,
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

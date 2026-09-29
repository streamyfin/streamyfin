import { describe, expect, test } from "bun:test";
import {
  seasonBadges,
  seasonRows,
  seasonsWithStatus,
  toggleAllSeasons,
  toggleSeason,
  unrequestedSeasons,
} from "./seasons";
import {
  type MediaInfo,
  type MediaRequest,
  MediaRequestStatus,
  MediaStatus,
  MediaType,
  type TvDetails,
  type User,
} from "./types";

const stamps = { createdAt: "2026-09-26", updatedAt: "2026-09-26" };

const someone: User = {
  id: 108,
  permissions: 0,
  displayName: "Someone",
  ...stamps,
};

const media = (overrides: Partial<MediaInfo> = {}): MediaInfo => ({
  id: 1,
  tmdbId: 1399,
  status: MediaStatus.PARTIALLY_AVAILABLE,
  mediaType: MediaType.TV,
  ...overrides,
});

const show = (mediaInfo?: MediaInfo): TvDetails => ({
  id: 1399,
  name: "A series",
  seasons: [0, 1, 2].map((seasonNumber) => ({
    id: 100 + seasonNumber,
    seasonNumber,
    episodeCount: 10,
  })),
  contentRatings: {},
  keywords: [],
  spokenLanguages: [],
  mediaInfo,
});

/** A request naming seasons, each with the status the request gives it. */
const request = (
  seasons?: [seasonNumber: number, status: MediaRequestStatus][],
): MediaRequest => ({
  id: 7,
  status: MediaRequestStatus.PENDING,
  media: media(),
  requestedBy: someone,
  seasons: seasons?.map(([seasonNumber, status], index) => ({
    id: index,
    seasonNumber,
    status,
    ...stamps,
  })),
});

const statusOf = (details: TvDetails, seasonNumber: number) =>
  seasonsWithStatus(details).find((s) => s.seasonNumber === seasonNumber)
    ?.status;

describe("seasonsWithStatus", () => {
  test("keeps the library's status for a season the library has", () => {
    const details = show(
      media({
        seasons: [
          {
            id: 1,
            seasonNumber: 1,
            status: MediaStatus.AVAILABLE,
            status4k: MediaStatus.UNKNOWN,
            ...stamps,
          },
        ],
        requests: [request([[1, MediaRequestStatus.PENDING]])],
      }),
    );

    expect(statusOf(details, 1)).toBe(MediaStatus.AVAILABLE);
  });

  // A request speaks in request statuses, numbered differently from the
  // library's: read as a library status, a pending request (1) meant
  // "unknown", and the season offered itself to be requested again.
  test("shows a season that is only requested as pending", () => {
    const details = show(
      media({ requests: [request([[2, MediaRequestStatus.PENDING]])] }),
    );

    expect(statusOf(details, 2)).toBe(MediaStatus.PENDING);
  });

  test("lets a declined season be requested again", () => {
    const details = show(
      media({ requests: [request([[2, MediaRequestStatus.DECLINED]])] }),
    );

    expect(statusOf(details, 2)).toBe(MediaStatus.UNKNOWN);
  });

  test("reads a live request over a declined one", () => {
    const details = show(
      media({
        requests: [
          request([[2, MediaRequestStatus.DECLINED]]),
          request([[2, MediaRequestStatus.APPROVED]]),
        ],
      }),
    );

    expect(statusOf(details, 2)).toBe(MediaStatus.PENDING);
  });

  test("shows a completed request as available", () => {
    const details = show(
      media({ requests: [request([[1, MediaRequestStatus.COMPLETED]])] }),
    );

    expect(statusOf(details, 1)).toBe(MediaStatus.AVAILABLE);
  });

  test("offers every season of a series Seerr has never seen", () => {
    const statuses = seasonsWithStatus(show()).map((s) => s.status);

    expect(statuses).toEqual([
      MediaStatus.UNKNOWN,
      MediaStatus.UNKNOWN,
      MediaStatus.UNKNOWN,
    ]);
  });

  test("skips a request that names no seasons", () => {
    const details = show(media({ requests: [request()] }));

    expect(statusOf(details, 1)).toBe(MediaStatus.UNKNOWN);
  });

  test("does not read the specials from the library", () => {
    const details = show(
      media({
        seasons: [
          {
            id: 1,
            seasonNumber: 0,
            status: MediaStatus.AVAILABLE,
            status4k: MediaStatus.UNKNOWN,
            ...stamps,
          },
        ],
      }),
    );

    expect(statusOf(details, 0)).toBe(MediaStatus.UNKNOWN);
  });
});

describe("seasonBadges", () => {
  const more = (count: number) => `+${count} more`;

  test("shows two seasons, then how many more", () => {
    expect(seasonBadges([1, 2, 3, 4, 5], more)).toEqual(["1", "2", "+3 more"]);
  });

  test("shows every season when there are no more than two", () => {
    expect(seasonBadges([1, 2], more)).toEqual(["1", "2"]);
    expect(seasonBadges([3], more)).toEqual(["3"]);
    expect(seasonBadges([], more)).toEqual([]);
  });
});

// As Seerr's own request modal decides (TvRequestModal's getAllSeasons,
// getAllRequestedSeasons, toggleSeason and toggleAllSeasons).
describe("unrequestedSeasons", () => {
  const librarySeason = (seasonNumber: number, status: MediaStatus) => ({
    id: seasonNumber,
    seasonNumber,
    status,
    status4k: MediaStatus.UNKNOWN,
    ...stamps,
  });

  test("offers every season with episodes of a series Seerr has never seen", () => {
    expect(unrequestedSeasons(show())).toEqual([1, 2]);
  });

  test("offers the specials only when the server shows them", () => {
    expect(unrequestedSeasons(show(), { specials: true })).toEqual([0, 1, 2]);
  });

  test("leaves out a season without episodes", () => {
    const details = show();
    details.seasons[2] = { ...details.seasons[2], episodeCount: 0 };
    expect(unrequestedSeasons(details)).toEqual([1]);
  });

  test("leaves out what is requested, available, partly available or being fetched", () => {
    const details = show(
      media({
        seasons: [librarySeason(1, MediaStatus.PARTIALLY_AVAILABLE)],
        requests: [request([[2, MediaRequestStatus.PENDING]])],
      }),
    );
    expect(unrequestedSeasons(details)).toEqual([]);
  });

  test("offers again a season whose request was declined", () => {
    const details = show(
      media({
        requests: [
          {
            ...request([[2, MediaRequestStatus.DECLINED]]),
            status: MediaRequestStatus.DECLINED,
          },
        ],
      }),
    );
    expect(unrequestedSeasons(details)).toEqual([1, 2]);
  });

  test("offers again a season the library lost", () => {
    const details = show(
      media({ seasons: [librarySeason(1, MediaStatus.DELETED)] }),
    );
    expect(unrequestedSeasons(details)).toEqual([1, 2]);
  });

  test("ignores 4K requests", () => {
    const details = show(
      media({
        requests: [
          { ...request([[1, MediaRequestStatus.PENDING]]), is4k: true },
        ],
      }),
    );
    expect(unrequestedSeasons(details)).toEqual([1, 2]);
  });
});

describe("toggleSeason", () => {
  test("adds a season, then takes it out", () => {
    expect(toggleSeason([], 2, [1, 2])).toEqual([2]);
    expect(toggleSeason([2], 2, [1, 2])).toEqual([]);
  });

  test("leaves a season that cannot be requested as it is", () => {
    expect(toggleSeason([], 3, [1, 2])).toEqual([]);
  });

  test("adds nothing once the quota is used up, but still takes out", () => {
    const quota = { limit: 2, remaining: 1 };
    expect(toggleSeason([1], 2, [1, 2], quota)).toEqual([1]);
    expect(toggleSeason([1], 1, [1, 2], quota)).toEqual([]);
  });
});

describe("toggleAllSeasons", () => {
  test("selects every season that can be requested, then none", () => {
    expect(toggleAllSeasons([], [1, 2])).toEqual([1, 2]);
    expect(toggleAllSeasons([1], [1, 2])).toEqual([1, 2]);
    expect(toggleAllSeasons([1, 2], [1, 2])).toEqual([]);
  });

  test("does nothing when the quota cannot cover them all", () => {
    expect(toggleAllSeasons([], [1, 2], { limit: 5, remaining: 1 })).toEqual(
      [],
    );
  });
});

// The rows of Seerr's season table: its badge, and whether its switch is
// already on and cannot be moved.
describe("seasonRows", () => {
  const librarySeason = (seasonNumber: number, status: MediaStatus) => ({
    id: seasonNumber,
    seasonNumber,
    status,
    status4k: MediaStatus.UNKNOWN,
    ...stamps,
  });
  const rowOf = (details: TvDetails, seasonNumber: number) =>
    seasonRows(details).find((row) => row.seasonNumber === seasonNumber);

  test("lists the seasons with episodes, without the specials", () => {
    expect(seasonRows(show()).map((row) => row.seasonNumber)).toEqual([1, 2]);
    expect(
      seasonRows(show(), { specials: true }).map((row) => row.seasonNumber),
    ).toEqual([0, 1, 2]);
  });

  test("marks a season nobody asked for as not requested, free to choose", () => {
    expect(rowOf(show(), 1)).toEqual({
      seasonNumber: 1,
      episodeCount: 10,
      badge: "not_requested",
      locked: false,
    });
  });

  test("reads a request's status for a season the library does not have", () => {
    const pending = show(
      media({ requests: [request([[1, MediaRequestStatus.PENDING]])] }),
    );
    expect(rowOf(pending, 1)).toMatchObject({ badge: "pending", locked: true });

    const approved = show(
      media({
        requests: [
          {
            ...request([[1, MediaRequestStatus.APPROVED]]),
            status: MediaRequestStatus.APPROVED,
          },
        ],
      }),
    );
    expect(rowOf(approved, 1)).toMatchObject({
      badge: "requested",
      locked: true,
    });
  });

  test("reads the library's status once the library has the season", () => {
    const details = show(
      media({
        seasons: [
          librarySeason(1, MediaStatus.AVAILABLE),
          librarySeason(2, MediaStatus.PARTIALLY_AVAILABLE),
        ],
      }),
    );
    expect(rowOf(details, 1)).toMatchObject({
      badge: "available",
      locked: true,
    });
    expect(rowOf(details, 2)).toMatchObject({
      badge: "partially_available",
      locked: true,
    });
  });

  test("frees a season whose request was declined or that the library lost", () => {
    const details = show(
      media({
        seasons: [librarySeason(2, MediaStatus.DELETED)],
        requests: [
          {
            ...request([[1, MediaRequestStatus.DECLINED]]),
            status: MediaRequestStatus.DECLINED,
          },
        ],
      }),
    );
    expect(rowOf(details, 1)).toMatchObject({
      badge: "not_requested",
      locked: false,
    });
    expect(rowOf(details, 2)).toMatchObject({
      badge: "not_requested",
      locked: false,
    });
  });
});

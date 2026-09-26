import { describe, expect, test } from "bun:test";
import { seasonsWithStatus } from "./seasons";
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

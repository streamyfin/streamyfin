import { describe, expect, test } from "bun:test";
import {
  type CombinedCredit,
  DiscoverSliderType,
  type GenreSliderItem,
  IssueStatus,
  IssueType,
  IssueTypeName,
  MediaRequestStatus,
  MediaStatus,
  MediaType,
  type RequestResultsResponse,
  type Results,
  type SearchResults,
  type ServiceCommonServer,
  type TvDetails,
  type User,
  type UserResultsResponse,
  UserType,
} from "./types";

describe("the values the spec serves as plain numbers", () => {
  // A wrong number here reads as a different state, silently: the spec types
  // these as `number` and writes their meanings in a description, so nothing
  // else would catch it.
  test("mean what Seerr means by them", () => {
    expect(MediaStatus.UNKNOWN).toBe(1);
    expect(MediaStatus.PARTIALLY_AVAILABLE).toBe(4);
    expect(MediaStatus.AVAILABLE).toBe(5);
    expect(MediaStatus.DELETED).toBe(7);

    expect(MediaRequestStatus.PENDING).toBe(1);
    expect(MediaRequestStatus.APPROVED).toBe(2);
    expect(MediaRequestStatus.DECLINED).toBe(3);

    expect(IssueType.VIDEO).toBe(1);
    expect(IssueType.OTHER).toBe(4);
    expect(IssueStatus.OPEN).toBe(1);

    expect(DiscoverSliderType.RECENTLY_ADDED).toBe(1);
    expect(DiscoverSliderType.TMDB_TV_STREAMING_SERVICES).toBe(21);

    expect(UserType.PLEX).toBe(1);
    expect(UserType.JELLYFIN).toBe(3);
  });

  test("name every issue type", () => {
    expect(Object.keys(IssueTypeName)).toHaveLength(4);
    expect(IssueTypeName[IssueType.SUBTITLES]).toBe("Subtitle");
  });

  test("discriminate a result by its media type", () => {
    expect(String(MediaType.MOVIE)).toBe("movie");
    expect(String(MediaType.TV)).toBe("tv");
  });
});

// These assignments are the test: a type derived from the generated spec is
// `never` when the shape it reaches for has moved, and `never` accepts
// nothing. Typecheck fails rather than the run, which is the point.
describe("the types derived from the spec", () => {
  test("describe a search answer", () => {
    const answer: SearchResults = {
      page: 1,
      totalPages: 1,
      totalResults: 1,
      results: [],
    };

    expect(answer.results).toHaveLength(0);
  });

  test("describe a paged list of requests and of users", () => {
    const requests: RequestResultsResponse = { pageInfo: {}, results: [] };
    const users: UserResultsResponse = { pageInfo: {}, results: [] };

    expect(requests.results).toHaveLength(0);
    expect(users.results).toHaveLength(0);
  });

  test("describe a person's credits and a genre slider entry", () => {
    const credits: CombinedCredit = { id: 1, cast: [], crew: [] };
    const genre: GenreSliderItem = { id: 1, name: "Drama", backdrops: [] };

    expect(credits.id).toBe(1);
    expect(genre.name).toBe("Drama");
  });
});

describe("the types a measured server disagreed with", () => {
  test("carry the season count under the name the server sends", () => {
    const show: TvDetails = {
      id: 1,
      name: "Severance",
      seasons: [],
      contentRatings: {},
      keywords: [],
      spokenLanguages: [],
      numberOfSeasons: 3,
    };

    expect(show.numberOfSeasons).toBe(3);
  });

  test("let a user arrive without the email /user strips", () => {
    const common = {
      id: 1,
      permissions: 0,
      displayName: "Someone",
      createdAt: "2026-09-18",
      updatedAt: "2026-09-18",
    };
    const filtered: User = common;
    const whole: User = {
      ...common,
      email: "someone@example.com",
      settings: {},
    };

    expect(filtered.email).toBeUndefined();
    expect(whole.email).toBe("someone@example.com");
  });

  test("describe a service without the credentials the spec promises", () => {
    const radarr: ServiceCommonServer = {
      id: 0,
      name: "Radarr",
      is4k: false,
      isDefault: true,
      activeTags: [],
    };

    expect(radarr.activeTags).toEqual([]);
  });

  test("narrow a result on its media type", () => {
    const results: Results[] = [
      { id: 1, mediaType: MediaType.MOVIE, title: "Dune" },
      { id: 2, mediaType: MediaType.TV, name: "Severance" },
    ];

    const titles = results.map((result) =>
      result.mediaType === MediaType.MOVIE ? result.title : undefined,
    );

    expect(titles[0]).toBe("Dune");
    expect(titles[1]).toBeUndefined();
  });
});

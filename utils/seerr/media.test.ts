import { describe, expect, test } from "bun:test";
import { isMovieOrTvResult, mediaTypeOf, titleOf, yearOf } from "./media";
import {
  MediaStatus,
  MediaType,
  type MovieDetails,
  type MovieResult,
  type TvDetails,
  type TvResult,
} from "./types";

const movieResult: MovieResult = {
  id: 438631,
  mediaType: MediaType.MOVIE,
  title: "Dune",
  releaseDate: "2021-09-15",
};

const tvResult: TvResult = {
  id: 1399,
  mediaType: MediaType.TV,
  name: "Game of Thrones",
  firstAirDate: "2011-04-17",
};

// A film Seerr has never seen: details carry no mediaType of their own, and
// no mediaInfo until someone requests the film or the library has it.
const unknownFilm: MovieDetails = {
  id: 438631,
  title: "Dune",
  releaseDate: "2021-09-15",
  spokenLanguages: [],
  releases: {},
  keywords: [],
};

const knownSeries: TvDetails = {
  id: 1399,
  name: "Game of Thrones",
  firstAirDate: "2011-04-17",
  seasons: [],
  contentRatings: {},
  keywords: [],
  spokenLanguages: [],
  mediaInfo: {
    id: 1,
    tmdbId: 1399,
    status: MediaStatus.AVAILABLE,
    mediaType: MediaType.TV,
  },
};

describe("a result, which says what it is", () => {
  test("is told apart by its media type", () => {
    expect(isMovieOrTvResult(movieResult)).toBe(true);
    expect(isMovieOrTvResult(tvResult)).toBe(true);
    expect(isMovieOrTvResult(unknownFilm)).toBe(false);
    expect(isMovieOrTvResult({ id: 1, mediaType: "person" })).toBe(false);
  });

  test("names a film by its title and a series by its name", () => {
    expect(titleOf(movieResult)).toBe("Dune");
    expect(titleOf(tvResult)).toBe("Game of Thrones");
  });

  test("dates a film by its release and a series by its first airing", () => {
    expect(yearOf(movieResult)).toBe(2021);
    expect(yearOf(tvResult)).toBe(2011);
  });
});

describe("details, which do not say what they are", () => {
  // Read through mediaInfo, a film Seerr had never seen came out as a series
  // with no name, no year and no media type.
  test("still know a film Seerr has never seen", () => {
    expect(mediaTypeOf(unknownFilm)).toBe(MediaType.MOVIE);
    expect(titleOf(unknownFilm)).toBe("Dune");
    expect(yearOf(unknownFilm)).toBe(2021);
  });

  test("know a series", () => {
    expect(mediaTypeOf(knownSeries)).toBe(MediaType.TV);
    expect(titleOf(knownSeries)).toBe("Game of Thrones");
    expect(yearOf(knownSeries)).toBe(2011);
  });

  test("give nothing for nothing", () => {
    expect(mediaTypeOf(undefined)).toBeUndefined();
    expect(titleOf(undefined)).toBeUndefined();
    expect(yearOf(undefined)).toBeUndefined();
  });
});

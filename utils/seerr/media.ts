import {
  MediaType,
  type MovieDetails,
  type MovieResult,
  type PersonCreditCast,
  type TvDetails,
  type TvResult,
} from "./types";

/** What the app shows a poster, a title and a year for. */
type Media =
  | MovieResult
  | TvResult
  | MovieDetails
  | TvDetails
  | PersonCreditCast;

/**
 * Whether an item says what it is.
 *
 * Results and credits carry a `mediaType`. Details do not, and a person's
 * result carries "person", which is neither.
 */
export const isMovieOrTvResult = (
  item: unknown,
): item is MovieResult | TvResult =>
  typeof item === "object" &&
  item !== null &&
  "mediaType" in item &&
  (item.mediaType === MediaType.MOVIE || item.mediaType === MediaType.TV);

/**
 * Film or series.
 *
 * Details are told apart by what they carry, a film's title against a
 * series' name. Reading `mediaInfo` instead left a film Seerr has never seen
 * without a type, since mediaInfo only exists once Seerr knows the title.
 */
export const mediaTypeOf = (item?: Media): MediaType | undefined => {
  if (!item) return undefined;
  if (isMovieOrTvResult(item)) return item.mediaType;
  return "title" in item ? MediaType.MOVIE : MediaType.TV;
};

export const titleOf = (item?: Media): string | undefined => {
  if (!item) return undefined;
  return mediaTypeOf(item) === MediaType.MOVIE
    ? (item as MovieResult | MovieDetails).title
    : (item as TvResult | TvDetails).name;
};

export const yearOf = (item?: Media): number | undefined => {
  if (!item) return undefined;
  const date =
    mediaTypeOf(item) === MediaType.MOVIE
      ? (item as MovieResult | MovieDetails).releaseDate
      : (item as TvResult | TvDetails).firstAirDate;
  return date ? new Date(date).getFullYear() : undefined;
};

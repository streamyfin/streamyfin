import type {
  StreamystatsRecommendationsIdsResponse,
  StreamystatsSearchIdsResponse,
} from "./types";

// Streamystats is a server the user points the app at, so a 200 promises nothing
// about the body: another version of the server, an error object, or a proxy's own
// page all arrive as one. These turn whatever came back into the shape the types
// declare, with nothing in it, so a caller shows an empty result instead of reading
// a field off undefined.

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const envelopeOf = (body: unknown) => {
  const envelope = isRecord(body) ? body : {};
  return {
    data: isRecord(envelope.data) ? envelope.data : {},
    error: typeof envelope.error === "string" ? envelope.error : undefined,
  };
};

// The ids go straight into a Jellyfin items request, so anything that is not one
// is dropped here rather than sent on.
const idsOf = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((id): id is string => typeof id === "string" && id !== "")
    : [];

const totalOf = (total: unknown, lists: string[][]): number =>
  typeof total === "number"
    ? total
    : lists.reduce((count, list) => count + list.length, 0);

export const toRecommendationIds = (
  body: unknown,
): StreamystatsRecommendationsIdsResponse => {
  const { data, error } = envelopeOf(body);
  const movies = idsOf(data.movies);
  const series = idsOf(data.series);

  return {
    data: { movies, series, total: totalOf(data.total, [movies, series]) },
    error,
  };
};

export const toSearchIds = (body: unknown): StreamystatsSearchIdsResponse => {
  const { data, error } = envelopeOf(body);
  const lists = {
    movies: idsOf(data.movies),
    series: idsOf(data.series),
    episodes: idsOf(data.episodes),
    seasons: idsOf(data.seasons),
    audio: idsOf(data.audio),
    actors: idsOf(data.actors),
    directors: idsOf(data.directors),
    writers: idsOf(data.writers),
  };

  return {
    data: { ...lists, total: totalOf(data.total, Object.values(lists)) },
    error,
  };
};

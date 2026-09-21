/**
 * The Seerr routes the app reads, and what the capture needs to call them.
 *
 * Written as the spec templates them, which is how `generated/api-shapes.json`
 * and `corrections.ts` are keyed, so all three can be compared without
 * translating between them.
 *
 * Only reads are here. A capture that posted a request or an issue would leave
 * data on whichever server it ran against, and a fixture is not worth that.
 * `POST /request` answers the same shape as `GET /request/{requestId}`, which
 * is captured, so the one that matters is covered either way.
 */
export interface AppRoute {
  /** The route as the spec writes it. */
  template: string;
  /** Values for the path parameters, chosen to exist on any server. */
  params?: Record<string, string | number>;
  /** What the route needs in its query string to answer at all. */
  query?: Record<string, string | number>;
  /**
   * The status this route is expected to answer. Anything else stops the
   * capture: a 401 or a 500 would otherwise write a fixture with no shape,
   * the contract test would skip it, and a real check would have been
   * replaced by none without anyone noticing.
   */
  expect?: number;
  /** Why this one is here, when the name does not say it. */
  note?: string;
}

/**
 * TMDB ids picked because they are old, popular and will not disappear:
 * a film, a series with many seasons, and a person with a long career.
 */
const DUNE = 693134;
const GAME_OF_THRONES = 1399;
const BRAD_PITT = 287;

export const APP_ROUTES: AppRoute[] = [
  { template: "GET /status" },
  { template: "GET /auth/me" },
  { template: "GET /settings/discover" },

  { template: "GET /discover/trending" },
  { template: "GET /discover/movies" },
  { template: "GET /discover/tv" },
  { template: "GET /discover/genreslider/movie" },
  { template: "GET /discover/genreslider/tv" },
  {
    template: "GET /discover/movies/studio/{studioId}",
    params: { studioId: 2 },
    note: "Walt Disney Pictures, one of the studios the discover row offers.",
  },
  {
    template: "GET /discover/tv/network/{networkId}",
    params: { networkId: 213 },
    note: "Netflix, one of the networks the discover row offers.",
  },

  { template: "GET /search", query: { query: "dune" } },

  { template: "GET /request", query: { take: 3 } },
  { template: "GET /request/count" },

  { template: "GET /movie/{movieId}", params: { movieId: DUNE } },
  {
    template: "GET /movie/{movieId}/ratings",
    params: { movieId: DUNE },
    expect: 404,
    note: "Rotten Tomatoes has no entry for this one, and the app treats that as normal rather than as a failure.",
  },

  { template: "GET /tv/{tvId}", params: { tvId: GAME_OF_THRONES } },
  { template: "GET /tv/{tvId}/ratings", params: { tvId: GAME_OF_THRONES } },
  {
    template: "GET /tv/{tvId}/season/{seasonNumber}",
    params: { tvId: GAME_OF_THRONES, seasonNumber: 1 },
  },

  { template: "GET /person/{personId}", params: { personId: BRAD_PITT } },
  {
    template: "GET /person/{personId}/combined_credits",
    params: { personId: BRAD_PITT },
  },

  { template: "GET /user", query: { take: 3 } },

  {
    template: "GET /service/radarr",
    note: "Answers an empty list when nothing is configured, which is still a shape.",
  },
  { template: "GET /service/sonarr" },
];

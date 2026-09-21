import type { components, paths } from "./generated/api";

/**
 * What the app reads from a Seerr server.
 *
 * Most of it is an alias onto `generated/api.d.ts`, which comes from the
 * published spec. The rest is here because the spec cannot express it:
 *
 * - the numeric enums, which the spec serves as a plain `number` with their
 *   meanings written in prose;
 * - the corrections in `corrections.ts`, each one a place where a real server
 *   was measured sending something else.
 *
 * Nothing here is invented. A type that departs from the spec says which
 * correction it follows, and the contract test holds both to what a server
 * actually sends.
 */

// The 200 body of one operation, for the shapes the spec describes inline
// rather than naming.
type Body<T> = T extends {
  responses: { 200: { content: { "application/json": infer B } } };
}
  ? B
  : never;

type Schemas = components["schemas"];

// --- The values the spec serves as plain numbers ------------------------
//
// Ported from seerr-team/seerr@v3.4.1 `server/constants/`, MIT. Generation
// cannot give these: the spec types them as `number` and writes what the
// numbers mean in a description.

/** `MediaInfo.status`: where a title is in the library. */
export enum MediaStatus {
  UNKNOWN = 1,
  PENDING = 2,
  PROCESSING = 3,
  PARTIALLY_AVAILABLE = 4,
  AVAILABLE = 5,
  BLOCKLISTED = 6,
  DELETED = 7,
}

/** `MediaRequest.status`: where a request is in its approval. */
export enum MediaRequestStatus {
  PENDING = 1,
  APPROVED = 2,
  DECLINED = 3,
  FAILED = 4,
  COMPLETED = 5,
}

/** The discriminant of a search or discover result. */
export enum MediaType {
  MOVIE = "movie",
  TV = "tv",
}

export enum IssueType {
  VIDEO = 1,
  AUDIO = 2,
  SUBTITLES = 3,
  OTHER = 4,
}

export enum IssueStatus {
  OPEN = 1,
  RESOLVED = 2,
}

/** What each issue type is called on screen, upstream's own wording. */
export const IssueTypeName: Record<IssueType, string> = {
  [IssueType.AUDIO]: "Audio",
  [IssueType.VIDEO]: "Video",
  [IssueType.SUBTITLES]: "Subtitle",
  [IssueType.OTHER]: "Other",
};

/** `DiscoverSlider.type`: which row a slider draws. */
export enum DiscoverSliderType {
  RECENTLY_ADDED = 1,
  RECENT_REQUESTS = 2,
  PLEX_WATCHLIST = 3,
  TRENDING = 4,
  POPULAR_MOVIES = 5,
  MOVIE_GENRES = 6,
  UPCOMING_MOVIES = 7,
  STUDIOS = 8,
  POPULAR_TV = 9,
  TV_GENRES = 10,
  UPCOMING_TV = 11,
  NETWORKS = 12,
  TMDB_MOVIE_KEYWORD = 13,
  TMDB_MOVIE_GENRE = 14,
  TMDB_TV_KEYWORD = 15,
  TMDB_TV_GENRE = 16,
  TMDB_SEARCH = 17,
  TMDB_STUDIO = 18,
  TMDB_NETWORK = 19,
  TMDB_MOVIE_STREAMING_SERVICES = 20,
  TMDB_TV_STREAMING_SERVICES = 21,
}

/** `User.userType`: which server an account signs in through. */
export enum UserType {
  PLEX = 1,
  LOCAL = 2,
  JELLYFIN = 3,
  EMBY = 4,
}

// --- What the spec describes correctly ----------------------------------

export type MovieResult = Schemas["MovieResult"];
export type TvResult = Schemas["TvResult"];
export type PersonResult = Schemas["PersonResult"];
export type MediaInfo = Schemas["MediaInfo"];
export type Episode = Schemas["Episode"];
export type Genre = Schemas["Genre"];
export type Keyword = Schemas["Keyword"];
export type ProductionCompany = Schemas["ProductionCompany"];
export type RelatedVideo = Schemas["RelatedVideo"];
export type Network = Schemas["Network"];
export type Issue = Schemas["Issue"];
export type IssueComment = Schemas["IssueComment"];
export type MediaRequest = Schemas["MediaRequest"];
export type PageInfo = Schemas["PageInfo"];
export type PersonDetails = Schemas["PersonDetails"];
export type CreditCast = Schemas["CreditCast"];
export type CreditCrew = Schemas["CreditCrew"];

/**
 * A search or discover result, which the spec models as three shapes a caller
 * may receive. `mediaType` is what tells them apart, so it is narrowed here:
 * the spec types it as a plain string, which makes the union impossible to
 * discriminate.
 */
export type SearchResult =
  | (MovieResult & { mediaType: MediaType.MOVIE })
  | (TvResult & { mediaType: MediaType.TV })
  | (PersonResult & { mediaType: "person" });

export type SearchResults = Body<paths["/search"]["get"]>;
export type CombinedCredit = Body<
  paths["/person/{personId}/combined_credits"]["get"]
>;
export type GenreSliderItem = Body<
  paths["/discover/genreslider/movie"]["get"]
>[number];
export type RequestResults = Body<paths["/request"]["get"]>;
export type UserResults = Body<paths["/user"]["get"]>;

// --- Where a measured server disagrees with the spec --------------------

/** See CORRECTIONS["GET /movie/{movieId}"]. */
export type MovieDetails = Schemas["MovieDetails"] & {
  keywords?: Keyword[];
  onUserWatchlist?: boolean;
};

/**
 * See CORRECTIONS["GET /tv/{tvId}"]. `numberOfSeason` is a typo in the spec;
 * the server has always sent `numberOfSeasons`.
 */
export type TvDetails = Omit<Schemas["TvDetails"], "numberOfSeason"> & {
  numberOfSeasons?: number;
  onUserWatchlist?: boolean;
  relatedVideos?: RelatedVideo[];
};

/** See CORRECTIONS["GET /tv/{tvId}/season/{seasonNumber}"]. */
export type SeasonWithEpisodes = Schemas["Season"] & {
  externalIds?: { tvdbId?: number; tvrageId?: number };
};

/** See CORRECTIONS["GET /tv/{tvId}/ratings"]. */
export type RTRating = Body<paths["/movie/{movieId}/ratings"]["get"]> & {
  audienceRating?: string;
  audienceScore?: number;
};

/** See CORRECTIONS["GET /person/{personId}"]. */
export type PersonDetailsWithBirthday = PersonDetails & {
  birthday?: string | null;
};

/**
 * See CORRECTIONS["GET /auth/me"] and CORRECTIONS["GET /user"]. One schema
 * covers two serialisations upstream: the whole user for the account signing
 * in, and the same user with `email` and the tokens stripped for everyone
 * else. Both are typed here as the union of what each sends, with everything
 * the two do not share optional.
 */
export type User = Omit<
  Schemas["User"],
  "email" | "plexUsername" | "plexToken" | "jellyfinAuthToken"
> & {
  email?: string;
  plexUsername?: string | null;
  displayName?: string;
  jellyfinUserId?: string;
  jellyfinUsername?: string;
  plexId?: number | null;
  avatarETag?: string | null;
  avatarVersion?: string | null;
  movieQuotaDays?: number | null;
  movieQuotaLimit?: number | null;
  tvQuotaDays?: number | null;
  tvQuotaLimit?: number | null;
  recoveryLinkExpirationDate?: string | null;
  warnings?: string[];
  settings?: Schemas["UserSettings"];
};

/** See CORRECTIONS["GET /settings/discover"]. */
export type DiscoverSlider = Schemas["DiscoverSlider"] & {
  order?: number;
  createdAt?: string;
  updatedAt?: string;
};

/**
 * See CORRECTIONS["GET /service/radarr"]. The spec names the settings of a
 * configured service; the route serves the handful of fields a client needs
 * to pick one, and none of the credentials the schema promises.
 */
export interface ServiceCommonServer {
  id: number;
  name: string;
  is4k: boolean;
  isDefault: boolean;
  activeDirectory?: string;
  activeProfileId?: number;
  activeTags?: number[];
  activeAnimeDirectory?: string;
  activeAnimeProfileId?: number;
  activeAnimeLanguageProfileId?: number;
  activeLanguageProfileId?: number;
}

export interface ServiceCommonServerWithDetails {
  server: ServiceCommonServer;
  profiles: Schemas["ServiceProfile"][];
  rootFolders: { id?: number; path?: string; freeSpace?: number }[];
  languageProfiles?: { id: number; name: string }[];
  tags?: { id: number; label: string }[];
}

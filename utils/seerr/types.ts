import type { ALWAYS_SENT } from "./corrections";
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

/**
 * The keys `ALWAYS_SENT` in `corrections.ts` lists for a type: fields the
 * spec marks optional that a capture proved present.
 */
type SentKeys<N extends keyof typeof ALWAYS_SENT> =
  (typeof ALWAYS_SENT)[N]["keys"][number];

/** `T` with the keys `ALWAYS_SENT` lists for it made required. */
type Always<T, K extends keyof T> = Omit<T, K> & Required<Pick<T, K>>;

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

// --- Results, and the library's view of a title ------------------------

// The spec types `mediaType` as a plain string, which makes the results of a
// search impossible to tell apart. Each shape is narrowed to the value that
// names it.
export type MovieResult = Omit<
  Schemas["MovieResult"],
  "mediaType" | "mediaInfo"
> & {
  mediaType: MediaType.MOVIE;
  mediaInfo?: MediaInfo;
};
export type TvResult = Always<
  Omit<Schemas["TvResult"], "mediaType" | "mediaInfo"> & {
    mediaType?: MediaType.TV;
    mediaInfo?: MediaInfo;
  },
  SentKeys<"TvResult">
>;
/**
 * The spec declares a person without the `name` and `popularity` upstream's
 * own model (`server/models/Search.ts`) gives one, and every search answer
 * carries. The contract test cannot see the gap: on /search a series declares
 * both, and paths are compared rather than variants.
 */
export type PersonResult = Always<
  Omit<Schemas["PersonResult"], "mediaType">,
  SentKeys<"PersonResult">
> & {
  mediaType: "person";
  name: string;
  popularity?: number;
};
/**
 * What the library knows about a title.
 *
 * See CORRECTIONS["GET /movie/{movieId}"]: the schema declares 6 of the 25
 * properties a server sends, and the app reads several of the other 19. This
 * is the corrected shape, and every other type here reaches for it rather than
 * the declared one, because it arrives nested inside a film, a series and a
 * request alike.
 */
export type MediaInfo = Always<
  Omit<Schemas["MediaInfo"], "requests" | "status"> & {
    status?: MediaStatus;
    requests?: MediaRequest[];
    mediaType?: MediaType;
    imdbId?: string | null;
    status4k?: MediaStatus;
    seasons?: MediaSeason[];
    jellyfinMediaId?: string | null;
    jellyfinMediaId4k?: string | null;
    mediaAddedAt?: string | null;
    serviceId?: number | null;
    serviceId4k?: number | null;
    serviceUrl?: string;
    externalServiceId?: number | null;
    externalServiceId4k?: number | null;
    externalServiceSlug?: string | null;
    externalServiceSlug4k?: string | null;
    ratingKey?: string | null;
    ratingKey4k?: string | null;
    downloadStatus?: DownloadingItem[];
    downloadStatus4k?: DownloadingItem[];
    lastSeasonChange?: string;
    issues?: Issue[];
  },
  SentKeys<"MediaInfo">
>;
export type Episode = Always<Schemas["Episode"], SentKeys<"Episode">>;
export type Cast = Always<Schemas["Cast"], SentKeys<"Cast">>;
/** The credits a film or a series carries, with the cast as measured. */
type Credits = { cast?: Cast[]; crew?: Schemas["Crew"][] };
/**
 * One region's streaming offer. See the `watchProviders` rename in
 * CORRECTIONS["GET /movie/{movieId}"]: the spec nests these one array deeper
 * than they are sent, and leaves `flatrate` untyped where upstream's model
 * gives it the same shape as `buy`.
 */
export type WatchProviderRegion = Omit<
  Schemas["WatchProviders"][number],
  "flatrate"
> & {
  flatrate?: Schemas["WatchProviderDetails"][];
};
/** A season as TMDB describes it, inside a series. */
export type Season = Always<Schemas["Season"], SentKeys<"Season">>;
export type Genre = Schemas["Genre"];
export type Keyword = Schemas["Keyword"];
export type ProductionCompany = Schemas["ProductionCompany"];
export type RelatedVideo = Schemas["RelatedVideo"];
/**
 * `status` is on upstream's entity (`server/entity/Issue.ts`) and in the issue
 * `POST /issue` answers with, and missing from the schema. Not captured:
 * capturing it would file an issue.
 */
export type Issue = Schemas["Issue"] & { status?: IssueStatus };
export type IssueComment = Schemas["IssueComment"];
/**
 * See CORRECTIONS["GET /request"]. `media` and the users are the corrected
 * shapes too, and a request no service has picked up yet carries nulls where
 * the schema promises values.
 */
export type MediaRequest = Always<
  Omit<
    Schemas["MediaRequest"],
    | "media"
    | "requestedBy"
    | "modifiedBy"
    | "profileId"
    | "rootFolder"
    | "serverId"
  > & {
    media?: MediaInfo;
    requestedBy?: User;
    modifiedBy?: User | string | null;
    profileId?: number | null;
    rootFolder?: string | null;
    serverId?: number | null;
    profileName?: string;
    type?: MediaType;
    tags?: number[];
    seasons?: SeasonRequest[];
    seasonCount?: number;
    isAutoRequest?: boolean;
    languageProfileId?: number | null;
  },
  SentKeys<"MediaRequest">
>;
export type PageInfo = Schemas["PageInfo"];
/** See CORRECTIONS["GET /person/{personId}"]. */
export type PersonDetails = Always<
  Schemas["PersonDetails"],
  SentKeys<"PersonDetails">
> & {
  birthday?: string | null;
};
export type CreditCast = Schemas["CreditCast"];
export type CreditCrew = Schemas["CreditCrew"];

/**
 * A search or discover result, which the spec models as three shapes a caller
 * may receive, told apart by `mediaType`.
 */
export type Results = MovieResult | TvResult | PersonResult;

export type SearchResults = Body<paths["/search"]["get"]>;
type CombinedCreditBody = Body<
  paths["/person/{personId}/combined_credits"]["get"]
>;
/** A person's credits, with the cast as measured. */
export type CombinedCredit = Omit<CombinedCreditBody, "cast"> & {
  cast?: PersonCreditCast[];
};
export type GenreSliderItem = Always<
  Body<paths["/discover/genreslider/movie"]["get"]>[number],
  SentKeys<"GenreSliderItem">
>;
/** See CORRECTIONS["GET /request"]: a page of the corrected requests. */
export type RequestResultsResponse = Always<
  Omit<Body<paths["/request"]["get"]>, "results"> & {
    results?: MediaRequest[];
  },
  SentKeys<"RequestResultsResponse">
>;
/** See CORRECTIONS["GET /user"]: a page of the corrected users. */
export type UserResultsResponse = Omit<
  Body<paths["/user"]["get"]>,
  "results"
> & {
  results?: User[];
};

// --- Where a measured server disagrees with the spec --------------------

/** See CORRECTIONS["GET /movie/{movieId}"]. */
export type MovieDetails = Always<
  Omit<
    Schemas["MovieDetails"],
    "mediaInfo" | "credits" | "watchProviders" | "releases"
  > & {
    keywords?: Keyword[];
    credits?: Credits;
    watchProviders?: WatchProviderRegion[];
    releases?: { results?: TmdbRelease[] };
  },
  SentKeys<"MovieDetails">
> & {
  mediaInfo?: MediaInfo;
  onUserWatchlist?: boolean;
};

/**
 * See CORRECTIONS["GET /tv/{tvId}"]. `numberOfSeason` is a typo in the spec;
 * the server has always sent `numberOfSeasons`.
 */
export type TvDetails = Always<
  Omit<
    Schemas["TvDetails"],
    "numberOfSeason" | "mediaInfo" | "seasons" | "credits" | "watchProviders"
  > & {
    seasons?: Season[];
    credits?: Credits;
    watchProviders?: WatchProviderRegion[];
  },
  SentKeys<"TvDetails">
> & {
  mediaInfo?: MediaInfo;
  numberOfSeasons?: number;
  onUserWatchlist?: boolean;
  relatedVideos?: RelatedVideo[];
};

/** See CORRECTIONS["GET /tv/{tvId}/season/{seasonNumber}"]. */
export type SeasonWithEpisodes = Omit<Schemas["Season"], "episodes"> & {
  episodes?: Episode[];
  externalIds?: { tvdbId?: number; tvrageId?: number };
};

/** See CORRECTIONS["GET /tv/{tvId}/ratings"]. */
export type RTRating = Body<paths["/movie/{movieId}/ratings"]["get"]> & {
  audienceRating?: string;
  audienceScore?: number;
};

/**
 * See CORRECTIONS["GET /auth/me"] and CORRECTIONS["GET /user"]. One schema
 * covers two serialisations upstream: the whole user for the account signing
 * in, and the same user with `email` and the tokens stripped for everyone
 * else. Both are typed here as the union of what each sends, with everything
 * the two do not share optional.
 */
export type User = Always<
  Omit<
    Schemas["User"],
    "email" | "username" | "plexUsername" | "plexToken" | "jellyfinAuthToken"
  > & {
    email?: string;
    username?: string | null;
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
    settings?: Schemas["UserSettings"] | null;
  },
  SentKeys<"User">
>;

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
  activeAnimeTags?: number[];
}

/**
 * What `/service/radarr/{id}` and `/service/sonarr/{id}` send, read off the
 * handler in upstream's `server/routes/service.ts`, which builds the object
 * field by field. The spec declares a single profile and no folders or tags.
 * No fixture: listing a server's profiles needs a Radarr or Sonarr behind it.
 */
export interface ServiceCommonServerWithDetails {
  server: ServiceCommonServer;
  profiles: QualityProfile[];
  rootFolders: RootFolder[];
  /** Sonarr 3 only. Sonarr 4 dropped language profiles and this is null. */
  languageProfiles?: { id: number; name: string }[] | null;
  tags: ServarrTag[];
}

// --- What the app reads and the spec never described ---------------------
//
// Ported from seerr-team/seerr@v3.4.1, MIT. These describe request bodies,
// values the server never serialises, or TMDB shapes Seerr passes through
// without declaring, so no response schema covers them.

/** The body `POST /request` takes. Requests are the one thing the app writes. */
export interface MediaRequestBody {
  mediaType: MediaType;
  mediaId: number;
  tvdbId?: number;
  seasons?: number[] | "all";
  is4k?: boolean;
  serverId?: number;
  profileId?: number;
  profileName?: string;
  rootFolder?: string;
  languageProfileId?: number;
  userId?: number;
  tags?: number[];
}

/** A quality profile offered by Radarr or Sonarr. */
export interface QualityProfile {
  id: number;
  name: string;
}

/**
 * A root folder offered by Radarr or Sonarr, as Seerr passes it on: the
 * handler keeps these four fields and drops the rest of what Servarr sends.
 */
export interface RootFolder {
  id: number;
  path: string;
  freeSpace: number;
  totalSpace: number;
}

/** A tag offered by Radarr or Sonarr. */
export interface ServarrTag {
  id: number;
  label: string;
}

/**
 * A season as the library knows it, which is not the season TMDB describes.
 * This one carries availability; `SeasonWithEpisodes` carries the episodes.
 */
export interface MediaSeason {
  id: number;
  seasonNumber: number;
  status: MediaStatus;
  status4k: MediaStatus;
  createdAt: string;
  updatedAt: string;
}

/**
 * A season as a request names it. Its status is the request's, numbered as
 * `MediaRequestStatus`, not the library's.
 */
export interface SeasonRequest {
  id: number;
  seasonNumber: number;
  status: MediaRequestStatus;
  createdAt: string;
  updatedAt: string;
}

/** What a film or an episode being fetched looks like while it is in flight. */
export interface DownloadingItem {
  mediaType: MediaType;
  externalId: number;
  size: number;
  sizeLeft: number;
  status: string;
  timeLeft: string;
  estimatedCompletionTime: string;
  title: string;
  downloadId: string;
  episode?: {
    seasonNumber: number;
    episodeNumber: number;
    absoluteEpisodeNumber: number;
    id: number;
  };
}

/**
 * One of a person's credits, with the part they played. A credit is a film or
 * a series and says which, like a search result.
 */
export type PersonCreditCast = Always<
  Omit<
    NonNullable<CombinedCreditBody["cast"]>[number],
    "mediaType" | "mediaInfo"
  > & {
    mediaType?: MediaType;
    mediaInfo?: MediaInfo;
  },
  SentKeys<"PersonCreditCast">
>;

/**
 * A film's release dates and certifications in one country, as TMDB sends
 * them through. Upstream's type inherits a `rating` TMDB does not send here.
 */
export interface TmdbRelease {
  iso_3166_1: string;
  release_dates: {
    certification: string;
    iso_639_1?: string;
    note?: string;
    release_date: string;
    type: number;
  }[];
}

/**
 * See CORRECTIONS["GET /settings/public"]: the spec declares two of the
 * settings a server makes public. Typed here are the ones the app reads.
 */
export type PublicSettings = Schemas["PublicSettings"] & {
  /** Whether the specials count as a season that can be requested. */
  enableSpecialEpisodes?: boolean;
  /** Whether a series can be requested a season at a time. */
  partialRequestsEnabled?: boolean;
};

/** A user's quotas for films and for series. `remaining` only comes with a limit. */
export type QuotaResponse = Body<paths["/user/{userId}/quota"]["get"]>;

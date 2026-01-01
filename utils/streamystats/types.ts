/**
 * Streamystats Search API Types
 * Based on the Search API specification
 */

export type StreamystatsSearchType =
  | "all"
  | "media"
  | "movies"
  | "series"
  | "episodes"
  | "audio"
  | "people"
  | "actors"
  | "directors"
  | "writers"
  | "users"
  | "watchlists"
  | "activities"
  | "sessions";

export type StreamystatsSearchFormat = "full" | "ids";

export interface StreamystatsSearchParams {
  q: string;
  limit?: number;
  format?: StreamystatsSearchFormat;
  type?: StreamystatsSearchType;
}

export interface StreamystatsSearchResultItem {
  id: string;
  type: "item" | "user" | "watchlist" | "activity" | "session" | "actor";
  subtype?: string;
  title: string;
  subtitle?: string;
  imageId?: string;
  imageTag?: string;
  href?: string;
  rank?: number;
  metadata?: Record<string, unknown>;
}

export interface StreamystatsSearchFullResponse {
  data: {
    items: StreamystatsSearchResultItem[];
    users: StreamystatsSearchResultItem[];
    watchlists: StreamystatsSearchResultItem[];
    activities: StreamystatsSearchResultItem[];
    sessions: StreamystatsSearchResultItem[];
    actors: StreamystatsSearchResultItem[];
    total: number;
  };
  error?: string;
}

export interface StreamystatsSearchIdsResponse {
  data: {
    movies: string[];
    series: string[];
    episodes: string[];
    seasons: string[];
    audio: string[];
    actors: string[];
    directors: string[];
    writers: string[];
    total: number;
  };
  error?: string;
}

export type StreamystatsSearchResponse =
  | StreamystatsSearchFullResponse
  | StreamystatsSearchIdsResponse;

/**
 * Streamystats Recommendations API Types
 */

export type StreamystatsRecommendationType = "Movie" | "Series" | "all";

export type StreamystatsRecommendationRange =
  | "7d"
  | "30d"
  | "90d"
  | "thisMonth"
  | "all";

export interface StreamystatsRecommendationsParams {
  serverId?: number;
  serverName?: string;
  jellyfinServerId?: string;
  limit?: number;
  type?: StreamystatsRecommendationType;
  range?: StreamystatsRecommendationRange;
  format?: StreamystatsSearchFormat;
  includeBasedOn?: boolean;
  includeReasons?: boolean;
}

export interface StreamystatsRecommendationItem {
  id: string;
  name: string;
  type: "Movie" | "Series";
  primaryImageTag?: string;
  backdropImageTag?: string;
  overview?: string;
  year?: number;
}

export interface StreamystatsRecommendation {
  item: StreamystatsRecommendationItem;
  similarity: number;
  basedOn?: StreamystatsRecommendationItem[];
  reason?: string;
}

export interface StreamystatsRecommendationsFullResponse {
  server: {
    id: number;
    name: string;
  };
  user: {
    id: string;
    name: string;
  };
  params: Record<string, unknown>;
  data: StreamystatsRecommendation[];
  error?: string;
}

export interface StreamystatsRecommendationsIdsResponse {
  data: {
    movies: string[];
    series: string[];
    total: number;
  };
  error?: string;
}

export type StreamystatsRecommendationsResponse =
  | StreamystatsRecommendationsFullResponse
  | StreamystatsRecommendationsIdsResponse;

/**
 * Streamystats Watchlists API Types
 */

export interface StreamystatsServerInfo {
  id: number;
  name: string;
}

export interface StreamystatsWatchlistsParams {
  serverId?: number;
  serverName?: string;
  serverUrl?: string;
  jellyfinServerId?: string;
  limit?: number;
  format?: StreamystatsSearchFormat;
  includePreview?: boolean;
}

export interface StreamystatsWatchlistPreviewItem {
  id: string;
  name: string;
  type: "Movie" | "Series" | "Episode";
  primaryImageTag?: string;
}

export interface StreamystatsWatchlistItem {
  id: string;
  name: string;
  type: "Movie" | "Series" | "Episode";
  productionYear?: number;
  runtimeTicks?: number;
  genres?: string[];
  primaryImageTag?: string;
  seriesId?: string;
  seriesName?: string;
  communityRating?: number;
}

export interface StreamystatsWatchlistItemEntry {
  id: number;
  watchlistId: number;
  itemId: string;
  position: number;
  addedAt: string;
  item: StreamystatsWatchlistItem;
}

export interface StreamystatsWatchlist {
  id: number;
  serverId: number;
  userId: string;
  name: string;
  description?: string | null;
  isPublic: boolean;
  isPromoted: boolean;
  allowedItemType?: string;
  defaultSortOrder?: string;
  createdAt: string;
  updatedAt: string;
  itemCount?: number;
  previewItems?: StreamystatsWatchlistPreviewItem[];
  items?: StreamystatsWatchlistItemEntry[];
}

export interface StreamystatsWatchlistsFullResponse {
  server: StreamystatsServerInfo;
  data: StreamystatsWatchlist[];
  total: number;
  error?: string;
}

export interface StreamystatsWatchlistsIdsResponse {
  data: {
    watchlists: string[];
    total: number;
  };
  error?: string;
}

export type StreamystatsWatchlistsResponse =
  | StreamystatsWatchlistsFullResponse
  | StreamystatsWatchlistsIdsResponse;

export interface StreamystatsWatchlistDetailParams {
  watchlistId: number;
  serverId?: number;
  serverName?: string;
  serverUrl?: string;
  jellyfinServerId?: string;
  format?: StreamystatsSearchFormat;
}

export interface StreamystatsWatchlistDetailFullResponse {
  server: StreamystatsServerInfo;
  data: StreamystatsWatchlist;
  error?: string;
}

export interface StreamystatsWatchlistDetailIdsResponse {
  server: StreamystatsServerInfo;
  data: {
    id: number;
    name: string;
    items: string[];
  };
  error?: string;
}

export type StreamystatsWatchlistDetailResponse =
  | StreamystatsWatchlistDetailFullResponse
  | StreamystatsWatchlistDetailIdsResponse;

/**
 * Streamystats Watchlists CRUD Types
 */

export type StreamystatsWatchlistAllowedItemType =
  | "Movie"
  | "Series"
  | "Episode"
  | null;

export type StreamystatsWatchlistSortOrder =
  | "custom"
  | "name"
  | "dateAdded"
  | "releaseDate";

export interface CreateWatchlistRequest {
  name: string;
  description?: string;
  isPublic?: boolean;
  allowedItemType?: StreamystatsWatchlistAllowedItemType;
  defaultSortOrder?: StreamystatsWatchlistSortOrder;
}

export interface UpdateWatchlistRequest {
  name?: string;
  description?: string;
  isPublic?: boolean;
  allowedItemType?: StreamystatsWatchlistAllowedItemType;
  defaultSortOrder?: StreamystatsWatchlistSortOrder;
}

export interface CreateWatchlistResponse {
  data: StreamystatsWatchlist;
  error?: string;
}

export interface UpdateWatchlistResponse {
  data: StreamystatsWatchlist;
  error?: string;
}

export interface DeleteWatchlistResponse {
  success: boolean;
  error?: string;
}

export interface AddWatchlistItemResponse {
  data: {
    id: number;
    watchlistId: number;
    itemId: string;
    position: number;
    addedAt: string;
  };
  error?: string;
}

export interface RemoveWatchlistItemResponse {
  success: boolean;
  error?: string;
}

export interface GetWatchlistsResponse {
  data: StreamystatsWatchlist[];
  error?: string;
}

export interface GetWatchlistItemsParams {
  type?: "Movie" | "Series" | "Episode";
  sort?: StreamystatsWatchlistSortOrder;
}

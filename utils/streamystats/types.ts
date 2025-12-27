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

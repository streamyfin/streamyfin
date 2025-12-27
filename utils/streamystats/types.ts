/**
 * StreamyStats Search API Types
 * Based on the Search API specification
 */

export type StreamyStatsSearchType =
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

export type StreamyStatsSearchFormat = "full" | "ids";

export interface StreamyStatsSearchParams {
  q: string;
  limit?: number;
  format?: StreamyStatsSearchFormat;
  type?: StreamyStatsSearchType;
}

export interface StreamyStatsSearchResultItem {
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

export interface StreamyStatsSearchFullResponse {
  data: {
    items: StreamyStatsSearchResultItem[];
    users: StreamyStatsSearchResultItem[];
    watchlists: StreamyStatsSearchResultItem[];
    activities: StreamyStatsSearchResultItem[];
    sessions: StreamyStatsSearchResultItem[];
    actors: StreamyStatsSearchResultItem[];
    total: number;
  };
  error?: string;
}

export interface StreamyStatsSearchIdsResponse {
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

export type StreamyStatsSearchResponse =
  | StreamyStatsSearchFullResponse
  | StreamyStatsSearchIdsResponse;

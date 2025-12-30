import type {
  Episode,
  Movie,
  Program,
  Season,
  Series,
} from "@/models/video/types";
import type { BaseMediaApi } from "./BaseMediaApi";
import type {
  EpisodeFilters,
  MovieFilters,
  PaginatedResult,
  SeriesFilters,
} from "./types";

/**
 * Video library API interface
 * Provides methods for querying and manipulating video content (movies, TV shows, live TV)
 */
export interface VideoLibraryApi extends BaseMediaApi {
  // ========== Collection Queries ==========

  /**
   * Get a paginated list of movies
   */
  getMovies(filters?: MovieFilters): Promise<PaginatedResult<Movie>>;

  /**
   * Get a paginated list of TV series
   */
  getSeries(filters?: SeriesFilters): Promise<PaginatedResult<Series>>;

  /**
   * Get a list of episodes (optionally filtered)
   */
  getEpisodes(filters?: EpisodeFilters): Promise<Episode[]>;

  // ========== Single Item Queries ==========

  /**
   * Get a single movie by ID
   */
  getMovie(id: string): Promise<Movie | null>;

  /**
   * Get a single series by ID
   */
  getSeriesById(id: string): Promise<Series | null>;

  /**
   * Get a single episode by ID
   */
  getEpisode(id: string): Promise<Episode | null>;

  /**
   * Get a single season by ID
   */
  getSeason?(id: string): Promise<Season | null>;

  /**
   * Get a single program (Live TV) by ID
   */
  getProgram?(id: string): Promise<Program | null>;

  // ========== Relationship Queries ==========

  /**
   * Get all seasons for a TV series
   */
  getSeriesSeasons(seriesId: string): Promise<Season[]>;

  /**
   * Get all episodes for a series (optionally filtered by season)
   */
  getSeriesEpisodes(
    seriesId: string,
    seasonNumber?: number,
  ): Promise<Episode[]>;

  /**
   * Get episodes for a specific season
   */
  getSeasonEpisodes(seasonId: string): Promise<Episode[]>;

  // ========== Special Queries ==========

  /**
   * Get "next up" episodes (continue watching TV)
   * @param seriesId Optional: filter to a specific series
   * @param limit Optional: max number of results
   */
  getNextUp?(seriesId?: string, limit?: number): Promise<Episode[]>;

  /**
   * Get latest movies/episodes
   */
  getLatest?(limit?: number): Promise<(Movie | Episode)[]>;

  /**
   * Get resume items (continue watching)
   */
  getResumeItems?(limit?: number): Promise<(Movie | Episode)[]>;
}

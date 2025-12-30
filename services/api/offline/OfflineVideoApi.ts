import {
  toEpisode,
  toMovie,
  toProgram,
  toSeason,
  toSeries,
} from "@/models/video/adapters";
import type {
  Episode,
  Movie,
  Program,
  Season,
  Series,
} from "@/models/video/types";
import { getDownloadedItemById } from "@/providers/Downloads/database";
import {
  getOfflineItemById,
  getOfflineMovies,
  getOfflineSeries,
  queryOfflineLibrary,
} from "@/providers/OfflineLibrary/database";
import { updateLocalUserData } from "@/providers/OfflineLibrary/localUserData";
import { addMutation } from "@/providers/OfflineLibrary/mutationQueue";
import type {
  EpisodeFilters,
  MovieFilters,
  PaginatedResult,
  PlaybackProgress,
  SeriesFilters,
} from "../interfaces/types";
import type { VideoLibraryApi } from "../interfaces/VideoLibraryApi";

/**
 * Offline video API implementation
 * Returns only downloaded content from local database
 */
export class OfflineVideoApi implements VideoLibraryApi {
  // ========== Collection Queries ==========

  async getMovies(filters?: MovieFilters): Promise<PaginatedResult<Movie>> {
    // Get all offline movies
    let items = getOfflineMovies();

    // Apply filters
    if (filters?.searchTerm) {
      const search = filters.searchTerm.toLowerCase();
      items = items.filter((item) => item.Name?.toLowerCase().includes(search));
    }

    // Sort
    if (filters?.sortBy) {
      items.sort((a, b) => {
        const aValue = a.Name || "";
        const bValue = b.Name || "";
        if (filters.sortOrder === "Descending") {
          return bValue > aValue ? 1 : -1;
        }
        return aValue > bValue ? 1 : -1;
      });
    }

    const totalCount = items.length;
    const startIndex = filters?.startIndex || 0;
    const limit = filters?.limit;

    // Pagination
    if (limit !== undefined) {
      items = items.slice(startIndex, startIndex + limit);
    } else if (startIndex > 0) {
      items = items.slice(startIndex);
    }

    // Convert to domain models
    const movies = items.map((item) => {
      const downloadInfo = item.Id ? getDownloadedItemById(item.Id) : undefined;
      return toMovie(item, downloadInfo);
    });

    return {
      items: movies,
      totalCount,
      startIndex,
    };
  }

  async getSeries(filters?: SeriesFilters): Promise<PaginatedResult<Series>> {
    // Get all offline series
    let items = getOfflineSeries();

    // Apply filters
    if (filters?.searchTerm) {
      const search = filters.searchTerm.toLowerCase();
      items = items.filter((item) => item.Name?.toLowerCase().includes(search));
    }

    // Sort
    if (filters?.sortBy) {
      items.sort((a, b) => {
        const aValue = a.Name || "";
        const bValue = b.Name || "";
        if (filters.sortOrder === "Descending") {
          return bValue > aValue ? 1 : -1;
        }
        return aValue > bValue ? 1 : -1;
      });
    }

    const totalCount = items.length;
    const startIndex = filters?.startIndex || 0;
    const limit = filters?.limit;

    // Pagination
    if (limit !== undefined) {
      items = items.slice(startIndex, startIndex + limit);
    } else if (startIndex > 0) {
      items = items.slice(startIndex);
    }

    // Convert to domain models
    const series = items.map((item) => toSeries(item, undefined));

    return {
      items: series,
      totalCount,
      startIndex,
    };
  }

  async getEpisodes(filters?: EpisodeFilters): Promise<Episode[]> {
    const result = queryOfflineLibrary({
      type: "Episode",
      searchTerm: filters?.searchTerm,
      sortBy: "IndexNumber",
      sortOrder: "Ascending",
      startIndex: filters?.startIndex,
      limit: filters?.limit,
    });

    return result.items.map((item) => {
      const downloadInfo = item.Id ? getDownloadedItemById(item.Id) : undefined;
      return toEpisode(item, downloadInfo);
    });
  }

  // ========== Single Item Queries ==========

  async getItem(id: string): Promise<Movie | Episode | Series | null> {
    const item = getOfflineItemById(id);
    if (!item) return null;

    if (item.Type === "Movie") {
      return this.getMovie(id);
    } else if (item.Type === "Episode") {
      return this.getEpisode(id);
    } else if (item.Type === "Series") {
      return this.getSeriesById(id);
    }

    return null;
  }

  async getItems(ids: string[]): Promise<(Movie | Episode | Series)[]> {
    const results: (Movie | Episode | Series)[] = [];

    for (const id of ids) {
      const item = await this.getItem(id);
      if (item) {
        results.push(item);
      }
    }

    return results;
  }

  async getMovie(id: string): Promise<Movie | null> {
    const item = getOfflineItemById(id);
    if (!item || item.Type !== "Movie") return null;

    const downloadInfo = getDownloadedItemById(id);
    return toMovie(item, downloadInfo);
  }

  async getSeriesById(id: string): Promise<Series | null> {
    const item = getOfflineItemById(id);
    if (!item || item.Type !== "Series") return null;

    return toSeries(item, undefined);
  }

  async getEpisode(id: string): Promise<Episode | null> {
    const item = getOfflineItemById(id);
    if (!item || item.Type !== "Episode") return null;

    const downloadInfo = getDownloadedItemById(id);
    return toEpisode(item, downloadInfo);
  }

  async getSeason(id: string): Promise<Season | null> {
    const item = getOfflineItemById(id);
    if (!item || item.Type !== "Season") return null;

    return toSeason(item, undefined);
  }

  async getProgram(id: string): Promise<Program | null> {
    const item = getOfflineItemById(id);
    if (!item || item.Type !== "Program") return null;

    const downloadInfo = getDownloadedItemById(id);
    return toProgram(item, downloadInfo);
  }

  // ========== Relationship Queries ==========

  async getSeriesSeasons(seriesId: string): Promise<Season[]> {
    // Query for seasons of this series
    const result = queryOfflineLibrary({
      type: "Season",
    });

    // Filter by series ID
    const seasonItems = result.items.filter(
      (item) => item.SeriesId === seriesId,
    );

    // Sort by season number
    seasonItems.sort((a, b) => {
      const aNum = a.IndexNumber || 0;
      const bNum = b.IndexNumber || 0;
      return aNum - bNum;
    });

    return seasonItems.map((item) => toSeason(item, undefined));
  }

  async getSeriesEpisodes(
    seriesId: string,
    seasonNumber?: number,
  ): Promise<Episode[]> {
    const result = queryOfflineLibrary({
      type: "Episode",
    });

    // Filter by series ID and optionally season number
    let episodeItems = result.items.filter(
      (item) => item.SeriesId === seriesId,
    );

    if (seasonNumber !== undefined) {
      episodeItems = episodeItems.filter(
        (item) => item.ParentIndexNumber === seasonNumber,
      );
    }

    // Sort by season and episode number
    episodeItems.sort((a, b) => {
      const aSeason = a.ParentIndexNumber || 0;
      const bSeason = b.ParentIndexNumber || 0;
      if (aSeason !== bSeason) return aSeason - bSeason;

      const aEp = a.IndexNumber || 0;
      const bEp = b.IndexNumber || 0;
      return aEp - bEp;
    });

    return episodeItems.map((item) => {
      const downloadInfo = item.Id ? getDownloadedItemById(item.Id) : undefined;
      return toEpisode(item, downloadInfo);
    });
  }

  async getSeasonEpisodes(seasonId: string): Promise<Episode[]> {
    const result = queryOfflineLibrary({
      type: "Episode",
    });

    // Filter by season ID
    const episodeItems = result.items.filter(
      (item) => item.SeasonId === seasonId,
    );

    // Sort by episode number
    episodeItems.sort((a, b) => {
      const aNum = a.IndexNumber || 0;
      const bNum = b.IndexNumber || 0;
      return aNum - bNum;
    });

    return episodeItems.map((item) => {
      const downloadInfo = item.Id ? getDownloadedItemById(item.Id) : undefined;
      return toEpisode(item, downloadInfo);
    });
  }

  // ========== Special Queries ==========

  async getNextUp(_seriesId?: string, _limit: number = 10): Promise<Episode[]> {
    // Not applicable in offline mode - would need viewing history
    return [];
  }

  async getLatest(limit: number = 16): Promise<(Movie | Episode)[]> {
    // Get latest downloaded movies and episodes
    const movies = getOfflineMovies()
      .slice(0, limit / 2)
      .map((item) => {
        const downloadInfo = item.Id
          ? getDownloadedItemById(item.Id)
          : undefined;
        return toMovie(item, downloadInfo);
      });

    const episodeResult = queryOfflineLibrary({
      type: "Episode",
      sortBy: "DateCreated",
      sortOrder: "Descending",
      limit: limit / 2,
    });

    const episodes = episodeResult.items.map((item) => {
      const downloadInfo = item.Id ? getDownloadedItemById(item.Id) : undefined;
      return toEpisode(item, downloadInfo);
    });

    return [...movies, ...episodes];
  }

  async getResumeItems(_limit: number = 10): Promise<(Movie | Episode)[]> {
    // Not fully supported offline - would need playback state
    return [];
  }

  // ========== User Data Mutations ==========
  // These update local data and queue for sync when online

  async markFavorite(itemId: string): Promise<void> {
    updateLocalUserData(itemId, { IsFavorite: true });
    addMutation("FAVORITE", itemId, {});
  }

  async unmarkFavorite(itemId: string): Promise<void> {
    updateLocalUserData(itemId, { IsFavorite: false });
    addMutation("UNFAVORITE", itemId, {});
  }

  async markPlayed(itemId: string, datePlayed?: Date): Promise<void> {
    updateLocalUserData(itemId, {
      Played: true,
      LastPlayedDate: datePlayed?.toISOString() || new Date().toISOString(),
    });
    addMutation("MARK_PLAYED", itemId, {
      datePlayed: datePlayed?.toISOString(),
    });
  }

  async markUnplayed(itemId: string): Promise<void> {
    updateLocalUserData(itemId, { Played: false });
    addMutation("MARK_UNPLAYED", itemId, {});
  }

  async updatePlaybackProgress(
    itemId: string,
    progress: PlaybackProgress,
  ): Promise<void> {
    updateLocalUserData(itemId, {
      PlaybackPositionTicks: progress.positionTicks,
    });
    addMutation("PLAYBACK_PROGRESS", itemId, {
      positionTicks: progress.positionTicks,
      isPaused: progress.isPaused,
    });
  }
}

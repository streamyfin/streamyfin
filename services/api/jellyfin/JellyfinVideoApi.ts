import type { Api } from "@jellyfin/sdk";
import type { ItemSortBy } from "@jellyfin/sdk/lib/generated-client";
import {
  getItemsApi,
  getPlaystateApi,
  getTvShowsApi,
  getUserLibraryApi,
} from "@jellyfin/sdk/lib/utils/api";
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
import type {
  EpisodeFilters,
  MovieFilters,
  PaginatedResult,
  PlaybackProgress,
  SeriesFilters,
} from "../interfaces/types";
import type { VideoLibraryApi } from "../interfaces/VideoLibraryApi";

/**
 * Online Jellyfin video API implementation
 * Automatically enriches results with download status (Approach A)
 */
export class JellyfinVideoApi implements VideoLibraryApi {
  constructor(
    private api: Api,
    private userId: string,
  ) {}

  // ========== Collection Queries ==========

  async getMovies(filters?: MovieFilters): Promise<PaginatedResult<Movie>> {
    const response = await getItemsApi(this.api).getItems({
      userId: this.userId,
      includeItemTypes: ["Movie"],
      parentId: filters?.libraryId,
      searchTerm: filters?.searchTerm,
      sortBy: (filters?.sortBy || ["SortName"]) as ItemSortBy[],
      sortOrder: filters?.sortOrder ? [filters.sortOrder] : ["Ascending"],
      startIndex: filters?.startIndex || 0,
      limit: filters?.limit || 50,
      recursive: true,
      fields: ["Genres", "MediaSources", "MediaStreams"],
    });

    const items = (response.data.Items || []).map((item) => {
      const downloadInfo = item.Id ? getDownloadedItemById(item.Id) : undefined;
      return toMovie(item, downloadInfo, this.api);
    });

    return {
      items,
      totalCount: response.data.TotalRecordCount || 0,
      startIndex: filters?.startIndex || 0,
    };
  }

  async getSeries(filters?: SeriesFilters): Promise<PaginatedResult<Series>> {
    const response = await getItemsApi(this.api).getItems({
      userId: this.userId,
      includeItemTypes: ["Series"],
      parentId: filters?.libraryId,
      searchTerm: filters?.searchTerm,
      sortBy: (filters?.sortBy || ["SortName"]) as ItemSortBy[],
      sortOrder: filters?.sortOrder ? [filters.sortOrder] : ["Ascending"],
      startIndex: filters?.startIndex || 0,
      limit: filters?.limit || 50,
      recursive: true,
      fields: ["Genres"],
    });

    const items = (response.data.Items || []).map((item) => {
      // TODO: Implement series download info
      return toSeries(item, undefined, this.api);
    });

    return {
      items,
      totalCount: response.data.TotalRecordCount || 0,
      startIndex: filters?.startIndex || 0,
    };
  }

  async getEpisodes(filters?: EpisodeFilters): Promise<Episode[]> {
    const params: any = {
      userId: this.userId,
      fields: ["MediaSources", "MediaStreams", "Overview"],
    };

    if (filters?.seriesId) {
      params.seriesId = filters.seriesId;
      params.seasonNumber = filters.seasonNumber;
    }

    const response = await getTvShowsApi(this.api).getEpisodes(params);

    return (response.data.Items || []).map((item) => {
      const downloadInfo = item.Id ? getDownloadedItemById(item.Id) : undefined;
      return toEpisode(item, downloadInfo, this.api);
    });
  }

  // ========== Single Item Queries ==========

  async getItem(id: string): Promise<Movie | Episode | Series | null> {
    const response = await getItemsApi(this.api).getItems({
      ids: [id],
      userId: this.userId,
      fields: ["Genres", "MediaSources", "MediaStreams"],
    });

    const item = response.data.Items?.[0];
    if (!item) return null;

    if (item.Type === "Movie") {
      const downloadInfo = getDownloadedItemById(id);
      return toMovie(item, downloadInfo, this.api);
    } else if (item.Type === "Episode") {
      const downloadInfo = getDownloadedItemById(id);
      return toEpisode(item, downloadInfo, this.api);
    } else if (item.Type === "Series") {
      return toSeries(item, undefined, this.api);
    }

    return null;
  }

  async getItems(ids: string[]): Promise<(Movie | Episode | Series)[]> {
    const response = await getItemsApi(this.api).getItems({
      ids,
      userId: this.userId,
      fields: ["Genres", "MediaSources", "MediaStreams"],
    });

    return (response.data.Items || []).map((item) => {
      if (item.Type === "Movie") {
        const downloadInfo = item.Id
          ? getDownloadedItemById(item.Id)
          : undefined;
        return toMovie(item, downloadInfo, this.api);
      } else if (item.Type === "Episode") {
        const downloadInfo = item.Id
          ? getDownloadedItemById(item.Id)
          : undefined;
        return toEpisode(item, downloadInfo, this.api);
      } else {
        return toSeries(item, undefined, this.api);
      }
    });
  }

  async getMovie(id: string): Promise<Movie | null> {
    const response = await getItemsApi(this.api).getItems({
      ids: [id],
      userId: this.userId,
      fields: ["Genres", "MediaSources", "MediaStreams", "People"],
    });

    const item = response.data.Items?.[0];
    if (!item) return null;

    const downloadInfo = getDownloadedItemById(id);
    return toMovie(item, downloadInfo, this.api);
  }

  async getSeriesById(id: string): Promise<Series | null> {
    const response = await getItemsApi(this.api).getItems({
      ids: [id],
      userId: this.userId,
      fields: ["Genres"],
    });

    const item = response.data.Items?.[0];
    if (!item) return null;

    return toSeries(item, undefined, this.api);
  }

  async getEpisode(id: string): Promise<Episode | null> {
    const response = await getItemsApi(this.api).getItems({
      ids: [id],
      userId: this.userId,
      fields: ["MediaSources", "MediaStreams", "Overview"],
    });

    const item = response.data.Items?.[0];
    if (!item) return null;

    const downloadInfo = getDownloadedItemById(id);
    return toEpisode(item, downloadInfo, this.api);
  }

  async getSeason(id: string): Promise<Season | null> {
    const response = await getItemsApi(this.api).getItems({
      ids: [id],
      userId: this.userId,
    });

    const item = response.data.Items?.[0];
    if (!item) return null;

    return toSeason(item, undefined, this.api);
  }

  async getProgram(id: string): Promise<Program | null> {
    const response = await getItemsApi(this.api).getItems({
      ids: [id],
      userId: this.userId,
      fields: ["MediaSources", "MediaStreams"],
    });

    const item = response.data.Items?.[0];
    if (!item) return null;

    const downloadInfo = getDownloadedItemById(id);
    return toProgram(item, downloadInfo, this.api);
  }

  // ========== Relationship Queries ==========

  async getSeriesSeasons(seriesId: string): Promise<Season[]> {
    const response = await getTvShowsApi(this.api).getSeasons({
      seriesId,
      userId: this.userId,
    });

    return (response.data.Items || []).map((item) =>
      toSeason(item, undefined, this.api),
    );
  }

  async getSeriesEpisodes(
    seriesId: string,
    seasonNumber?: number,
  ): Promise<Episode[]> {
    const response = await getTvShowsApi(this.api).getEpisodes({
      seriesId,
      season: seasonNumber,
      userId: this.userId,
      fields: ["MediaSources", "MediaStreams", "Overview"],
    });

    // Enrich each episode with download info
    return (response.data.Items || []).map((item) => {
      const downloadInfo = item.Id ? getDownloadedItemById(item.Id) : undefined;
      return toEpisode(item, downloadInfo, this.api);
      // ☝️ Some episodes will have source="offline", others "online"
    });
  }

  async getSeasonEpisodes(seasonId: string): Promise<Episode[]> {
    const response = await getItemsApi(this.api).getItems({
      userId: this.userId,
      parentId: seasonId,
      includeItemTypes: ["Episode"],
      sortBy: ["IndexNumber"],
      fields: ["MediaSources", "MediaStreams", "Overview"],
    });

    return (response.data.Items || []).map((item) => {
      const downloadInfo = item.Id ? getDownloadedItemById(item.Id) : undefined;
      return toEpisode(item, downloadInfo, this.api);
    });
  }

  // ========== Special Queries ==========

  async getNextUp(seriesId?: string, limit: number = 10): Promise<Episode[]> {
    const response = await getTvShowsApi(this.api).getNextUp({
      userId: this.userId,
      seriesId,
      limit,
      fields: ["MediaSources", "MediaStreams", "Overview"],
    });

    return (response.data.Items || []).map((item) => {
      const downloadInfo = item.Id ? getDownloadedItemById(item.Id) : undefined;
      return toEpisode(item, downloadInfo, this.api);
    });
  }

  async getLatest(limit: number = 16): Promise<(Movie | Episode)[]> {
    const response = await getUserLibraryApi(this.api).getLatestMedia({
      userId: this.userId,
      limit,
      includeItemTypes: ["Movie", "Episode"],
      fields: ["MediaSources", "Genres"],
    });

    return (response.data || []).map((item) => {
      const downloadInfo = item.Id ? getDownloadedItemById(item.Id) : undefined;

      if (item.Type === "Movie") {
        return toMovie(item, downloadInfo, this.api);
      } else {
        return toEpisode(item, downloadInfo, this.api);
      }
    });
  }

  async getResumeItems(limit: number = 10): Promise<(Movie | Episode)[]> {
    const response = await getItemsApi(this.api).getResumeItems({
      userId: this.userId,
      limit,
      includeItemTypes: ["Movie", "Episode"],
      fields: ["MediaSources", "Genres"],
    });

    return (response.data.Items || []).map((item) => {
      const downloadInfo = item.Id ? getDownloadedItemById(item.Id) : undefined;

      if (item.Type === "Movie") {
        return toMovie(item, downloadInfo, this.api);
      } else {
        return toEpisode(item, downloadInfo, this.api);
      }
    });
  }

  // ========== User Data Mutations ==========

  async markFavorite(itemId: string): Promise<void> {
    await getUserLibraryApi(this.api).markFavoriteItem({
      userId: this.userId,
      itemId,
    });
  }

  async unmarkFavorite(itemId: string): Promise<void> {
    await getUserLibraryApi(this.api).unmarkFavoriteItem({
      userId: this.userId,
      itemId,
    });
  }

  async markPlayed(itemId: string, datePlayed?: Date): Promise<void> {
    await getPlaystateApi(this.api).markPlayedItem({
      userId: this.userId,
      itemId,
      datePlayed: datePlayed?.toISOString(),
    });
  }

  async markUnplayed(itemId: string): Promise<void> {
    await getPlaystateApi(this.api).markUnplayedItem({
      userId: this.userId,
      itemId,
    });
  }

  async updatePlaybackProgress(
    itemId: string,
    progress: PlaybackProgress,
  ): Promise<void> {
    await getPlaystateApi(this.api).reportPlaybackProgress({
      playbackProgressInfo: {
        ItemId: itemId,
        PositionTicks: progress.positionTicks,
        IsPaused: progress.isPaused,
        PlayMethod: "DirectPlay",
      },
    });
  }
}

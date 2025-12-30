import {
  getOfflineAlbumsAsDomainModels,
  getOfflineArtistsAsDomainModels,
  getOfflineMovies,
  getOfflineSeries,
  getOfflineSongsAsDomainModels,
} from "@/providers/OfflineLibrary/database";
import type { HomeSection, IHomeDataBackend } from "./types";

/**
 * Offline backend for home screen data
 * Provides sections based on downloaded content from MMKV
 * Now uses domain models (Album, Artist, Song) for better type safety and offline support
 */
export class OfflineHomeDataBackend implements IHomeDataBackend {
  isAvailable(): boolean {
    // Check if there's any downloaded content
    const albums = getOfflineAlbumsAsDomainModels();
    const artists = getOfflineArtistsAsDomainModels();
    const movies = getOfflineMovies();
    const series = getOfflineSeries();

    return (
      albums.length > 0 ||
      artists.length > 0 ||
      movies.length > 0 ||
      series.length > 0
    );
  }

  getDefaultSections(): HomeSection[] {
    const sections: HomeSection[] = [];

    // Downloaded Artists
    const artists = getOfflineArtistsAsDomainModels();
    if (artists.length > 0) {
      sections.push({
        title: "Downloaded Artists",
        queryKey: ["offline", "artists"],
        queryFn: async ({ pageParam = 0 }) => {
          const pageSize = 30;
          // Return the jellyfinItem from each domain model for compatibility
          return artists
            .slice(pageParam, pageParam + pageSize)
            .map((artist) => artist.jellyfinItem);
        },
        type: "InfiniteScrollingCollectionList",
        pageSize: 30,
      });
    }

    // Downloaded Albums (using domain models)
    const albums = getOfflineAlbumsAsDomainModels();

    if (albums.length > 0) {
      sections.push({
        title: "Downloaded Albums",
        queryKey: ["offline", "albums"],
        queryFn: async ({ pageParam = 0 }) => {
          const pageSize = 30;
          // Return the jellyfinItem from each domain model for compatibility
          return albums
            .slice(pageParam, pageParam + pageSize)
            .map((album) => album.jellyfinItem);
        },
        type: "InfiniteScrollingCollectionList",
        pageSize: 30,
      });
    }

    // Downloaded Songs (recently downloaded tracks)
    const songs = getOfflineSongsAsDomainModels();
    if (songs.length > 0) {
      // Sort by download date (most recent first)
      const recentSongs = songs
        .filter((song) => song.downloadInfo)
        .sort((a, b) => {
          const aDate = a.downloadInfo?.downloadedAt?.getTime() || 0;
          const bDate = b.downloadInfo?.downloadedAt?.getTime() || 0;
          return bDate - aDate;
        })
        .slice(0, 50); // Limit to 50 most recent

      if (recentSongs.length > 0) {
        sections.push({
          title: "Recently Downloaded Tracks",
          queryKey: ["offline", "recentSongs"],
          queryFn: async ({ pageParam = 0 }) => {
            const pageSize = 20;
            // Return the jellyfinItem from each domain model
            return recentSongs
              .slice(pageParam, pageParam + pageSize)
              .map((song) => song.jellyfinItem);
          },
          type: "InfiniteScrollingCollectionList",
          pageSize: 20,
        });
      }
    }

    // Downloaded Movies
    const movies = getOfflineMovies();
    if (movies.length > 0) {
      sections.push({
        title: "Downloaded Movies",
        queryKey: ["offline", "movies"],
        queryFn: async ({ pageParam = 0 }) => {
          const pageSize = 10;
          return movies.slice(pageParam, pageParam + pageSize);
        },
        type: "InfiniteScrollingCollectionList",
        pageSize: 10,
      });
    }

    // Downloaded TV Shows
    const series = getOfflineSeries();
    if (series.length > 0) {
      sections.push({
        title: "Downloaded TV Shows",
        queryKey: ["offline", "series"],
        queryFn: async ({ pageParam = 0 }) => {
          const pageSize = 10;
          return series.slice(pageParam, pageParam + pageSize);
        },
        type: "InfiniteScrollingCollectionList",
        pageSize: 10,
      });
    }

    console.log(
      `[OfflineBackend] Returning ${sections.length} sections: ${sections.map((s) => (s as any).title).join(", ")}`,
    );
    return sections;
  }
}

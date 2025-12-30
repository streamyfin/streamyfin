import type { Album, Artist, Song } from "@/models/music/types";
import { useOfflineLibrary } from "@/providers/OfflineLibrary/OfflineLibraryProvider";

/**
 * Hook for accessing offline music library
 * Returns music domain models from downloaded content only
 */
export function useOfflineMusic() {
  const { offlineMode, getOfflineArtists, getOfflineAlbums, getOfflineSongs } =
    useOfflineLibrary();

  return {
    offlineMode,
    artists: getOfflineArtists(),
    albums: getOfflineAlbums(),
    songs: getOfflineSongs(),
  };
}

/**
 * Hook for getting offline artists
 */
export function useOfflineArtists(): Artist[] {
  const { getOfflineArtists } = useOfflineLibrary();
  return getOfflineArtists();
}

/**
 * Hook for getting offline albums
 */
export function useOfflineAlbums(): Album[] {
  const { getOfflineAlbums } = useOfflineLibrary();
  return getOfflineAlbums();
}

/**
 * Hook for getting offline songs
 */
export function useOfflineSongs(): Song[] {
  const { getOfflineSongs } = useOfflineLibrary();
  return getOfflineSongs();
}

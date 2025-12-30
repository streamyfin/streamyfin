import { useAtomValue } from "jotai";
import React, { createContext, useContext, useMemo } from "react";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { useOfflineLibrary } from "@/providers/OfflineLibrary/OfflineLibraryProvider";
import type { MusicLibraryApi } from "@/services/api/interfaces/MusicLibraryApi";
import type { VideoLibraryApi } from "@/services/api/interfaces/VideoLibraryApi";
import { JellyfinMusicApi } from "@/services/api/jellyfin/JellyfinMusicApi";
import { JellyfinVideoApi } from "@/services/api/jellyfin/JellyfinVideoApi";
import { OfflineMusicApi } from "@/services/api/offline/OfflineMusicApi";
import { OfflineVideoApi } from "@/services/api/offline/OfflineVideoApi";

/**
 * Media API context value
 */
interface MediaApiContextValue {
  music: MusicLibraryApi;
  video: VideoLibraryApi;
}

const MediaApiContext = createContext<MediaApiContextValue | null>(null);

/**
 * Media API Provider
 * Automatically switches between online (Jellyfin) and offline implementations
 * based on network status and offline mode setting.
 *
 * Online mode: Returns all items, with downloaded ones enriched (source="offline")
 * Offline mode: Returns only downloaded items
 */
export function MediaApiProvider({ children }: { children: React.ReactNode }) {
  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);
  const { offlineMode } = useOfflineLibrary();

  const service = useMemo(() => {
    if (!api || !user?.Id) {
      // Return offline-only APIs if no server connection
      return {
        music: new OfflineMusicApi(),
        video: new OfflineVideoApi(),
      };
    }

    // Select implementation based on offline mode
    const music: MusicLibraryApi = offlineMode
      ? new OfflineMusicApi()
      : new JellyfinMusicApi(api, user.Id);

    const video: VideoLibraryApi = offlineMode
      ? new OfflineVideoApi()
      : new JellyfinVideoApi(api, user.Id);

    return { music, video };
  }, [api, user, offlineMode]);

  return (
    <MediaApiContext.Provider value={service}>
      {children}
    </MediaApiContext.Provider>
  );
}

/**
 * Hook to access media API service
 * @throws Error if used outside MediaApiProvider
 */
export function useMediaApi(): MediaApiContextValue {
  const context = useContext(MediaApiContext);
  if (!context) {
    throw new Error("useMediaApi must be used within MediaApiProvider");
  }
  return context;
}

/**
 * Hook to access music library API
 * Automatically uses online (Jellyfin) or offline implementation
 *
 * Online mode: All music, downloaded tracks have source="offline"
 * Offline mode: Only downloaded music
 */
export function useMusicApi(): MusicLibraryApi {
  const { music } = useMediaApi();
  return music;
}

/**
 * Hook to access video library API
 * Automatically uses online (Jellyfin) or offline implementation
 *
 * Online mode: All videos, downloaded items have source="offline"
 * Offline mode: Only downloaded videos
 */
export function useVideoApi(): VideoLibraryApi {
  const { video } = useMediaApi();
  return video;
}

import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { useQueryClient } from "@tanstack/react-query";
import { atom, useAtom } from "jotai";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from "react";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import type { Album, Artist, Song } from "@/models/music/types";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import {
  getOfflineAlbumsAsDomainModels,
  getOfflineArtistsAsDomainModels,
  getOfflineItemById,
  getOfflineSongsAsDomainModels,
  queryOfflineLibrary,
} from "./database";
import { isSyncNeeded, processSyncQueue } from "./sync";
import type { LibraryFilters, OfflineMutation } from "./types";

/**
 * Global atoms for offline library state
 */
export const forceOfflineAtom = atom<boolean>(false); // Manual override
export const syncQueueAtom = atom<OfflineMutation[]>([]);

/**
 * Derived atom for offline mode (network state + manual override)
 */
export const offlineModeAtom = atom((get) => {
  // We'll compute this in the provider using hooks
  // This is just a placeholder for now
  return get(forceOfflineAtom);
});

interface OfflineLibraryContextValue {
  offlineMode: boolean;
  forceOffline: boolean;
  setForceOffline: (value: boolean) => void;
  getLibraryItems: (filters?: LibraryFilters) => BaseItemDto[];
  getItemById: (itemId: string) => BaseItemDto | null;
  isItemAvailable: (itemId: string) => boolean;
  syncQueue: OfflineMutation[];

  // Domain model methods for music
  getOfflineArtists: () => Artist[];
  getOfflineAlbums: () => Album[];
  getOfflineSongs: () => Song[];
}

const OfflineLibraryContext = createContext<OfflineLibraryContextValue | null>(
  null,
);

function useOfflineLibraryProvider(): OfflineLibraryContextValue {
  const [forceOffline, setForceOffline] = useAtom(forceOfflineAtom);
  const [syncQueue, setSyncQueue] = useAtom(syncQueueAtom);
  const { isConnected, serverConnected } = useNetworkStatus();
  const queryClient = useQueryClient();
  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);

  // AbortController for canceling sync when going offline
  const syncAbortControllerRef = useRef<AbortController | null>(null);

  // Compute offline mode: either network is down OR user forced offline
  const offlineMode = useMemo(() => {
    return !isConnected || serverConnected === false || forceOffline;
  }, [isConnected, serverConnected, forceOffline]);

  // Get library items with optional filtering
  const getLibraryItems = useCallback(
    (filters?: LibraryFilters): BaseItemDto[] => {
      if (!offlineMode) {
        return []; // Online mode - let React Query handle it
      }
      const result = queryOfflineLibrary(filters);
      return result.items;
    },
    [offlineMode],
  );

  // Get single item by ID
  const getItemById = useCallback(
    (itemId: string): BaseItemDto | null => {
      if (!offlineMode) {
        return null; // Online mode - let React Query handle it
      }
      return getOfflineItemById(itemId);
    },
    [offlineMode],
  );

  // Check if item is available offline
  const isItemAvailable = useCallback((itemId: string): boolean => {
    return getOfflineItemById(itemId) !== null;
  }, []);

  // Get offline music as domain models
  const getOfflineArtists = useCallback((): Artist[] => {
    if (!offlineMode) return [];
    return getOfflineArtistsAsDomainModels();
  }, [offlineMode]);

  const getOfflineAlbums = useCallback((): Album[] => {
    if (!offlineMode) return [];
    return getOfflineAlbumsAsDomainModels();
  }, [offlineMode]);

  const getOfflineSongs = useCallback((): Song[] => {
    if (!offlineMode) return [];
    return getOfflineSongsAsDomainModels();
  }, [offlineMode]);

  // Load sync queue from storage on mount
  useEffect(() => {
    // TODO: Load from MMKV in Phase 3
    // const queue = getOfflineMutationQueue();
    // setSyncQueue(queue.mutations);
  }, [setSyncQueue]);

  // Detect when we go back online and invalidate queries
  const prevOfflineMode = useRef(offlineMode);
  useEffect(() => {
    // If we just transitioned from offline to online
    if (!offlineMode && prevOfflineMode.current) {
      // Invalidate all queries so they refetch from the server
      queryClient.invalidateQueries();
    }
    prevOfflineMode.current = offlineMode;
  }, [offlineMode, queryClient]);

  // Auto-sync when connection restored
  const prevServerConnected = useRef(serverConnected);
  useEffect(() => {
    if (serverConnected && !prevServerConnected.current) {
      // Connection restored - trigger sync if needed
      if (isSyncNeeded()) {
        // Create new AbortController for this sync operation
        syncAbortControllerRef.current = new AbortController();

        processSyncQueue(api, user?.Id, syncAbortControllerRef.current.signal)
          .then((result) => {
            console.log(
              `[OfflineLibrary] Sync completed: ${result.success} success, ${result.failed} failed, ${result.skipped} skipped`,
            );
            // Invalidate queries to refresh UI with synced data
            queryClient.invalidateQueries();
          })
          .catch((error) => {
            console.error("[OfflineLibrary] Sync failed:", error);
          })
          .finally(() => {
            // Clear the abort controller after sync completes or fails
            syncAbortControllerRef.current = null;
          });
      } else {
      }
    }
    prevServerConnected.current = serverConnected;
  }, [serverConnected, api, user?.Id, queryClient]);

  // Abort ongoing sync when going offline
  useEffect(() => {
    if (offlineMode && syncAbortControllerRef.current) {
      syncAbortControllerRef.current.abort();
      syncAbortControllerRef.current = null;
    }
  }, [offlineMode]);

  return {
    offlineMode,
    forceOffline,
    setForceOffline,
    getLibraryItems,
    getItemById,
    isItemAvailable,
    syncQueue,
    getOfflineArtists,
    getOfflineAlbums,
    getOfflineSongs,
  };
}

export function OfflineLibraryProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const value = useOfflineLibraryProvider();

  return (
    <OfflineLibraryContext.Provider value={value}>
      {children}
    </OfflineLibraryContext.Provider>
  );
}

export function useOfflineLibrary() {
  const context = useContext(OfflineLibraryContext);
  if (!context) {
    throw new Error(
      "useOfflineLibrary must be used within an OfflineLibraryProvider",
    );
  }
  return context;
}

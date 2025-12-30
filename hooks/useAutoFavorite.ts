import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { getUserLibraryApi } from "@jellyfin/sdk/lib/utils/api";
import { useAtomValue } from "jotai";
import { useCallback, useRef } from "react";
import {
  addListenTime,
  getPlayCount,
  incrementPlayCount,
  markAsAutoFavorited,
  wasAutoFavorited,
} from "@/providers/AudioPlayer/database";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { useSettings } from "@/utils/atoms/settings";
import { useNetworkStatus } from "./useNetworkStatus";

interface UseAutoFavoriteOptions {
  /** Minimum percentage of track to listen before counting as a play */
  minPlayPercentage?: number;
}

/**
 * Hook for tracking audio plays and auto-favoriting tracks
 * when they've been played enough times.
 */
export function useAutoFavorite(options: UseAutoFavoriteOptions = {}) {
  const { minPlayPercentage = 80 } = options;

  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);
  const { settings } = useSettings();
  const { isConnected } = useNetworkStatus();

  // Track listening sessions per item
  const listeningSessions = useRef<
    Map<
      string,
      {
        startTime: number;
        lastPosition: number;
        duration: number;
        hasCountedPlay: boolean;
      }
    >
  >(new Map());

  /**
   * Start tracking a listening session for a track
   */
  const startListening = useCallback((item: BaseItemDto, duration: number) => {
    if (!item.Id) return;

    listeningSessions.current.set(item.Id, {
      startTime: Date.now(),
      lastPosition: 0,
      duration,
      hasCountedPlay: false,
    });
  }, []);

  /**
   * Update the listening progress for a track
   */
  const updateProgress = useCallback(
    (item: BaseItemDto, currentPosition: number) => {
      if (!item.Id) return;

      const session = listeningSessions.current.get(item.Id);
      if (!session) return;

      session.lastPosition = currentPosition;

      // Check if we've listened to enough of the track to count as a play
      const percentageListened = (currentPosition / session.duration) * 100;

      if (percentageListened >= minPlayPercentage && !session.hasCountedPlay) {
        session.hasCountedPlay = true;
        handlePlayCompleted(item);
      }
    },
    [minPlayPercentage],
  );

  /**
   * End a listening session and record the listen time
   */
  const endListening = useCallback((item: BaseItemDto) => {
    if (!item.Id) return;

    const session = listeningSessions.current.get(item.Id);
    if (!session) return;

    // Calculate total listen time for this session
    const listenTime = session.lastPosition;
    if (listenTime > 0) {
      addListenTime(item.Id, listenTime);
    }

    listeningSessions.current.delete(item.Id);
  }, []);

  /**
   * Handle when a play is counted (track listened to completion threshold)
   */
  const handlePlayCompleted = useCallback(
    async (item: BaseItemDto) => {
      if (!item.Id) return;

      // Increment play count
      const stats = incrementPlayCount(item.Id);

      // Check if we should auto-favorite
      const threshold = settings.autoFavoritePlayCount || 5;

      if (
        stats.playCount >= threshold &&
        !stats.autoFavorited &&
        !item.UserData?.IsFavorite
      ) {
        // Mark as auto-favorited locally
        markAsAutoFavorited(item.Id);

        // If online, mark as favorite on server
        if (isConnected && api && user) {
          try {
            await getUserLibraryApi(api).markFavoriteItem({
              userId: user.Id,
              itemId: item.Id,
            });
            console.log(
              `Auto-favorited "${item.Name}" after ${stats.playCount} plays`,
            );
          } catch (error) {
            console.error("Failed to auto-favorite track:", error);
          }
        }
      }
    },
    [api, user, settings.autoFavoritePlayCount, isConnected],
  );

  /**
   * Check if a track should be auto-favorited based on play count
   */
  const shouldAutoFavorite = useCallback(
    (itemId: string): boolean => {
      const playCount = getPlayCount(itemId);
      const threshold = settings.autoFavoritePlayCount || 5;
      return playCount >= threshold && !wasAutoFavorited(itemId);
    },
    [settings.autoFavoritePlayCount],
  );

  /**
   * Get the current play count for a track
   */
  const getTrackPlayCount = useCallback((itemId: string): number => {
    return getPlayCount(itemId);
  }, []);

  /**
   * Check if a track was auto-favorited
   */
  const isAutoFavorited = useCallback((itemId: string): boolean => {
    return wasAutoFavorited(itemId);
  }, []);

  return {
    startListening,
    updateProgress,
    endListening,
    shouldAutoFavorite,
    getTrackPlayCount,
    isAutoFavorited,
  };
}

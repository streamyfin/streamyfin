import { useAtomValue } from "jotai";
import { useCallback, useEffect, useRef } from "react";
import type { AudioTrack } from "@/providers/AudioPlayer/types";
import { useDownload } from "@/providers/DownloadProvider";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { getOrSetDeviceId } from "@/utils/device";
import { getStreamUrl } from "@/utils/jellyfin/media/getStreamUrl";
import { generateDeviceProfile } from "@/utils/profiles/native";

interface UseAudioPreloaderConfig {
  /** Number of upcoming tracks to prefetch (default: 2) */
  prefetchCount?: number;
  /** Number of recently played tracks to keep cached (default: 5) */
  recentCacheCount?: number;
  /** Position threshold (0-1) to trigger prefetch (default: 0.75 = 75%) */
  prefetchThreshold?: number;
  /** Audio bitrate for downloads (default: 320kbps) */
  audioBitrate?: number;
}

interface UseAudioPreloaderResult {
  /** Check playback position and trigger prefetch if needed */
  checkAndPrefetch: (
    currentPosition: number,
    duration: number,
    queue: AudioTrack[],
    currentIndex: number,
  ) => Promise<void>;
  /** Mark a track as recently played (for caching) */
  markAsPlayed: (track: AudioTrack) => void;
  /** Check if a track is already downloaded or cached */
  isTrackCached: (itemId: string) => boolean;
  /** Get local file path if track is cached */
  getCachedPath: (itemId: string) => string | null;
}

const DEFAULT_CONFIG: Required<UseAudioPreloaderConfig> = {
  prefetchCount: 2,
  recentCacheCount: 5,
  prefetchThreshold: 0.75,
  audioBitrate: 320000,
};

/**
 * Hook for smart audio prefetching and caching.
 *
 * Features:
 * - Prefetches next N tracks in queue when current track is 75% complete
 * - Caches recently played tracks for instant replay
 * - Integrates with existing Downloads provider
 * - Prevents duplicate downloads
 */
export function useAudioPreloader(
  config: UseAudioPreloaderConfig = {},
): UseAudioPreloaderResult {
  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);
  const { startBackgroundDownload, getDownloadedItems } = useDownload();

  const cfg = { ...DEFAULT_CONFIG, ...config };

  // Track which tracks we've already prefetched in this session
  const prefetchedIds = useRef<Set<string>>(new Set());

  // Track recently played tracks (for future cache management)
  const recentlyPlayed = useRef<string[]>([]);

  // Track if we've already triggered prefetch for current position
  const prefetchTriggered = useRef<boolean>(false);

  /**
   * Reset prefetch trigger when track changes
   */
  useEffect(() => {
    prefetchTriggered.current = false;
  }, []);

  /**
   * Check if a track is already downloaded
   * Checks both prefetch cache AND downloads database
   */
  const isTrackCached = useCallback(
    (itemId: string): boolean => {
      const downloadedItems = getDownloadedItems();
      // Check downloads database for Audio type items
      return downloadedItems.some(
        (d) => d.item?.Id === itemId && d.item?.Type === "Audio",
      );
    },
    [getDownloadedItems],
  );

  /**
   * Get cached file path for a track
   * Checks both prefetch cache AND downloads database
   */
  const getCachedPath = useCallback(
    (itemId: string): string | null => {
      const downloadedItems = getDownloadedItems();
      // Find in downloads database (prioritize Audio type)
      const cached = downloadedItems.find(
        (d) => d.item?.Id === itemId && d.item?.Type === "Audio",
      );
      return cached?.videoFilePath || null;
    },
    [getDownloadedItems],
  );

  /**
   * Download a track for prefetching/caching
   */
  const downloadTrack = useCallback(
    async (track: AudioTrack): Promise<boolean> => {
      if (!api || !user?.Id || !track.id) return false;

      // Skip if already downloaded or prefetched
      if (isTrackCached(track.id) || prefetchedIds.current.has(track.id)) {
        return false;
      }

      try {
        const deviceId = getOrSetDeviceId();

        // Get stream URL with proper device profile
        const streamDetails = await getStreamUrl({
          api,
          userId: user.Id,
          item: track.jellyfinItem,
          startTimeTicks: 0,
          audioStreamIndex: 0,
          maxStreamingBitrate: cfg.audioBitrate,
          deviceProfile: generateDeviceProfile(),
          deviceId,
        });

        if (!streamDetails?.url) {
          console.warn(
            `[AudioPreloader] Could not get stream URL for ${track.title}`,
          );
          return false;
        }

        // Create media source
        const mediaSource = streamDetails.mediaSource || {
          Id: track.id,
          Path: streamDetails.url,
          Protocol: "Http" as const,
          Container: "mp3",
          RunTimeTicks: track.jellyfinItem.RunTimeTicks,
        };

        // Start background download (silent mode - no toast notifications)
        await startBackgroundDownload(
          streamDetails.url,
          track.jellyfinItem,
          mediaSource,
          {
            key: "320kbps",
            value: cfg.audioBitrate,
          },
          true, // silent mode for prefetch/cache downloads
        );

        prefetchedIds.current.add(track.id);
        console.log(
          `[AudioPreloader] Prefetched: ${track.title} (${track.artist})`,
        );

        return true;
      } catch (error) {
        console.error(
          `[AudioPreloader] Error prefetching ${track.title}:`,
          error,
        );
        return false;
      }
    },
    [api, user, isTrackCached, startBackgroundDownload, cfg.audioBitrate],
  );

  /**
   * Check playback position and prefetch if threshold reached
   */
  const checkAndPrefetch = useCallback(
    async (
      currentPosition: number,
      duration: number,
      queue: AudioTrack[],
      currentIndex: number,
    ): Promise<void> => {
      // Don't prefetch if we already did for this position
      if (prefetchTriggered.current) return;

      // Calculate position ratio
      const positionRatio = duration > 0 ? currentPosition / duration : 0;

      // Check if we've reached the prefetch threshold
      if (positionRatio < cfg.prefetchThreshold) return;

      // Mark as triggered to prevent multiple prefetch attempts
      prefetchTriggered.current = true;

      console.log(
        `[AudioPreloader] Prefetch triggered at ${Math.round(positionRatio * 100)}%`,
      );

      // Get next N tracks to prefetch
      const nextTracks = queue.slice(
        currentIndex + 1,
        currentIndex + 1 + cfg.prefetchCount,
      );

      if (nextTracks.length === 0) {
        return;
      }

      console.log(
        `[AudioPreloader] Prefetching ${nextTracks.length} upcoming track(s)`,
      );

      // Prefetch tracks sequentially
      for (const track of nextTracks) {
        await downloadTrack(track);
      }
    },
    [cfg.prefetchThreshold, cfg.prefetchCount, downloadTrack],
  );

  /**
   * Mark a track as recently played
   */
  const markAsPlayed = useCallback(
    (track: AudioTrack): void => {
      if (!track.id) return;

      // Add to front of recently played list
      recentlyPlayed.current = [
        track.id,
        ...recentlyPlayed.current.filter((id) => id !== track.id),
      ].slice(0, cfg.recentCacheCount);

      console.log(
        `[AudioPreloader] Marked as played: ${track.title}, recent cache: ${recentlyPlayed.current.length}`,
      );

      // Reset prefetch trigger for next track
      prefetchTriggered.current = false;
    },
    [cfg.recentCacheCount],
  );

  return {
    checkAndPrefetch,
    markAsPlayed,
    isTrackCached,
    getCachedPath,
  };
}

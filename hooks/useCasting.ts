/**
 * Unified Casting Hook
 * Protocol-agnostic casting interface - currently supports Chromecast
 * Architecture allows for future protocol integrations
 */

import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { getPlaystateApi } from "@jellyfin/sdk/lib/utils/api";
import { useAtomValue } from "jotai";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  CastState,
  useCastDevice,
  useCastState,
  useMediaStatus,
  useRemoteMediaClient,
} from "react-native-google-cast";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import type { CastPlayerState, CastProtocol } from "@/utils/casting/types";
import { DEFAULT_CAST_STATE } from "@/utils/casting/types";

/**
 * Unified hook for managing casting
 * Extensible architecture supporting multiple protocols
 */
export const useCasting = (item: BaseItemDto | null) => {
  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);

  // Chromecast hooks
  const client = useRemoteMediaClient();
  const castDevice = useCastDevice();
  const castState = useCastState();
  const mediaStatus = useMediaStatus();

  // Local state
  const [state, setState] = useState<CastPlayerState>(DEFAULT_CAST_STATE);
  const lastReportedProgressRef = useRef(0);
  const volumeDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const hasReportedStartRef = useRef<string | null>(null); // Track which item we reported start for
  const stateRef = useRef<CastPlayerState>(DEFAULT_CAST_STATE); // Ref for progress reporting without deps

  // Helper to update both state and ref
  const updateState = useCallback(
    (updater: (prev: CastPlayerState) => CastPlayerState) => {
      setState((prev) => {
        const next = updater(prev);
        stateRef.current = next;
        return next;
      });
    },
    [],
  );

  // Detect which protocol is active - use CastState for reliable detection
  const chromecastConnected = castState === CastState.CONNECTED;
  // Future: Add detection for other protocols here

  const activeProtocol: CastProtocol | null = chromecastConnected
    ? "chromecast"
    : null;

  const isConnected = chromecastConnected;

  // Update current device
  useEffect(() => {
    if (chromecastConnected && castDevice) {
      updateState((prev) => ({
        ...prev,
        isConnected: true,
        protocol: "chromecast",
        currentDevice: {
          id: castDevice.deviceId,
          name: castDevice.friendlyName || castDevice.deviceId,
          protocol: "chromecast",
        },
      }));
    } else {
      updateState((prev) => ({
        ...prev,
        isConnected: false,
        protocol: null,
        currentDevice: null,
      }));
    }
    // Future: Add device detection for other protocols
  }, [chromecastConnected, castDevice]);

  // Chromecast: Update playback state
  useEffect(() => {
    if (activeProtocol === "chromecast" && mediaStatus) {
      updateState((prev) => ({
        ...prev,
        isPlaying: mediaStatus.playerState === "playing",
        progress: (mediaStatus.streamPosition || 0) * 1000,
        duration: (mediaStatus.mediaInfo?.streamDuration || 0) * 1000,
        isBuffering: mediaStatus.playerState === "buffering",
      }));
    }
  }, [mediaStatus, activeProtocol, updateState]);

  // Chromecast: Sync volume from mediaStatus
  useEffect(() => {
    if (activeProtocol !== "chromecast") return;

    // Sync from mediaStatus when available
    if (mediaStatus?.volume !== undefined) {
      updateState((prev) => ({
        ...prev,
        volume: mediaStatus.volume,
      }));
    }
  }, [mediaStatus?.volume, activeProtocol, updateState]);

  // Progress reporting to Jellyfin (matches native player behavior)
  // Uses stateRef to read current progress/volume without adding them as deps
  useEffect(() => {
    if (!isConnected || !item?.Id || !user?.Id || !api) return;

    const playStateApi = getPlaystateApi(api);

    // Report playback start when media begins (only once per item)
    const currentState = stateRef.current;
    if (hasReportedStartRef.current !== item.Id && currentState.progress > 0) {
      // Set synchronously before async call to prevent race condition duplicates
      hasReportedStartRef.current = item.Id || null;

      playStateApi
        .reportPlaybackStart({
          playbackStartInfo: {
            ItemId: item.Id,
            PositionTicks: Math.floor(currentState.progress * 10000),
            PlayMethod:
              activeProtocol === "chromecast" ? "DirectStream" : "DirectPlay",
            VolumeLevel: Math.floor(currentState.volume * 100),
            IsMuted: currentState.volume === 0,
            PlaySessionId: mediaStatus?.mediaInfo?.contentId,
          },
        })
        .catch((error) => {
          // Revert on failure so it can be retried
          hasReportedStartRef.current = null;
          console.error("[useCasting] Failed to report playback start:", error);
        });
    }

    const reportProgress = () => {
      const s = stateRef.current;
      // Don't report if no meaningful progress or if buffering
      if (s.progress <= 0 || s.isBuffering) return;

      const progressMs = Math.floor(s.progress);
      const progressTicks = progressMs * 10000; // Convert ms to ticks
      const progressSeconds = Math.floor(progressMs / 1000);

      // When paused, always report to keep server in sync
      // When playing, skip if progress hasn't changed significantly (less than 3 seconds)
      if (
        s.isPlaying &&
        Math.abs(progressSeconds - lastReportedProgressRef.current) < 3
      ) {
        return;
      }

      lastReportedProgressRef.current = progressSeconds;

      playStateApi
        .reportPlaybackProgress({
          playbackProgressInfo: {
            ItemId: item.Id,
            PositionTicks: progressTicks,
            IsPaused: !s.isPlaying,
            PlayMethod:
              activeProtocol === "chromecast" ? "DirectStream" : "DirectPlay",
            VolumeLevel: Math.floor(s.volume * 100),
            IsMuted: s.volume === 0,
            PlaySessionId: mediaStatus?.mediaInfo?.contentId,
          },
        })
        .catch((error) => {
          console.error("[useCasting] Failed to report progress:", error);
        });
    };

    // Report progress on a fixed interval, reading latest state from ref
    const interval = setInterval(reportProgress, 10000);
    return () => clearInterval(interval);
  }, [
    api,
    item?.Id,
    user?.Id,
    isConnected,
    activeProtocol,
    mediaStatus?.mediaInfo?.contentId,
  ]);

  // Play/Pause controls
  const play = useCallback(async () => {
    if (activeProtocol === "chromecast") {
      // Check if there's an active media session
      if (!client || !mediaStatus?.mediaInfo) {
        console.warn(
          "[useCasting] Cannot play - no active media session. Media needs to be loaded first.",
        );
        return;
      }
      try {
        await client.play();
      } catch (error) {
        console.error("[useCasting] Error playing:", error);
        throw error;
      }
    }
    // Future: Add play control for other protocols
  }, [client, mediaStatus, activeProtocol]);

  const pause = useCallback(async () => {
    if (activeProtocol === "chromecast") {
      try {
        await client?.pause();
      } catch (error) {
        console.error("[useCasting] Error pausing:", error);
        throw error;
      }
    }
    // Future: Add pause control for other protocols
  }, [client, activeProtocol]);

  const togglePlayPause = useCallback(async () => {
    if (state.isPlaying) {
      await pause();
    } else {
      await play();
    }
  }, [state.isPlaying, play, pause]);

  // Seek controls
  const seek = useCallback(
    async (positionMs: number) => {
      // Validate position
      if (positionMs < 0 || !Number.isFinite(positionMs)) {
        console.error("[useCasting] Invalid seek position (ms):", positionMs);
        return;
      }

      const positionSeconds = positionMs / 1000;

      // Additional validation for Chromecast
      if (activeProtocol === "chromecast") {
        // state.duration is in ms, positionSeconds is in seconds - compare in same unit
        // Only clamp when duration is known (> 0) to avoid forcing seeks to 0
        const durationSeconds = state.duration / 1000;
        if (durationSeconds > 0 && positionSeconds > durationSeconds) {
          console.warn(
            "[useCasting] Seek position exceeds duration, clamping:",
            positionSeconds,
            "->",
            durationSeconds,
          );
          await client?.seek({ position: durationSeconds });
          return;
        }
        await client?.seek({ position: positionSeconds });
      }
      // Future: Add seek control for other protocols
    },
    [client, activeProtocol, state.duration],
  );

  const skipForward = useCallback(
    async (seconds = 10) => {
      const newPosition = state.progress + seconds * 1000;
      await seek(Math.min(newPosition, state.duration));
    },
    [state.progress, state.duration, seek],
  );

  const skipBackward = useCallback(
    async (seconds = 10) => {
      const newPosition = state.progress - seconds * 1000;
      await seek(Math.max(newPosition, 0));
    },
    [state.progress, seek],
  );

  // Stop and disconnect
  const stop = useCallback(
    async (onStopComplete?: () => void) => {
      try {
        if (activeProtocol === "chromecast") {
          await client?.stop();
        }
        // Future: Add stop control for other protocols

        // Report stop to Jellyfin
        if (api && item?.Id && user?.Id) {
          const playStateApi = getPlaystateApi(api);
          await playStateApi.reportPlaybackStopped({
            playbackStopInfo: {
              ItemId: item.Id,
              PositionTicks: stateRef.current.progress * 10000,
            },
          });
        }
      } catch (error) {
        console.error("[useCasting] Error during stop:", error);
      } finally {
        hasReportedStartRef.current = null;
        setState(DEFAULT_CAST_STATE);
        stateRef.current = DEFAULT_CAST_STATE;

        // Call callback after stop completes (e.g., to navigate away)
        if (onStopComplete) {
          onStopComplete();
        }
      }
    },
    [client, api, item?.Id, user?.Id, activeProtocol],
  );

  // Volume control (debounced to reduce API calls)
  const setVolume = useCallback(
    (volume: number) => {
      const clampedVolume = Math.max(0, Math.min(1, volume));

      // Update UI immediately
      updateState((prev) => ({ ...prev, volume: clampedVolume }));

      // Debounce API call
      if (volumeDebounceRef.current) {
        clearTimeout(volumeDebounceRef.current);
      }

      volumeDebounceRef.current = setTimeout(async () => {
        if (activeProtocol === "chromecast" && client && isConnected) {
          // Use setStreamVolume for media stream volume (0.0 - 1.0)
          // Physical volume buttons are handled automatically by the framework
          await client.setStreamVolume(clampedVolume).catch(() => {
            // Ignore errors - session might have ended
          });
        }
        // Future: Add volume control for other protocols
      }, 300);
    },
    [client, activeProtocol, isConnected],
  );

  // Cleanup
  useEffect(() => {
    return () => {
      if (volumeDebounceRef.current) {
        clearTimeout(volumeDebounceRef.current);
      }
    };
  }, []);

  return {
    // State
    isConnected,
    protocol: activeProtocol,
    isPlaying: state.isPlaying,
    isBuffering: state.isBuffering,
    currentItem: item,
    currentDevice: state.currentDevice,
    progress: state.progress,
    duration: state.duration,
    volume: state.volume,

    // Availability
    isChromecastAvailable: true, // Always available via react-native-google-cast

    // Raw clients (for advanced operations)
    remoteMediaClient: client,

    // Controls
    play,
    pause,
    togglePlayPause,
    seek,
    skipForward,
    skipBackward,
    stop,
    setVolume,
  };
};

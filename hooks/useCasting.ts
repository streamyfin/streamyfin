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
  useCastDevice,
  useCastSession,
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
  // const { settings } = useSettings(); // TODO: Use for preferences

  // Chromecast hooks
  const client = useRemoteMediaClient();
  const castDevice = useCastDevice();
  const mediaStatus = useMediaStatus();
  const castSession = useCastSession();

  // Local state
  const [state, setState] = useState<CastPlayerState>(DEFAULT_CAST_STATE);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastReportedProgressRef = useRef(0);
  const volumeDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const hasReportedStartRef = useRef<string | null>(null); // Track which item we reported start for

  // Detect which protocol is active
  const chromecastConnected = castDevice !== null;
  // Future: Add detection for other protocols here

  const activeProtocol: CastProtocol | null = chromecastConnected
    ? "chromecast"
    : null;

  const isConnected = chromecastConnected;

  // Update current device
  useEffect(() => {
    if (chromecastConnected && castDevice) {
      setState((prev) => ({
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
      setState((prev) => ({
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
      setState((prev) => ({
        ...prev,
        isPlaying: mediaStatus.playerState === "playing",
        progress: (mediaStatus.streamPosition || 0) * 1000,
        duration: (mediaStatus.mediaInfo?.streamDuration || 0) * 1000,
        isBuffering: mediaStatus.playerState === "buffering",
      }));
    }
  }, [mediaStatus, activeProtocol]);

  // Chromecast: Sync volume from device (both mediaStatus and CastSession)
  useEffect(() => {
    if (activeProtocol !== "chromecast") return;

    // Sync from mediaStatus when available
    if (mediaStatus?.volume !== undefined) {
      setState((prev) => ({
        ...prev,
        volume: mediaStatus.volume,
      }));
    }

    // Also poll CastSession for device volume to catch physical button changes
    if (castSession) {
      const volumeInterval = setInterval(() => {
        castSession
          .getVolume()
          .then((deviceVolume) => {
            if (deviceVolume !== undefined) {
              setState((prev) => {
                // Only update if significantly different to avoid jitter
                if (Math.abs(prev.volume - deviceVolume) > 0.01) {
                  return { ...prev, volume: deviceVolume };
                }
                return prev;
              });
            }
          })
          .catch(() => {
            // Ignore errors - device might be disconnected
          });
      }, 500); // Check every 500ms

      return () => clearInterval(volumeInterval);
    }
  }, [mediaStatus?.volume, castSession, activeProtocol]);

  // Progress reporting to Jellyfin (matches native player behavior)
  useEffect(() => {
    if (!isConnected || !item?.Id || !user?.Id || !api) return;

    const playStateApi = getPlaystateApi(api);

    // Report playback start when media begins (only once per item)
    if (hasReportedStartRef.current !== item.Id && state.progress > 0) {
      playStateApi
        .reportPlaybackStart({
          playbackStartInfo: {
            ItemId: item.Id,
            PositionTicks: Math.floor(state.progress * 10000),
            PlayMethod:
              activeProtocol === "chromecast" ? "DirectStream" : "DirectPlay",
            VolumeLevel: Math.floor(state.volume * 100),
            IsMuted: state.volume === 0,
            PlaySessionId: mediaStatus?.mediaInfo?.contentId,
          },
        })
        .then(() => {
          hasReportedStartRef.current = item.Id || null;
        })
        .catch((error) => {
          console.error("[useCasting] Failed to report playback start:", error);
        });
    }

    const reportProgress = () => {
      // Don't report if no meaningful progress or if buffering
      if (state.progress <= 0 || state.isBuffering) return;

      const progressMs = Math.floor(state.progress);
      const progressTicks = progressMs * 10000; // Convert ms to ticks
      const progressSeconds = Math.floor(progressMs / 1000);

      // When paused, always report to keep server in sync
      // When playing, skip if progress hasn't changed significantly (less than 3 seconds)
      if (
        state.isPlaying &&
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
            IsPaused: !state.isPlaying,
            PlayMethod:
              activeProtocol === "chromecast" ? "DirectStream" : "DirectPlay",
            // Add volume level for server tracking
            VolumeLevel: Math.floor(state.volume * 100),
            IsMuted: state.volume === 0,
            // Include play session ID if available
            PlaySessionId: mediaStatus?.mediaInfo?.contentId,
          },
        })
        .catch((error) => {
          console.error("[useCasting] Failed to report progress:", error);
        });
    };

    // Report immediately on play/pause state change
    reportProgress();

    // Report every 5 seconds when paused, every 10 seconds when playing
    const interval = setInterval(
      reportProgress,
      state.isPlaying ? 10000 : 5000,
    );
    return () => clearInterval(interval);
  }, [
    api,
    item?.Id,
    user?.Id,
    state.progress,
    state.isPlaying,
    state.isBuffering, // Add buffering state to dependencies
    state.volume,
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
      await client?.pause();
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
        if (positionSeconds > state.duration) {
          console.warn(
            "[useCasting] Seek position exceeds duration, clamping:",
            positionSeconds,
            "->",
            state.duration,
          );
          await client?.seek({ position: state.duration });
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
            PositionTicks: state.progress * 10000,
          },
        });
      }

      setState(DEFAULT_CAST_STATE);

      // Call callback after stop completes (e.g., to navigate away)
      if (onStopComplete) {
        onStopComplete();
      }
    },
    [client, api, item?.Id, user?.Id, state.progress, activeProtocol],
  );

  // Volume control (debounced to reduce API calls)
  const setVolume = useCallback(
    (volume: number) => {
      const clampedVolume = Math.max(0, Math.min(1, volume));

      // Update UI immediately
      setState((prev) => ({ ...prev, volume: clampedVolume }));

      // Debounce API call
      if (volumeDebounceRef.current) {
        clearTimeout(volumeDebounceRef.current);
      }

      volumeDebounceRef.current = setTimeout(async () => {
        if (activeProtocol === "chromecast" && client && isConnected) {
          // Use setStreamVolume for media stream volume (0.0 - 1.0)
          // Physical volume buttons are handled automatically by the framework
          await client.setStreamVolume(clampedVolume).catch((error) => {
            console.log(
              "[useCasting] Volume set failed (no session):",
              error.message,
            );
          });
        }
        // Future: Add volume control for other protocols
      }, 300);
    },
    [client, activeProtocol],
  );

  // Controls visibility
  const showControls = useCallback(() => {
    setState((prev) => ({ ...prev, showControls: true }));

    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    controlsTimeoutRef.current = setTimeout(() => {
      if (state.isPlaying) {
        setState((prev) => ({ ...prev, showControls: false }));
      }
    }, 5000);
  }, [state.isPlaying]);

  const hideControls = useCallback(() => {
    setState((prev) => ({ ...prev, showControls: false }));
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
  }, []);

  // Cleanup
  useEffect(() => {
    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
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
    // Future: Add availability checks for other protocols

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
    showControls,
    hideControls,
  };
};

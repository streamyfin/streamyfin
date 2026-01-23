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

  // Local state
  const [state, setState] = useState<CastPlayerState>(DEFAULT_CAST_STATE);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastReportedProgressRef = useRef(0);
  const volumeDebounceRef = useRef<NodeJS.Timeout | null>(null);

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

  // Chromecast: Sync volume from device
  useEffect(() => {
    if (activeProtocol === "chromecast" && mediaStatus?.volume !== undefined) {
      setState((prev) => ({
        ...prev,
        volume: mediaStatus.volume,
      }));
    }
  }, [mediaStatus?.volume, activeProtocol]);

  // Progress reporting to Jellyfin (optimized to skip redundant reports)
  useEffect(() => {
    if (!isConnected || !item?.Id || !user?.Id || state.progress <= 0) return;

    const reportProgress = () => {
      const progressSeconds = Math.floor(state.progress / 1000);

      // Skip if progress hasn't changed significantly (less than 5 seconds)
      if (Math.abs(progressSeconds - lastReportedProgressRef.current) < 5) {
        return;
      }

      lastReportedProgressRef.current = progressSeconds;
      const playStateApi = api ? getPlaystateApi(api) : null;
      playStateApi
        ?.reportPlaybackProgress({
          playbackProgressInfo: {
            ItemId: item.Id,
            PositionTicks: progressSeconds * 10000000,
            IsPaused: !state.isPlaying,
            PlayMethod:
              activeProtocol === "chromecast" ? "DirectStream" : "DirectPlay",
          },
        })
        .catch(console.error);
    };

    const interval = setInterval(reportProgress, 10000);
    return () => clearInterval(interval);
  }, [
    api,
    item?.Id,
    user?.Id,
    state.progress,
    state.isPlaying,
    isConnected,
    activeProtocol,
  ]);

  // Play/Pause controls
  const play = useCallback(async () => {
    if (activeProtocol === "chromecast") {
      await client?.play();
    }
    // Future: Add play control for other protocols
  }, [client, activeProtocol]);

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
      if (activeProtocol === "chromecast") {
        await client?.seek({ position: positionMs / 1000 });
      }
      // Future: Add seek control for other protocols
    },
    [client, activeProtocol],
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
  const stop = useCallback(async () => {
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
  }, [client, api, item?.Id, user?.Id, state.progress, activeProtocol]);

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

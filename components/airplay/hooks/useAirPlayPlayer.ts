/**
 * AirPlay Player Hook
 * Manages AirPlay playback state and controls for iOS devices
 *
 * Note: AirPlay for video is handled natively by AVFoundation/MPV player.
 * This hook tracks the state and provides a unified interface for the UI.
 */

import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { useAtomValue } from "jotai";
import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import type {
  AirPlayDevice,
  AirPlayPlayerState,
} from "@/utils/airplay/options";
import { DEFAULT_AIRPLAY_STATE } from "@/utils/airplay/options";
import { useSettings } from "@/utils/atoms/settings";

/**
 * Hook to manage AirPlay player state
 *
 * For iOS video: AirPlay is native - the video player handles streaming
 * This hook provides UI state management and progress tracking
 */
export const useAirPlayPlayer = (item: BaseItemDto | null) => {
  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);
  const { settings } = useSettings();

  const [state, setState] = useState<AirPlayPlayerState>(DEFAULT_AIRPLAY_STATE);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Check if AirPlay is available (iOS only)
  const isAirPlayAvailable = Platform.OS === "ios";

  // Detect AirPlay connection
  // Note: For native video AirPlay, this would be detected from the player
  // For now, this is a placeholder for UI state management
  const [isConnected, setIsConnected] = useState(false);
  const [currentDevice, setCurrentDevice] = useState<AirPlayDevice | null>(
    null,
  );

  // Progress tracking
  const updateProgress = useCallback(
    (progressMs: number, durationMs: number) => {
      setState((prev) => ({
        ...prev,
        progress: progressMs,
        duration: durationMs,
      }));

      // Report progress to Jellyfin
      if (api && item?.Id && user?.Id && progressMs > 0) {
        const progressSeconds = Math.floor(progressMs / 1000);
        api.playStateApi
          .reportPlaybackProgress({
            playbackProgressInfo: {
              ItemId: item.Id,
              PositionTicks: progressSeconds * 10000000,
              IsPaused: !state.isPlaying,
              PlayMethod: "DirectStream",
            },
          })
          .catch(console.error);
      }
    },
    [api, item?.Id, user?.Id, state.isPlaying],
  );

  // Play/Pause controls
  const play = useCallback(() => {
    setState((prev) => ({ ...prev, isPlaying: true }));
  }, []);

  const pause = useCallback(() => {
    setState((prev) => ({ ...prev, isPlaying: false }));
  }, []);

  const togglePlayPause = useCallback(() => {
    setState((prev) => ({ ...prev, isPlaying: !prev.isPlaying }));
  }, []);

  // Seek controls
  const seek = useCallback((positionMs: number) => {
    setState((prev) => ({ ...prev, progress: positionMs }));
  }, []);

  const skipForward = useCallback((seconds = 10) => {
    setState((prev) => ({
      ...prev,
      progress: Math.min(prev.progress + seconds * 1000, prev.duration),
    }));
  }, []);

  const skipBackward = useCallback((seconds = 10) => {
    setState((prev) => ({
      ...prev,
      progress: Math.max(prev.progress - seconds * 1000, 0),
    }));
  }, []);

  // Stop and disconnect
  const stop = useCallback(async () => {
    setState(DEFAULT_AIRPLAY_STATE);
    setIsConnected(false);
    setCurrentDevice(null);

    // Report stop to Jellyfin
    if (api && item?.Id && user?.Id) {
      await api.playStateApi.reportPlaybackStopped({
        playbackStopInfo: {
          ItemId: item.Id,
          PositionTicks: state.progress * 10000,
        },
      });
    }
  }, [api, item?.Id, user?.Id, state.progress]);

  // Volume control
  const setVolume = useCallback((volume: number) => {
    setState((prev) => ({ ...prev, volume: Math.max(0, Math.min(1, volume)) }));
  }, []);

  // Controls visibility
  const showControls = useCallback(() => {
    setState((prev) => ({ ...prev, showControls: true }));

    // Auto-hide after delay
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
    };
  }, []);

  return {
    // State
    isAirPlayAvailable,
    isConnected,
    isPlaying: state.isPlaying,
    currentItem: item,
    currentDevice,
    progress: state.progress,
    duration: state.duration,
    volume: state.volume,

    // Controls
    play,
    pause,
    togglePlayPause,
    seek,
    skipForward,
    skipBackward,
    stop,
    setVolume,
    showControls: showControls,
    hideControls,
    updateProgress,

    // Device management
    setIsConnected,
    setCurrentDevice,
  };
};

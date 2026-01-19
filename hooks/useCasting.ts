/**
 * Unified Casting Hook
 * Manages both Chromecast and AirPlay through a common interface
 */

import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { useAtomValue } from "jotai";
import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import {
  useCastDevice,
  useMediaStatus,
  useRemoteMediaClient,
} from "react-native-google-cast";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { useSettings } from "@/utils/atoms/settings";
import type { CastPlayerState, CastProtocol } from "@/utils/casting/types";
import { DEFAULT_CAST_STATE } from "@/utils/casting/types";

/**
 * Unified hook for managing casting (Chromecast + AirPlay)
 */
export const useCasting = (item: BaseItemDto | null) => {
  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);
  const { settings } = useSettings();

  // Chromecast hooks
  const client = useRemoteMediaClient();
  const castDevice = useCastDevice();
  const mediaStatus = useMediaStatus();

  // Local state
  const [state, setState] = useState<CastPlayerState>(DEFAULT_CAST_STATE);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Detect which protocol is active
  const chromecastConnected = castDevice !== null;
  const airplayConnected = false; // TODO: Detect AirPlay connection from video player

  const activeProtocol: CastProtocol | null = chromecastConnected
    ? "chromecast"
    : airplayConnected
      ? "airplay"
      : null;

  const isConnected = chromecastConnected || airplayConnected;

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
    } else if (airplayConnected) {
      setState((prev) => ({
        ...prev,
        isConnected: true,
        protocol: "airplay",
        currentDevice: {
          id: "airplay-device",
          name: "AirPlay Device", // TODO: Get real device name
          protocol: "airplay",
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
  }, [chromecastConnected, airplayConnected, castDevice]);

  // Chromecast: Update playback state
  useEffect(() => {
    if (activeProtocol === "chromecast" && mediaStatus) {
      setState((prev) => ({
        ...prev,
        isPlaying: !mediaStatus.isPaused && !mediaStatus.isBuffering,
        progress: (mediaStatus.streamPosition || 0) * 1000,
        duration: (mediaStatus.mediaInfo?.streamDuration || 0) * 1000,
        isBuffering: mediaStatus.isBuffering || false,
      }));
    }
  }, [mediaStatus, activeProtocol]);

  // Progress reporting to Jellyfin
  useEffect(() => {
    if (!isConnected || !item?.Id || !user?.Id || state.progress <= 0) return;

    const reportProgress = () => {
      const progressSeconds = Math.floor(state.progress / 1000);
      api?.playStateApi
        .reportPlaybackProgress({
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
    // TODO: AirPlay play control
  }, [client, activeProtocol]);

  const pause = useCallback(async () => {
    if (activeProtocol === "chromecast") {
      await client?.pause();
    }
    // TODO: AirPlay pause control
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
      // TODO: AirPlay seek control
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
    // TODO: AirPlay stop control

    // Report stop to Jellyfin
    if (api && item?.Id && user?.Id) {
      await api.playStateApi.reportPlaybackStopped({
        playbackStopInfo: {
          ItemId: item.Id,
          PositionTicks: state.progress * 10000,
        },
      });
    }

    setState(DEFAULT_CAST_STATE);
  }, [client, api, item?.Id, user?.Id, state.progress, activeProtocol]);

  // Volume control
  const setVolume = useCallback(
    async (volume: number) => {
      const clampedVolume = Math.max(0, Math.min(1, volume));
      if (activeProtocol === "chromecast") {
        await client?.setVolume(clampedVolume);
      }
      // TODO: AirPlay volume control
      setState((prev) => ({ ...prev, volume: clampedVolume }));
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
    isAirPlayAvailable: Platform.OS === "ios",

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

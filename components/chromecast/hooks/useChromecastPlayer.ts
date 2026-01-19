/**
 * Main Chromecast player hook - handles all playback logic and state
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
import { useSettings } from "@/utils/atoms/settings";
import {
  calculateEndingTime,
  formatTime,
  shouldShowNextEpisodeCountdown,
} from "@/utils/chromecast/helpers";
import {
  CHROMECAST_CONSTANTS,
  type ChromecastPlayerState,
  DEFAULT_CHROMECAST_STATE,
} from "@/utils/chromecast/options";

export const useChromecastPlayer = () => {
  const client = useRemoteMediaClient();
  const castDevice = useCastDevice();
  const mediaStatus = useMediaStatus();
  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);
  const { settings } = useSettings();

  const [playerState, setPlayerState] = useState<ChromecastPlayerState>(
    DEFAULT_CHROMECAST_STATE,
  );
  const [showControls, setShowControls] = useState(true);
  const [currentItem, _setCurrentItem] = useState<BaseItemDto | null>(null);
  const [nextItem, _setNextItem] = useState<BaseItemDto | null>(null);

  const lastReportedProgressRef = useRef(0);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Update player state from media status
  useEffect(() => {
    if (!mediaStatus) {
      setPlayerState(DEFAULT_CHROMECAST_STATE);
      return;
    }

    const streamPosition = (mediaStatus.streamPosition || 0) * 1000; // Convert to ms
    const duration = (mediaStatus.mediaInfo?.streamDuration || 0) * 1000;

    setPlayerState((prev) => ({
      ...prev,
      isConnected: !!castDevice,
      deviceName: castDevice?.friendlyName || castDevice?.deviceId || null,
      isPlaying: mediaStatus.playerState === "playing",
      isPaused: mediaStatus.playerState === "paused",
      isStopped: mediaStatus.playerState === "idle",
      isBuffering: mediaStatus.playerState === "buffering",
      progress: streamPosition,
      duration,
      currentItemId: mediaStatus.mediaInfo?.contentId || null,
    }));
  }, [mediaStatus, castDevice]);

  // Report playback progress to Jellyfin
  useEffect(() => {
    if (
      !api ||
      !user?.Id ||
      !mediaStatus ||
      !mediaStatus.mediaInfo?.contentId
    ) {
      return;
    }

    const streamPosition = mediaStatus.streamPosition || 0;

    // Report every 10 seconds
    if (
      Math.abs(streamPosition - lastReportedProgressRef.current) <
      CHROMECAST_CONSTANTS.PROGRESS_REPORT_INTERVAL
    ) {
      return;
    }

    const contentId = mediaStatus.mediaInfo.contentId;
    const positionTicks = Math.floor(streamPosition * 10000000);
    const isPaused = mediaStatus.playerState === "paused";
    const streamUrl = mediaStatus.mediaInfo.contentUrl || "";
    const isTranscoding = streamUrl.includes("m3u8");

    getPlaystateApi(api)
      .reportPlaybackProgress({
        playbackProgressInfo: {
          ItemId: contentId,
          PositionTicks: positionTicks,
          IsPaused: isPaused,
          PlayMethod: isTranscoding ? "Transcode" : "DirectStream",
          PlaySessionId: contentId,
        },
      })
      .then(() => {
        lastReportedProgressRef.current = streamPosition;
      })
      .catch((error) => {
        console.error("Failed to report Chromecast progress:", error);
      });
  }, [
    api,
    user?.Id,
    mediaStatus?.streamPosition,
    mediaStatus?.mediaInfo?.contentId,
    mediaStatus?.playerState,
  ]);

  // Auto-hide controls
  const resetControlsTimeout = useCallback(() => {
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }

    setShowControls(true);
    controlsTimeoutRef.current = setTimeout(() => {
      setShowControls(false);
    }, CHROMECAST_CONSTANTS.CONTROLS_TIMEOUT);
  }, []);

  // Playback controls
  const play = useCallback(async () => {
    await client?.play();
  }, [client]);

  const pause = useCallback(async () => {
    await client?.pause();
  }, [client]);

  const stop = useCallback(async () => {
    await client?.stop();
  }, [client]);

  const togglePlay = useCallback(async () => {
    if (playerState.isPlaying) {
      await pause();
    } else {
      await play();
    }
    resetControlsTimeout();
  }, [playerState.isPlaying, play, pause, resetControlsTimeout]);

  const seek = useCallback(
    async (positionMs: number) => {
      await client?.seek({ position: positionMs / 1000 });
      resetControlsTimeout();
    },
    [client, resetControlsTimeout],
  );

  const skipForward = useCallback(async () => {
    const skipTime =
      settings?.forwardSkipTime || CHROMECAST_CONSTANTS.SKIP_FORWARD_TIME;
    const newPosition = playerState.progress + skipTime * 1000;
    await seek(Math.min(newPosition, playerState.duration));
  }, [
    playerState.progress,
    playerState.duration,
    seek,
    settings?.forwardSkipTime,
  ]);

  const skipBackward = useCallback(async () => {
    const skipTime =
      settings?.rewindSkipTime || CHROMECAST_CONSTANTS.SKIP_BACKWARD_TIME;
    const newPosition = playerState.progress - skipTime * 1000;
    await seek(Math.max(newPosition, 0));
  }, [playerState.progress, seek, settings?.rewindSkipTime]);

  const disconnect = useCallback(async () => {
    await client?.stop();
    setPlayerState(DEFAULT_CHROMECAST_STATE);
  }, [client]);

  // Time formatting
  const currentTime = formatTime(playerState.progress);
  const remainingTime = formatTime(playerState.duration - playerState.progress);
  const endingTime = calculateEndingTime(
    playerState.duration - playerState.progress,
    true, // TODO: Add use24HourFormat setting
  );

  // Next episode countdown
  const showNextEpisodeCountdown = shouldShowNextEpisodeCountdown(
    playerState.duration - playerState.progress,
    !!nextItem,
    CHROMECAST_CONSTANTS.NEXT_EPISODE_COUNTDOWN_START,
  );

  // Cleanup
  useEffect(() => {
    return () => {
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
    };
  }, []);

  return {
    // State
    playerState,
    showControls,
    currentItem,
    nextItem,
    castDevice,
    mediaStatus,

    // Actions
    play,
    pause,
    stop,
    togglePlay,
    seek,
    skipForward,
    skipBackward,
    disconnect,
    setShowControls: resetControlsTimeout,

    // Computed
    currentTime,
    remainingTime,
    endingTime,
    showNextEpisodeCountdown,

    // Settings
    settings,
  };
};

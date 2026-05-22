import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { type RefObject, useEffect, useRef, useState } from "react";
import { MediaPlayerState, type MediaStatus } from "react-native-google-cast";
import { type SharedValue, useSharedValue } from "react-native-reanimated";
import { useTrickplay } from "@/hooks/useTrickplay";

interface TrickplayTime {
  hours: number;
  minutes: number;
  seconds: number;
}

interface UseCastPlayerProgressParams {
  /** Raw Chromecast media status, or null when no session. */
  mediaStatus: MediaStatus | null;
  /** Full item fetched from Jellyfin, used to derive trickplay data. */
  fetchedItem: BaseItemDto | null;
  /** Total media duration, in seconds. */
  duration: number;
}

type TrickplayReturn = ReturnType<typeof useTrickplay>;

interface UseCastPlayerProgressResult {
  /** Shared value tracking the slider progress, in milliseconds. */
  sliderProgress: SharedValue<number>;
  /** Shared value for the slider minimum, in milliseconds. */
  sliderMin: SharedValue<number>;
  /** Shared value for the slider maximum, in milliseconds. */
  sliderMax: SharedValue<number>;
  /** Mutable ref flag set true while the user is scrubbing. */
  isScrubbing: RefObject<boolean>;
  /** Trickplay time display state for the bubble. */
  trickplayTime: TrickplayTime;
  /** Updates the trickplay time display state. */
  setTrickplayTime: (time: TrickplayTime) => void;
  /** Current playback progress, in seconds (live-updating). */
  progress: number;
  /** Last stable playback position (seconds), for resuming across reloads. */
  resumePositionRef: RefObject<number>;
  /** Current trickplay image URL/coordinates, or null. */
  trickPlayUrl: TrickplayReturn["trickPlayUrl"];
  /** Computes the trickplay URL for a given progress in ticks. */
  calculateTrickplayUrl: TrickplayReturn["calculateTrickplayUrl"];
  /** Parsed trickplay metadata, or null. */
  trickplayInfo: TrickplayReturn["trickplayInfo"];
}

/**
 * Progress/slider/trickplay cluster for the casting player.
 * Owns the slider shared values, scrub state, live-progress interpolation,
 * resume-position tracking, and trickplay preview.
 */
export function useCastPlayerProgress({
  mediaStatus,
  fetchedItem,
  duration,
}: UseCastPlayerProgressParams): UseCastPlayerProgressResult {
  // Shared values for progress slider (must be initialized before any early returns)
  const sliderProgress = useSharedValue(0);
  const sliderMin = useSharedValue(0);
  const sliderMax = useSharedValue(100);
  const isScrubbing = useRef(false);

  // Trickplay time display
  const [trickplayTime, setTrickplayTime] = useState({
    hours: 0,
    minutes: 0,
    seconds: 0,
  });

  // Live progress tracking - update every second
  const [liveProgress, setLiveProgress] = useState(0);
  const lastSyncPositionRef = useRef(0);
  const lastSyncTimestampRef = useRef(Date.now());

  // Last stable playback position (seconds), for resuming across reloads.
  const resumePositionRef = useRef(0);

  useEffect(() => {
    // Sync refs whenever mediaStatus provides a new position
    if (mediaStatus?.streamPosition !== undefined) {
      lastSyncPositionRef.current = mediaStatus.streamPosition;
      lastSyncTimestampRef.current = Date.now();
      setLiveProgress(mediaStatus.streamPosition);
    }

    // Update every second when playing, deriving from last sync point
    const interval = setInterval(() => {
      if (
        mediaStatus?.playerState === MediaPlayerState.PLAYING &&
        mediaStatus?.streamPosition !== undefined
      ) {
        const elapsed = (Date.now() - lastSyncTimestampRef.current) / 1000;
        setLiveProgress(lastSyncPositionRef.current + elapsed);
      } else if (mediaStatus?.streamPosition !== undefined) {
        // Sync with actual position when paused/buffering
        setLiveProgress(mediaStatus.streamPosition);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [mediaStatus?.playerState, mediaStatus?.streamPosition]);

  // Track the last stable position so a reload mid-switch resumes correctly.
  useEffect(() => {
    const pos = mediaStatus?.streamPosition ?? 0;
    if (mediaStatus?.playerState === MediaPlayerState.PLAYING && pos > 0) {
      resumePositionRef.current = pos;
    }
  }, [mediaStatus?.streamPosition, mediaStatus?.playerState]);

  // Derive state from raw Chromecast hooks
  const progress = liveProgress; // Use live-updating progress

  // Trickplay for seeking preview - use fetched item with full data
  const { trickPlayUrl, calculateTrickplayUrl, trickplayInfo } = useTrickplay(
    fetchedItem ?? null,
  );

  // Update slider max when duration changes
  useEffect(() => {
    if (duration > 0) {
      sliderMax.value = duration * 1000; // Convert to milliseconds
    }
  }, [duration, sliderMax]);

  // Update slider progress when not scrubbing
  useEffect(() => {
    if (!isScrubbing.current && progress > 0) {
      sliderProgress.value = progress * 1000; // Convert to milliseconds
    }
  }, [progress, sliderProgress]);

  return {
    sliderProgress,
    sliderMin,
    sliderMax,
    isScrubbing,
    trickplayTime,
    setTrickplayTime,
    progress,
    resumePositionRef,
    trickPlayUrl,
    calculateTrickplayUrl,
    trickplayInfo,
  };
}

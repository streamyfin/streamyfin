import { useCallback, useEffect, useRef } from "react";
import { MediaTimeSegment } from "@/providers/Downloads/types";
import { useSettings } from "@/utils/atoms/settings";
import { useHaptic } from "./useHaptic";

type SegmentType = "Intro" | "Outro" | "Recap" | "Commercial" | "Preview";

interface UseSegmentSkipperProps {
  segments: MediaTimeSegment[];
  segmentType: SegmentType;
  currentTime: number;
  totalDuration?: number;
  seek: (time: number) => void;
  isPaused: boolean;
}

interface UseSegmentSkipperReturn {
  currentSegment: MediaTimeSegment | null;
  skipSegment: (notifyOrUseHaptics?: boolean) => void;
}

/**
 * Generic hook to handle all media segment types (intro, outro, recap, commercial, preview)
 * Supports three modes: 'none' (disabled), 'ask' (show button), 'auto' (auto-skip)
 */
export const useSegmentSkipper = ({
  segments,
  segmentType,
  currentTime,
  totalDuration,
  seek,
  isPaused,
}: UseSegmentSkipperProps): UseSegmentSkipperReturn => {
  const { settings } = useSettings();
  const haptic = useHaptic();
  const autoSkipTriggeredRef = useRef(false);

  // Get skip mode based on segment type
  const skipMode = (() => {
    switch (segmentType) {
      case "Intro":
        return settings.skipIntro;
      case "Outro":
        return settings.skipOutro;
      case "Recap":
        return settings.skipRecap;
      case "Commercial":
        return settings.skipCommercial;
      case "Preview":
        return settings.skipPreview;
      default:
        return "none";
    }
  })();

  // Memoize the seek wrapper to prevent cascading useEffect triggers
  const wrappedSeek = useCallback(
    (time: number) => {
      seek(time);
    },
    [seek],
  );

  // Find current segment
  const currentSegment =
    segments.find(
      (segment) =>
        currentTime >= segment.startTime && currentTime < segment.endTime,
    ) || null;

  // Skip function with optional haptic feedback
  const skipSegment = useCallback(
    (notifyOrUseHaptics = true) => {
      if (!currentSegment) return;

      // For Outro segments, prevent seeking past the end
      if (segmentType === "Outro" && totalDuration) {
        const seekTime = Math.min(currentSegment.endTime, totalDuration);
        wrappedSeek(seekTime);
      } else {
        wrappedSeek(currentSegment.endTime);
      }

      // Only trigger haptic feedback if explicitly requested (manual skip)
      if (notifyOrUseHaptics) {
        haptic();
      }
    },
    [currentSegment, segmentType, totalDuration, wrappedSeek, haptic],
  );

  // Auto-skip logic when mode is 'auto'
  useEffect(() => {
    if (skipMode !== "auto" || isPaused) {
      autoSkipTriggeredRef.current = false;
      return;
    }

    if (currentSegment && !autoSkipTriggeredRef.current) {
      autoSkipTriggeredRef.current = true;
      skipSegment(false); // Don't trigger haptics for auto-skip
    }

    if (!currentSegment) {
      autoSkipTriggeredRef.current = false;
    }
  }, [currentSegment, skipMode, isPaused, skipSegment]);

  // Return null segment if skip mode is 'none'
  return {
    currentSegment: skipMode === "none" ? null : currentSegment,
    skipSegment,
  };
};

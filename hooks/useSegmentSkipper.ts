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
  const autoSkipTriggeredRef = useRef<string | null>(null);

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

  // Find current segment
  const currentSegment =
    segments.find(
      (segment) =>
        currentTime >= segment.startTime && currentTime < segment.endTime,
    ) || null;

  // Skip function with optional haptic feedback
  const skipSegment = useCallback(
    (notifyOrUseHaptics = true) => {
      if (!currentSegment || skipMode === "none") return;

      // For Outro segments, prevent seeking past the end
      if (
        segmentType === "Outro" &&
        totalDuration != null &&
        Number.isFinite(totalDuration)
      ) {
        const seekTime = Math.min(currentSegment.endTime, totalDuration);
        seek(seekTime);
      } else {
        seek(currentSegment.endTime);
      }

      // Only trigger haptic feedback if explicitly requested (manual skip)
      if (notifyOrUseHaptics) {
        haptic();
      }
    },
    [currentSegment, segmentType, totalDuration, seek, haptic, skipMode],
  );
  // Auto-skip logic when mode is 'auto'
  useEffect(() => {
    if (skipMode !== "auto" || isPaused) {
      return;
    }

    // Track segment identity to avoid re-triggering on pause/unpause
    const segmentId = currentSegment
      ? `${currentSegment.startTime}-${currentSegment.endTime}`
      : null;

    if (currentSegment && autoSkipTriggeredRef.current !== segmentId) {
      autoSkipTriggeredRef.current = segmentId;
      skipSegment(false); // Don't trigger haptics for auto-skip
    }

    if (!currentSegment) {
      autoSkipTriggeredRef.current = null;
    }
  }, [currentSegment, skipMode, isPaused, skipSegment]);

  // Return null segment if skip mode is 'none'
  return {
    currentSegment: skipMode === "none" ? null : currentSegment,
    skipSegment,
  };
};

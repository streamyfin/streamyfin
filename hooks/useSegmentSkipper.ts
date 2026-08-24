import { useCallback, useEffect, useMemo, useRef } from "react";
import { MediaTimeSegment } from "@/providers/Downloads/types";
import { SegmentSkipMode, useSettings } from "@/utils/atoms/settings";
import { useHaptic } from "./useHaptic";

export type SegmentType =
  | "Intro"
  | "Outro"
  | "Recap"
  | "Commercial"
  | "Preview";

const SEGMENT_TO_SETTING: Record<
  SegmentType,
  "skipIntro" | "skipOutro" | "skipRecap" | "skipCommercial" | "skipPreview"
> = {
  Intro: "skipIntro",
  Outro: "skipOutro",
  Recap: "skipRecap",
  Commercial: "skipCommercial",
  Preview: "skipPreview",
};

interface UseSegmentSkipperProps {
  segments: MediaTimeSegment[];
  segmentType: SegmentType;
  currentTime: number;
  totalDuration?: number;
  seek: (time: number) => void;
}

interface UseSegmentSkipperReturn {
  currentSegment: MediaTimeSegment | null;
  skipSegment: (useHaptics?: boolean) => void;
  skipMode: SegmentSkipMode;
}

/**
 * Generic hook for a single media segment type (intro, outro, recap, commercial, preview).
 * Reports the segment currently under the playhead, its skip mode, and a skip action.
 * Auto-skip is NOT performed here: the consumer drives it from the priority-resolved
 * active segment so overlapping segments can't trigger competing seeks.
 */
export const useSegmentSkipper = ({
  segments,
  segmentType,
  currentTime,
  totalDuration,
  seek,
}: UseSegmentSkipperProps): UseSegmentSkipperReturn => {
  const { settings } = useSettings();
  const haptic = useHaptic();

  // Mirror the declared default rather than "none": settings is only missing
  // while it loads, and hiding the button there would contradict defaultValues.
  const skipMode: SegmentSkipMode =
    settings?.[SEGMENT_TO_SETTING[segmentType]] ?? "ask";

  const currentSegment = useMemo(
    () =>
      segments.find(
        (s) => currentTime >= s.startTime && currentTime < s.endTime,
      ) ?? null,
    [segments, currentTime],
  );

  // Refs keep skipSegment's identity stable across seek/haptic changes
  // (haptic is unstable when disabled), so the consumer's auto-skip effect
  // doesn't re-fire spuriously.
  const seekRef = useRef(seek);
  const hapticRef = useRef(haptic);
  useEffect(() => {
    seekRef.current = seek;
    hapticRef.current = haptic;
  });

  const skipSegment = useCallback(
    (useHaptics = true) => {
      if (!currentSegment || skipMode === "none") return;

      // Outro endTime sometimes exceeds the actual file duration. Keep a 2s
      // buffer so the player's natural end-of-video flow (next-episode
      // countdown, etc.) still fires instead of stalling at the exact end.
      let target = currentSegment.endTime;
      if (
        segmentType === "Outro" &&
        totalDuration != null &&
        Number.isFinite(totalDuration) &&
        target >= totalDuration
      ) {
        target = Math.max(0, totalDuration - 2);
        // Deep inside such an outro the clamped target sits behind the
        // playhead, and seeking there would rewind. Nothing left to skip, so
        // let playback run into the end-of-video flow on its own.
        if (target <= currentTime) return;
      }

      seekRef.current(target);

      if (useHaptics) hapticRef.current();
    },
    [currentSegment, segmentType, totalDuration, skipMode, currentTime],
  );

  return {
    currentSegment: skipMode === "none" ? null : currentSegment,
    skipSegment,
    skipMode,
  };
};

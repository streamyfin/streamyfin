import { useCallback, useEffect, useMemo, useRef } from "react";
import { MediaTimeSegment } from "@/providers/Downloads/types";
import { SegmentSkipMode, useSettings } from "@/utils/atoms/settings";
import { useHaptic } from "./useHaptic";

type SegmentType = "Intro" | "Outro" | "Recap" | "Commercial" | "Preview";

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
  isPaused: boolean;
}

interface UseSegmentSkipperReturn {
  currentSegment: MediaTimeSegment | null;
  skipSegment: (useHaptics?: boolean) => void;
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

  const skipMode: SegmentSkipMode =
    settings?.[SEGMENT_TO_SETTING[segmentType]] ?? "none";

  const currentSegment = useMemo(
    () =>
      segments.find(
        (s) => currentTime >= s.startTime && currentTime < s.endTime,
      ) ?? null,
    [segments, currentTime],
  );

  // Refs let the auto-skip effect avoid re-running when skipSegment/haptic
  // identities change (haptic is unstable when disabled).
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
      }

      seekRef.current(target);

      if (useHaptics) hapticRef.current();
    },
    [currentSegment, segmentType, totalDuration, skipMode],
  );

  useEffect(() => {
    if (skipMode !== "auto" || isPaused || !currentSegment) {
      if (!currentSegment) autoSkipTriggeredRef.current = null;
      return;
    }

    const segmentId = `${currentSegment.startTime}-${currentSegment.endTime}`;
    if (autoSkipTriggeredRef.current === segmentId) return;
    autoSkipTriggeredRef.current = segmentId;
    skipSegment(false);
  }, [currentSegment, skipMode, isPaused, skipSegment]);

  return {
    currentSegment: skipMode === "none" ? null : currentSegment,
    skipSegment,
  };
};

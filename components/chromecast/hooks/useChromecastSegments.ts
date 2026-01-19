/**
 * Hook for managing Chromecast segments (intro, credits, recap, commercial, preview)
 * Integrates with autoskip branch segment detection
 */

import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { useAtomValue } from "jotai";
import { useCallback, useMemo } from "react";
import { apiAtom } from "@/providers/JellyfinProvider";
import { useSettings } from "@/utils/atoms/settings";
import { isWithinSegment } from "@/utils/chromecast/helpers";
import type { ChromecastSegmentData } from "@/utils/chromecast/options";

// Placeholder - will integrate with autoskip branch later
interface SegmentData {
  introSegments?: Array<{ startTime: number; endTime: number; text: string }>;
  creditSegments?: Array<{ startTime: number; endTime: number; text: string }>;
  recapSegments?: Array<{ startTime: number; endTime: number; text: string }>;
  commercialSegments?: Array<{
    startTime: number;
    endTime: number;
    text: string;
  }>;
  previewSegments?: Array<{ startTime: number; endTime: number; text: string }>;
}

export const useChromecastSegments = (
  item: BaseItemDto | null,
  currentProgressMs: number,
) => {
  const _api = useAtomValue(apiAtom);
  const { settings } = useSettings();

  // TODO: Replace with actual segment fetching from autoskip branch
  // For now, using mock data structure
  const segmentData = useMemo<SegmentData>(() => {
    return {
      introSegments: [],
      creditSegments: [],
      recapSegments: [],
      commercialSegments: [],
      previewSegments: [],
    };
  }, [item?.Id]);

  // Parse segments into usable format
  const segments = useMemo<ChromecastSegmentData>(() => {
    const intro =
      segmentData.introSegments && segmentData.introSegments.length > 0
        ? {
            start: segmentData.introSegments[0].startTime,
            end: segmentData.introSegments[0].endTime,
          }
        : null;

    const credits =
      segmentData.creditSegments && segmentData.creditSegments.length > 0
        ? {
            start: segmentData.creditSegments[0].startTime,
            end: segmentData.creditSegments[0].endTime,
          }
        : null;

    const recap =
      segmentData.recapSegments && segmentData.recapSegments.length > 0
        ? {
            start: segmentData.recapSegments[0].startTime,
            end: segmentData.recapSegments[0].endTime,
          }
        : null;

    const commercial = (segmentData.commercialSegments || []).map((seg) => ({
      start: seg.startTime,
      end: seg.endTime,
    }));

    const preview = (segmentData.previewSegments || []).map((seg) => ({
      start: seg.startTime,
      end: seg.endTime,
    }));

    return { intro, credits, recap, commercial, preview };
  }, [segmentData]);

  // Check which segment we're currently in
  const currentSegment = useMemo(() => {
    if (isWithinSegment(currentProgressMs, segments.intro)) {
      return { type: "intro" as const, segment: segments.intro };
    }
    if (isWithinSegment(currentProgressMs, segments.credits)) {
      return { type: "credits" as const, segment: segments.credits };
    }
    if (isWithinSegment(currentProgressMs, segments.recap)) {
      return { type: "recap" as const, segment: segments.recap };
    }
    for (const commercial of segments.commercial) {
      if (isWithinSegment(currentProgressMs, commercial)) {
        return { type: "commercial" as const, segment: commercial };
      }
    }
    for (const preview of segments.preview) {
      if (isWithinSegment(currentProgressMs, preview)) {
        return { type: "preview" as const, segment: preview };
      }
    }
    return null;
  }, [currentProgressMs, segments]);

  // Skip functions
  const skipIntro = useCallback(
    (seekFn: (positionMs: number) => Promise<void>) => {
      if (segments.intro) {
        return seekFn(segments.intro.end * 1000);
      }
    },
    [segments.intro],
  );

  const skipCredits = useCallback(
    (seekFn: (positionMs: number) => Promise<void>) => {
      if (segments.credits) {
        return seekFn(segments.credits.end * 1000);
      }
    },
    [segments.credits],
  );

  const skipSegment = useCallback(
    (seekFn: (positionMs: number) => Promise<void>) => {
      if (currentSegment) {
        return seekFn(currentSegment.segment.end * 1000);
      }
    },
    [currentSegment],
  );

  // Auto-skip logic based on settings
  const shouldAutoSkip = useMemo(() => {
    if (!currentSegment) return false;

    switch (currentSegment.type) {
      case "intro":
        return settings?.autoSkipIntro ?? false;
      case "credits":
        return settings?.autoSkipCredits ?? false;
      case "recap":
      case "commercial":
      case "preview":
        // Add settings for these when available
        return false;
      default:
        return false;
    }
  }, [currentSegment, settings]);

  return {
    segments,
    currentSegment,
    skipIntro,
    skipCredits,
    skipSegment,
    shouldAutoSkip,
    hasIntro: !!segments.intro,
    hasCredits: !!segments.credits,
  };
};

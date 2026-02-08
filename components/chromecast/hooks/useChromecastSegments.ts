/**
 * Hook for managing Chromecast segments (intro, credits, recap, commercial, preview)
 * Integrates with autoskip API for segment detection
 */

import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { useAtomValue } from "jotai";
import { useCallback, useMemo } from "react";
import { apiAtom } from "@/providers/JellyfinProvider";
import { useSettings } from "@/utils/atoms/settings";
import { isWithinSegment } from "@/utils/casting/helpers";
import type { ChromecastSegmentData } from "@/utils/chromecast/options";
import { useSegments } from "@/utils/segments";

export const useChromecastSegments = (
  item: BaseItemDto | null,
  currentProgressMs: number,
  isOffline = false,
) => {
  const api = useAtomValue(apiAtom);
  const { settings } = useSettings();

  // Fetch segments from autoskip API
  const { data: segmentData } = useSegments(
    item?.Id || "",
    isOffline,
    undefined, // downloadedFiles parameter
    api,
  );

  // Parse segments into usable format
  const segments = useMemo<ChromecastSegmentData>(() => {
    if (!segmentData) {
      return {
        intro: null,
        credits: null,
        recap: null,
        commercial: [],
        preview: [],
      };
    }

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
  // currentProgressMs is in milliseconds; isWithinSegment() converts ms→seconds internally
  // before comparing with segment times (which are in seconds from the autoskip API)
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
      if (currentSegment?.segment) {
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
        return settings?.skipIntro === "auto";
      case "credits":
        return settings?.skipOutro === "auto";
      case "recap":
        return settings?.skipRecap === "auto";
      case "commercial":
        return settings?.skipCommercial === "auto";
      case "preview":
        return settings?.skipPreview === "auto";
      default:
        return false;
    }
  }, [
    currentSegment,
    settings?.skipIntro,
    settings?.skipOutro,
    settings?.skipRecap,
    settings?.skipCommercial,
    settings?.skipPreview,
  ]);

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

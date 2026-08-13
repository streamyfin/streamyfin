import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MediaTimeSegment } from "@/providers/Downloads/types";
import type { SegmentSkipMode } from "@/utils/atoms/settings";
import type { SegmentBuckets } from "@/utils/segments";
import { type SegmentType, useSegmentSkipper } from "./useSegmentSkipper";

const noop = () => {};

// Delay the FIRST auto-skip until playback has been stable this long. Seeking a
// transcoded stream the instant the first frame appears (e.g. a 0:00 intro)
// asks the transcode for a segment it hasn't produced yet and stalls at 0:00;
// direct-play is always seekable so the delay is invisible there.
const AUTO_SKIP_ARM_DELAY_MS = 1500;

// Credits that stop within this many seconds of the end are treated as running
// to the end, so the next-episode countdown still takes over. Segment ends and
// reported durations disagree by a second or two often enough that an exact
// comparison would suppress the countdown on ordinary episodes.
const CONTENT_AFTER_CREDITS_BUFFER_SECONDS = 5;

/** How long the "… skipped" notice stays up after an automatic skip. */
const SKIPPED_NOTICE_MS = 3000;

export interface ActiveSegment {
  type: SegmentType;
  currentSegment: MediaTimeSegment;
  skipSegment: (useHaptics?: boolean) => void;
  skipMode: SegmentSkipMode;
}

interface UseMediaSegmentsProps {
  segments: SegmentBuckets | undefined;
  /** Current playback position, in ms. */
  currentTime: number;
  /** Total media duration, in ms. */
  maxMs?: number;
  /** Player seek, expects ms. */
  seek: (ms: number) => void;
  /** Player resume. */
  play: () => void;
  isPlaying: boolean;
  /** True while the player is (re)buffering; auto-skip waits for this to clear. */
  isBuffering?: boolean;
}

export interface UseMediaSegmentsReturn {
  /** Highest-priority segment under the playhead (excludes 'none' types), or null. */
  activeSegment: ActiveSegment | null;
  /** Skip the active segment (no-op when there is none). */
  skipActiveSegment: (useHaptics?: boolean) => void;
  /** Show the generic skip button: an active segment that is not the outro. */
  showSkipButton: boolean;
  /** The active segment is the outro/credits (it gets its own button/card). */
  isOutroActive: boolean;
  /** Skip the outro, independent of which button the priority shows. */
  skipOutro: (useHaptics?: boolean) => void;
  /** The outro ends before the media end, i.e. there is content after credits. */
  hasContentAfterCredits: boolean;
  /**
   * Type of the segment an automatic skip just jumped over, for a few seconds
   * after it happens. Null the rest of the time.
   */
  skippedNotice: SegmentType | null;
}

/**
 * Unified media-segment orchestration shared by the mobile and TV player controls.
 * Owns the per-type skippers, the seek-with-delayed-play workaround, the overlap
 * priority (Commercial > Recap > Intro > Preview > Outro) and a SINGLE auto-skip
 * driver, so overlapping auto-enabled segments can't fire competing seeks and both
 * platforms behave identically.
 */
export const useMediaSegments = ({
  segments,
  currentTime,
  maxMs,
  seek,
  play,
  isPlaying,
  isBuffering = false,
}: UseMediaSegmentsProps): UseMediaSegmentsReturn => {
  // Keep sub-second precision: segment boundaries are fractional seconds, so
  // flooring currentTime would detect segments up to ~1s late / end them early.
  const currentTimeSeconds = currentTime / 1000;
  const maxSeconds = maxMs ? maxMs / 1000 : undefined;

  // Seek-with-delayed-play workaround: some seeks otherwise resume from the
  // pre-seek position. playingRef avoids a stale closure on isPlaying.
  const playTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playingRef = useRef(isPlaying);
  useEffect(() => {
    playingRef.current = isPlaying;
  }, [isPlaying]);
  useEffect(() => {
    return () => {
      if (playTimeoutRef.current) clearTimeout(playTimeoutRef.current);
    };
  }, []);

  const seekSeconds = useCallback(
    (timeInSeconds: number) => {
      if (playTimeoutRef.current) clearTimeout(playTimeoutRef.current);
      seek(timeInSeconds * 1000);
      playTimeoutRef.current = setTimeout(() => {
        if (playingRef.current) play();
        playTimeoutRef.current = null;
      }, 200);
    },
    [seek, play],
  );

  const introSkipper = useSegmentSkipper({
    segments: segments?.introSegments ?? [],
    segmentType: "Intro",
    currentTime: currentTimeSeconds,
    seek: seekSeconds,
  });
  const outroSkipper = useSegmentSkipper({
    segments: segments?.creditSegments ?? [],
    segmentType: "Outro",
    currentTime: currentTimeSeconds,
    totalDuration: maxSeconds,
    seek: seekSeconds,
  });
  const recapSkipper = useSegmentSkipper({
    segments: segments?.recapSegments ?? [],
    segmentType: "Recap",
    currentTime: currentTimeSeconds,
    seek: seekSeconds,
  });
  const commercialSkipper = useSegmentSkipper({
    segments: segments?.commercialSegments ?? [],
    segmentType: "Commercial",
    currentTime: currentTimeSeconds,
    seek: seekSeconds,
  });
  const previewSkipper = useSegmentSkipper({
    segments: segments?.previewSegments ?? [],
    segmentType: "Preview",
    currentTime: currentTimeSeconds,
    seek: seekSeconds,
  });

  // Priority when multiple segments overlap: Commercial > Recap > Intro > Preview > Outro.
  const activeSegment = useMemo<ActiveSegment | null>(() => {
    const byPriority: Array<[SegmentType, typeof introSkipper]> = [
      ["Commercial", commercialSkipper],
      ["Recap", recapSkipper],
      ["Intro", introSkipper],
      ["Preview", previewSkipper],
      ["Outro", outroSkipper],
    ];
    for (const [type, skipper] of byPriority) {
      if (skipper.currentSegment) {
        return {
          type,
          currentSegment: skipper.currentSegment,
          skipSegment: skipper.skipSegment,
          skipMode: skipper.skipMode,
        };
      }
    }
    return null;
  }, [
    commercialSkipper.currentSegment,
    commercialSkipper.skipSegment,
    commercialSkipper.skipMode,
    recapSkipper.currentSegment,
    recapSkipper.skipSegment,
    recapSkipper.skipMode,
    introSkipper.currentSegment,
    introSkipper.skipSegment,
    introSkipper.skipMode,
    previewSkipper.currentSegment,
    previewSkipper.skipSegment,
    previewSkipper.skipMode,
    outroSkipper.currentSegment,
    outroSkipper.skipSegment,
    outroSkipper.skipMode,
  ]);

  // Single auto-skip driver: only the priority-resolved active segment skips,
  // so overlapping auto-enabled segments can't trigger competing seeks.
  const autoSkipTriggeredRef = useRef<string | null>(null);
  const [autoSkipArmed, setAutoSkipArmed] = useState(false);
  const [skippedNotice, setSkippedNotice] = useState<SegmentType | null>(null);

  // Reset per item (its segments change): re-allow skipping and re-arm so the
  // next episode's transcode has time to become seekable. We do NOT reset the
  // guard when the active segment momentarily disappears — seeking a transcoded
  // stream makes the reported position bounce back into a 0:00 intro, and
  // clearing the guard there caused an infinite seek loop that crashed mpv.
  useEffect(() => {
    autoSkipTriggeredRef.current = null;
    setAutoSkipArmed(false);
  }, [segments]);

  // Arm auto-skip once playback has been genuinely stable (not buffering) for a
  // short moment, so the first seek lands on an established (seekable) timeline.
  useEffect(() => {
    if (autoSkipArmed || isBuffering || !isPlaying) return;
    const id = setTimeout(() => setAutoSkipArmed(true), AUTO_SKIP_ARM_DELAY_MS);
    return () => clearTimeout(id);
  }, [autoSkipArmed, isBuffering, isPlaying]);

  useEffect(() => {
    if (
      !autoSkipArmed ||
      !activeSegment ||
      !isPlaying ||
      isBuffering ||
      activeSegment.skipMode !== "auto"
    )
      return;
    const { startTime, endTime } = activeSegment.currentSegment;
    const segmentId = `${activeSegment.type}:${startTime}-${endTime}`;
    if (autoSkipTriggeredRef.current === segmentId) return;
    autoSkipTriggeredRef.current = segmentId;
    activeSegment.skipSegment(false);
    // Say what happened: an automatic skip is otherwise silent and reads as
    // the video jumping on its own.
    setSkippedNotice(activeSegment.type);
  }, [activeSegment, isPlaying, isBuffering, autoSkipArmed]);

  // Cleared on a timer so consumers can render it as a transient notice.
  useEffect(() => {
    if (!skippedNotice) return;
    const id = setTimeout(() => setSkippedNotice(null), SKIPPED_NOTICE_MS);
    return () => clearTimeout(id);
  }, [skippedNotice]);

  const isOutroActive = activeSegment?.type === "Outro";

  return {
    activeSegment,
    skipActiveSegment: activeSegment?.skipSegment ?? noop,
    showSkipButton: !!activeSegment && !isOutroActive,
    isOutroActive,
    skipOutro: outroSkipper.skipSegment,
    hasContentAfterCredits:
      outroSkipper.currentSegment && maxSeconds
        ? maxSeconds - outroSkipper.currentSegment.endTime >
          CONTENT_AFTER_CREDITS_BUFFER_SECONDS
        : false,
    skippedNotice,
  };
};

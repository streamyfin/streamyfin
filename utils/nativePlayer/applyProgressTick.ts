import type { NativePlayerProgressPayload } from "@/modules/mpv-player";

/** The slice of the native session a progress tick reads and writes. */
export type ProgressTickSession = {
  positionMs: number;
  lastProgressReportAt: number;
  hasPlaybackStarted: boolean;
};

export type ProgressTick = Pick<
  NativePlayerProgressPayload,
  "position" | "didSeek" | "trackingOnly"
>;

/**
 * Applies one native onProgress tick to the session and says whether the
 * caller should send a progress report for it.
 *
 * Every tick moves the tracked position: that is what teardown, the pause and
 * resume reports and a stream re-negotiation read. Only some ticks are
 * reported themselves: once playback has started, the first authoritative
 * tick after a seek (didSeek) and then one per interval. The synthetic tick a
 * seek emits (trackingOnly) carries the requested target rather than where
 * mpv landed, so it moves the tracked position and nothing else: reporting it
 * would beat the landing tick to the server with a position a keyframe snap
 * is about to correct.
 *
 * `lastProgressReportAt` is stamped only when this returns true, so the
 * interval restarts from the tick that was actually reported.
 */
export function applyProgressTick(
  session: ProgressTickSession,
  tick: ProgressTick,
  now: number,
  intervalMs: number,
): boolean {
  session.positionMs = tick.position * 1000;
  if (tick.trackingOnly === true) return false;
  const due =
    tick.didSeek === true || now - session.lastProgressReportAt >= intervalMs;
  if (!due || !session.hasPlaybackStarted) return false;
  session.lastProgressReportAt = now;
  return true;
}

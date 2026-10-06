import { msToTicks } from "@/utils/time";

/**
 * Whether a progress tick from the MPV view precedes any position MPV has
 * actually reached, and so must not be taken as the session's position.
 *
 * The view emits a tick as soon as the duration is known, carrying its
 * position cache. The MPV renderer used to leave that cache at 0 until the
 * first time-pos arrived, so a session resuming at 19 minutes got a first
 * tick at 0:00. Taken at face value it moved the tracked position to 0, was
 * reported to the server as progress and was written to the route as the
 * position to restart from. The renderer now seeds the cache from the start
 * position; this stays as the guard on the JS side, which also hosts the
 * ExoPlayer engine and relays whatever time-pos mpv reports first.
 *
 * Only a position of 0 on a session that starts further in is dropped. A
 * session that starts at 0 is at 0, and a start position that snapped back to
 * a keyframe still lands on a positive position. A seek the user makes before
 * the first position counts as one (the page records it), so a deliberate
 * seek to 0:00 is not mistaken for this.
 */
export function isPlaceholderTick(
  positionSec: number,
  startTicks: number,
  hasLivePosition: boolean,
): boolean {
  if (hasLivePosition) return false;
  // Not `positionSec === 0`: the payload is a native event, and a NaN here
  // would turn into 0 ticks further down.
  return startTicks > 0 && !(positionSec > 0);
}

/**
 * The position (ticks) a report for the session carries.
 *
 * Until MPV has reported a position for the stream, the session is where it
 * was told to start: that is what the start report already says. The tracked
 * position is not usable before then. It is reset to 0 when the item loads,
 * and a stop or progress report at 0 for an item with a resume point makes
 * the server clear that resume point.
 */
export function resolveSessionPositionTicks(session: {
  hasLivePosition: boolean;
  positionMs: number;
  startTicks: number;
}): number {
  return session.hasLivePosition
    ? msToTicks(session.positionMs)
    : session.startTicks;
}

/**
 * Constants — shared timing/threshold values used across SyncPlay files.
 * Kept separate from `types.ts` because these are implementation tuning
 * values, not the public protocol/types surface.
 */

import { TicksPerMillisecond } from "./types";

export { TicksPerMillisecond };

/** Default timeout for `waitForEventOnce` (matches jellyfin-web). */
export const WaitForEventDefaultTimeout = 30000;

/** Short-lived timeout for player events (matches jellyfin-web). */
export const WaitForPlayerEventTimeout = 500;

export function ticksToMs(ticks: number): number {
  return ticks / TicksPerMillisecond;
}

export function msToTicks(ms: number): number {
  return Math.round(ms * TicksPerMillisecond);
}

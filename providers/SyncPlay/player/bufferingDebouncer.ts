/**
 * bufferingDebouncer — wrap an `isBuffering: boolean → void` notify callback
 * with three RN-only guards. Web gets these for free from HTML `waiting`/
 * `canplay`; our `PlayerControls` exposes state (not events) and the React
 * effect that polls it can fire many times per second.
 *
 *  - **dedup**: drop redundant calls when state hasn't changed
 *  - **debounce buffering→true**: only escalate after the threshold;
 *    going back to ready cancels the pending escalation
 *  - **coalesce inflight**: serialize concurrent sends
 *
 * Returns `{ notify, dispose }`.
 */

import { SYNC_PLAY_TUNING } from "../types";

export function createBufferingDebouncer(
  send: (isBuffering: boolean) => Promise<void>,
) {
  let lastSent: boolean | null = null;
  let inflight: Promise<void> | null = null;
  let pendingTimeout: ReturnType<typeof setTimeout> | null = null;

  const flush = async (isBuffering: boolean) => {
    if (lastSent === isBuffering) return;
    if (inflight) {
      try {
        await inflight;
      } catch {
        // ignore — used only for ordering
      }
      if (lastSent === isBuffering) return;
    }
    lastSent = isBuffering;
    inflight = send(isBuffering).finally(() => {
      inflight = null;
    });
    return inflight;
  };

  return {
    notify(isBuffering: boolean): void {
      if (pendingTimeout) {
        clearTimeout(pendingTimeout);
        pendingTimeout = null;
      }
      if (!isBuffering) {
        // Ready always fires immediately.
        void flush(false);
        return;
      }
      pendingTimeout = setTimeout(() => {
        pendingTimeout = null;
        void flush(true);
      }, SYNC_PLAY_TUNING.minBufferingThresholdMs);
    },
    dispose(): void {
      if (pendingTimeout) {
        clearTimeout(pendingTimeout);
        pendingTimeout = null;
      }
    },
  };
}

/**
 * PendingPlaybackTracker — tracks an in-flight `Unpause` / `Pause` request
 * that we've sent to the server but haven't seen echoed back via
 * `SyncPlayCommand`.
 *
 * Drives three things:
 *  1. Drop duplicate rapid taps
 *  2. Provide an optimistic-UI hint for the in-flight state
 *  3. Override "current play state" when deciding pause-vs-unpause
 *     for the next tap
 *
 * Auto-clears after `pendingPlaybackTimeoutMs` so a lost broadcast
 * doesn't freeze the UI forever.
 */

import { SYNC_PLAY_TUNING } from "../types";

export class PendingPlaybackTracker {
  private command: "Unpause" | "Pause" | null = null;
  private timeout: ReturnType<typeof setTimeout> | null = null;
  private onChange: ((cmd: "Unpause" | "Pause" | null) => void) | null = null;

  setChangeHandler(
    handler: ((cmd: "Unpause" | "Pause" | null) => void) | null,
  ): void {
    this.onChange = handler;
  }

  get(): "Unpause" | "Pause" | null {
    return this.command;
  }

  mark(command: "Unpause" | "Pause"): void {
    this.command = command;
    if (this.timeout) clearTimeout(this.timeout);
    this.timeout = setTimeout(() => {
      console.debug(
        "SyncPlay PendingPlaybackTracker: timed out waiting for broadcast",
        command,
      );
      this.command = null;
      this.timeout = null;
      this.onChange?.(null);
    }, SYNC_PLAY_TUNING.pendingPlaybackTimeoutMs);
    this.onChange?.(command);
  }

  clear(): void {
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }
    if (this.command !== null) {
      this.command = null;
      this.onChange?.(null);
    }
  }
}

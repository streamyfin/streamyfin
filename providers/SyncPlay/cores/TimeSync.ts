/**
 * TimeSync — NTP-style time synchronisation with the Jellyfin server.
 *
 * Merged port of jellyfin-web's `core/timeSync/{TimeSync,TimeSyncServer,
 * TimeSyncCore}.js` — three classes that exist on web because the
 * abstract layer supports syncing against other group members, not just
 * the server. RN only syncs against the server, so it's one class.
 *
 * Algorithm: repeatedly time a round-trip request to `getUtcTime`,
 * compute `offset = ((requestReceived - requestSent) + (responseSent -
 * responseReceived)) / 2`, keep the minimum-delay measurement out of
 * the last 8. This is the standard NTP outlier-rejection trick — the
 * measurement with the shortest delay is the most accurate because
 * less network jitter could have skewed the timestamps.
 *
 * Polling: greedy mode at 1s intervals for the first 3 pings to warm
 * up the offset, then low-profile at 60s intervals for steady-state.
 * `forceUpdate()` resets to greedy mode (called on group join).
 */

import type { Api } from "@jellyfin/sdk";
import { getTimeSyncApi } from "@jellyfin/sdk/lib/utils/api";
import { SYNC_PLAY_CLOCK } from "@/constants/SyncPlay";
import { EventEmitter } from "../EventEmitter";

/**
 * Tracks the offset between this client's clock and the Jellyfin server's
 * clock, and exposes conversions between local and remote Dates.
 *
 * Listeners:
 *   - `"update"` (timeOffset: number, ping: number) — fires on every
 *     successful ping. Errors are logged but not emitted; consumers
 *     should treat absence of updates as transient.
 */
export class TimeSync extends EventEmitter {
  private pingStop = true;
  private pollingInterval: number = SYNC_PLAY_CLOCK.greedyIntervalMs;
  private poller: ReturnType<typeof setTimeout> | null = null;
  private pings = 0;
  private measurements: Array<{ offset: number; delay: number }> = [];
  private generation = 0;

  constructor(private readonly api: Api) {
    super();
  }

  private get measurement() {
    return this.measurements.reduce<
      (typeof this.measurements)[number] | undefined
    >(
      (best, entry) => (!best || entry.delay < best.delay ? entry : best),
      undefined,
    );
  }

  /** Current best-estimate time offset (ms). */
  getTimeOffset(): number {
    return this.measurement?.offset ?? 0;
  }

  /** Current best-estimate one-way ping (ms). */
  getPing(): number {
    return Math.max(0, Math.round((this.measurement?.delay ?? 0) / 2));
  }

  /** Convert a server-time Date to local time. */
  remoteDateToLocal(remote: Date): Date {
    return new Date(remote.getTime() - this.getTimeOffset());
  }

  /** Convert a local Date to server time. */
  localDateToRemote(local: Date): Date {
    return new Date(local.getTime() + this.getTimeOffset());
  }

  /** Start polling. Idempotent. */
  startPing(): void {
    this.pingStop = false;
    this.scheduleNextPing();
  }

  /** Stop polling. Idempotent. */
  stopPing(): void {
    this.generation++;
    this.pingStop = true;
    if (this.poller) {
      clearTimeout(this.poller);
      this.poller = null;
    }
  }

  /** Reset to greedy polling and force a fresh measurement immediately. */
  forceUpdate(): void {
    this.stopPing();
    this.pollingInterval = SYNC_PLAY_CLOCK.greedyIntervalMs;
    this.pings = 0;
    this.startPing();
  }

  /** Full teardown on provider unmount. */
  destroy(): void {
    this.stopPing();
    this.measurements = [];
    this.removeAllListeners();
  }

  private scheduleNextPing(): void {
    if (this.poller || this.pingStop) return;
    this.poller = setTimeout(() => {
      const generation = this.generation;
      this.poller = null;
      this.requestPing()
        .then((result) => {
          if (this.pingStop || generation !== this.generation) return;
          this.onPingResponse(result);
        })
        .catch((error) => {
          console.error("SyncPlay TimeSync: ping failed", error);
        })
        .finally(() => {
          if (generation === this.generation) this.scheduleNextPing();
        });
    }, this.pollingInterval);
  }

  private async requestPing() {
    const requestSent = Date.now();
    const response = await getTimeSyncApi(this.api).getUtcTime();
    const responseReceived = Date.now();
    const data = response.data;
    const requestReceived = Date.parse(data.RequestReceptionTime ?? "");
    const responseSent = Date.parse(data.ResponseTransmissionTime ?? "");
    if (!Number.isFinite(requestReceived) || !Number.isFinite(responseSent)) {
      throw new Error("SyncPlay time sync returned invalid server timestamps");
    }
    return {
      offset:
        (requestReceived - requestSent + responseSent - responseReceived) / 2,
      delay: responseReceived - requestSent - (responseSent - requestReceived),
    };
  }

  private onPingResponse(measurement: { offset: number; delay: number }): void {
    this.measurements.push(measurement);
    if (this.measurements.length > SYNC_PLAY_CLOCK.measurements) {
      this.measurements.shift();
    }

    // Throttle once we've warmed up.
    if (this.pings >= SYNC_PLAY_CLOCK.greedyPingCount) {
      this.pollingInterval = SYNC_PLAY_CLOCK.steadyIntervalMs;
    } else {
      this.pings++;
    }

    this.emit("update", this.getTimeOffset(), this.getPing());
  }
}

export default TimeSync;

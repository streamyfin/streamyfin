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
import { EventEmitter } from "../EventEmitter";

const NumberOfTrackedMeasurements = 8;
const PollingIntervalGreedy = 1000; // ms
const PollingIntervalLowProfile = 60000; // ms
const GreedyPingCount = 3;

class Measurement {
  requestSent: number;
  requestReceived: number;
  responseSent: number;
  responseReceived: number;

  constructor(
    requestSent: Date,
    requestReceived: Date,
    responseSent: Date,
    responseReceived: Date,
  ) {
    this.requestSent = requestSent.getTime();
    this.requestReceived = requestReceived.getTime();
    this.responseSent = responseSent.getTime();
    this.responseReceived = responseReceived.getTime();
  }

  /** Time offset (ms): positive means server clock is ahead of ours. */
  getOffset(): number {
    return (
      (this.requestReceived -
        this.requestSent +
        (this.responseSent - this.responseReceived)) /
      2
    );
  }

  /** Round-trip delay (ms), excluding server processing. */
  getDelay(): number {
    return (
      this.responseReceived -
      this.requestSent -
      (this.responseSent - this.requestReceived)
    );
  }

  /** One-way ping (ms). */
  getPing(): number {
    return this.getDelay() / 2;
  }
}

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
  private api: Api;
  private pingStop = true;
  private pollingInterval = PollingIntervalGreedy;
  private poller: ReturnType<typeof setTimeout> | null = null;
  private pings = 0;
  private measurement: Measurement | null = null;
  private measurements: Measurement[] = [];

  constructor(api: Api) {
    super();
    this.api = api;
  }

  /** Called when the user switches Jellyfin servers. */
  updateApiClient(api: Api): void {
    this.api = api;
  }

  /** Whether we've completed at least one successful measurement. */
  isReady(): boolean {
    return !!this.measurement;
  }

  /** Current best-estimate time offset (ms). */
  getTimeOffset(): number {
    return this.measurement ? this.measurement.getOffset() : 0;
  }

  /** Current best-estimate one-way ping (ms). */
  getPing(): number {
    return this.measurement ? this.measurement.getPing() : 0;
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
    this.pingStop = true;
    if (this.poller) {
      clearTimeout(this.poller);
      this.poller = null;
    }
  }

  /** Reset to greedy polling and force a fresh measurement immediately. */
  forceUpdate(): void {
    this.stopPing();
    this.pollingInterval = PollingIntervalGreedy;
    this.pings = 0;
    this.startPing();
  }

  /** Drop all measurements. Used on group leave. */
  resetMeasurements(): void {
    this.measurement = null;
    this.measurements = [];
  }

  /** Full teardown on provider unmount. */
  destroy(): void {
    this.stopPing();
    this.resetMeasurements();
    this.removeAllListeners();
  }

  private scheduleNextPing(): void {
    if (this.poller || this.pingStop) return;
    this.poller = setTimeout(() => {
      this.poller = null;
      this.requestPing()
        .then((result) => this.onPingResponse(result))
        .catch((error) => {
          console.error("SyncPlay TimeSync: ping failed", error);
        })
        .finally(() => this.scheduleNextPing());
    }, this.pollingInterval);
  }

  private async requestPing() {
    const requestSent = new Date();
    const response = await getTimeSyncApi(this.api).getUtcTime();
    const responseReceived = new Date();
    const data = response.data;
    const requestReceived = new Date(data.RequestReceptionTime as string);
    const responseSent = new Date(data.ResponseTransmissionTime as string);
    return { requestSent, requestReceived, responseSent, responseReceived };
  }

  private onPingResponse(result: {
    requestSent: Date;
    requestReceived: Date;
    responseSent: Date;
    responseReceived: Date;
  }): void {
    const measurement = new Measurement(
      result.requestSent,
      result.requestReceived,
      result.responseSent,
      result.responseReceived,
    );

    this.measurements.push(measurement);
    if (this.measurements.length > NumberOfTrackedMeasurements) {
      this.measurements.shift();
    }

    // Outlier rejection: pick the measurement with the shortest delay.
    const sorted = [...this.measurements].sort(
      (a, b) => a.getDelay() - b.getDelay(),
    );
    this.measurement = sorted[0];

    // Throttle once we've warmed up.
    if (this.pings >= GreedyPingCount) {
      this.pollingInterval = PollingIntervalLowProfile;
    } else {
      this.pings++;
    }

    this.emit("update", this.getTimeOffset(), this.getPing());
  }
}

export default TimeSync;

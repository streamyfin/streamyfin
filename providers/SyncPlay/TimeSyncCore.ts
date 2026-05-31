/**
 * TimeSyncCore
 *
 * Manages time synchronization with the Jellyfin server.
 * Uses NTP-like algorithm to calculate clock offset between client and server.
 *
 * Based on jellyfin-web's TimeSyncCore.js and TimeSync.js
 */

import type { Api } from "@jellyfin/sdk";
import { getTimeSyncApi } from "@jellyfin/sdk/lib/utils/api";
import type { TimeSyncMeasurement } from "./types";

// Time estimation constants
const NumberOfTrackedMeasurements = 8;
const PollingIntervalGreedy = 1000; // ms - fast polling initially
const PollingIntervalLowProfile = 60000; // ms - slow polling once synced
const GreedyPingCount = 3;

/**
 * Stores a single time sync measurement
 */
class Measurement {
  requestSent: number;
  requestReceived: number;
  responseSent: number;
  responseReceived: number;

  constructor(data: TimeSyncMeasurement) {
    this.requestSent = data.requestSent;
    this.requestReceived = data.requestReceived;
    this.responseSent = data.responseSent;
    this.responseReceived = data.responseReceived;
  }

  /**
   * Calculate time offset from server, in milliseconds.
   * Offset = (t1 - t0 + t2 - t3) / 2
   * where t0 = request sent, t1 = request received, t2 = response sent, t3 = response received
   */
  getOffset(): number {
    return (
      (this.requestReceived -
        this.requestSent +
        (this.responseSent - this.responseReceived)) /
      2
    );
  }

  /**
   * Get round-trip delay, in milliseconds.
   */
  getDelay(): number {
    return (
      this.responseReceived -
      this.requestSent -
      (this.responseSent - this.requestReceived)
    );
  }

  /**
   * Get ping time (half of round-trip), in milliseconds.
   */
  getPing(): number {
    return this.getDelay() / 2;
  }
}

export type TimeSyncEventCallback = (
  error: Error | null,
  timeOffset: number | null,
  ping: number | null,
) => void;

/**
 * TimeSyncCore - Manages time synchronization with the server
 */
export class TimeSyncCore {
  private api: Api;
  private poller: ReturnType<typeof setTimeout> | null = null;
  private pingStop = true;
  private pollingInterval = PollingIntervalGreedy;
  private pings = 0;
  private measurement: Measurement | null = null;
  private measurements: Measurement[] = [];
  private extraTimeOffset = 0;
  private onUpdateCallback: TimeSyncEventCallback | null = null;

  constructor(api: Api) {
    this.api = api;
  }

  /**
   * Set callback for time sync updates
   */
  onUpdate(callback: TimeSyncEventCallback): void {
    this.onUpdateCallback = callback;
  }

  /**
   * Check if time sync is ready (has at least one measurement)
   */
  isReady(): boolean {
    return this.measurement !== null;
  }

  /**
   * Get the current time offset with server, in milliseconds.
   */
  getTimeOffset(): number {
    return (this.measurement?.getOffset() ?? 0) + this.extraTimeOffset;
  }

  /**
   * Get current ping time to server, in milliseconds.
   */
  getPing(): number {
    return this.measurement?.getPing() ?? 0;
  }

  /**
   * Set extra time offset for manual adjustment
   */
  setExtraTimeOffset(offset: number): void {
    this.extraTimeOffset = offset;
  }

  /**
   * Convert server time to local time.
   */
  remoteDateToLocal(remote: Date): Date {
    // remote - local = offset, so local = remote - offset
    return new Date(remote.getTime() - this.getTimeOffset());
  }

  /**
   * Convert local time to server time.
   */
  localDateToRemote(local: Date): Date {
    // remote - local = offset, so remote = local + offset
    return new Date(local.getTime() + this.getTimeOffset());
  }

  /**
   * Get the display name of the sync device
   */
  getActiveDeviceName(): string {
    return "Server";
  }

  /**
   * Make a ping request to the server to measure time offset
   */
  private async requestPing(): Promise<TimeSyncMeasurement> {
    const requestSent = Date.now();

    const timeSyncApi = getTimeSyncApi(this.api);
    const response = await timeSyncApi.getUtcTime();

    const responseReceived = Date.now();
    const data = response.data;

    const requestReceived = new Date(data.RequestReceptionTime!).getTime();
    const responseSent = new Date(data.ResponseTransmissionTime!).getTime();

    return {
      requestSent,
      requestReceived,
      responseSent,
      responseReceived,
    };
  }

  /**
   * Update time offset with a new measurement
   */
  private updateTimeOffset(measurement: Measurement): void {
    this.measurements.push(measurement);

    if (this.measurements.length > NumberOfTrackedMeasurements) {
      this.measurements.shift();
    }

    // Pick measurement with minimum delay (most accurate)
    const sortedMeasurements = [...this.measurements].sort(
      (a, b) => a.getDelay() - b.getDelay(),
    );
    this.measurement = sortedMeasurements[0];
  }

  /**
   * Internal poller for ping requests
   */
  private internalRequestPing(): void {
    if (this.poller !== null || this.pingStop) {
      return;
    }

    this.poller = setTimeout(async () => {
      this.poller = null;

      try {
        const result = await this.requestPing();
        this.onPingSuccess(result);
      } catch (error) {
        this.onPingError(error as Error);
      }

      // Schedule next ping
      this.internalRequestPing();
    }, this.pollingInterval);
  }

  /**
   * Handle successful ping response
   */
  private onPingSuccess(result: TimeSyncMeasurement): void {
    const measurement = new Measurement(result);
    this.updateTimeOffset(measurement);

    // Slow down polling after initial greedy phase
    if (this.pings >= GreedyPingCount) {
      this.pollingInterval = PollingIntervalLowProfile;
    } else {
      this.pings++;
    }

    this.onUpdateCallback?.(null, this.getTimeOffset(), this.getPing());
  }

  /**
   * Handle ping error
   */
  private onPingError(error: Error): void {
    console.error("SyncPlay TimeSyncCore: ping error", error);
    this.onUpdateCallback?.(error, null, null);
  }

  /**
   * Start the time sync poller
   */
  startPing(): void {
    this.pingStop = false;
    this.internalRequestPing();
  }

  /**
   * Stop the time sync poller
   */
  stopPing(): void {
    this.pingStop = true;
    if (this.poller !== null) {
      clearTimeout(this.poller);
      this.poller = null;
    }
  }

  /**
   * Force an immediate update (reset to greedy mode)
   */
  forceUpdate(): void {
    this.stopPing();
    this.pollingInterval = PollingIntervalGreedy;
    this.pings = 0;
    this.startPing();
  }

  /**
   * Drop all accumulated measurements
   */
  resetMeasurements(): void {
    this.measurement = null;
    this.measurements = [];
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.stopPing();
    this.resetMeasurements();
    this.onUpdateCallback = null;
  }
}

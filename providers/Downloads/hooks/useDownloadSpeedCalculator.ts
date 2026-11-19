import { DOWNLOAD_SPEED_WINDOW_MS } from "@/constants/Downloads";

interface SpeedDataPoint {
  timestamp: number;
  bytesDownloaded: number;
}

const MIN_DATA_POINTS = 5; // Need at least 5 points for accurate speed
const MAX_REASONABLE_SPEED = 1024 * 1024 * 1024; // 1 GB/s sanity check
const EMA_ALPHA = 0.2; // Smoothing factor for EMA (lower = smoother, 0-1 range)

// Private state
const dataPoints = new Map<string, SpeedDataPoint[]>();

function isValidBytes(bytes: number): boolean {
  return typeof bytes === "number" && Number.isFinite(bytes) && bytes >= 0;
}

function isValidTimestamp(timestamp: number): boolean {
  return (
    typeof timestamp === "number" && Number.isFinite(timestamp) && timestamp > 0
  );
}

export function addSpeedDataPoint(
  processId: string,
  bytesDownloaded: number,
): void {
  // Validate input
  if (!isValidBytes(bytesDownloaded)) {
    console.warn(
      `[SpeedCalc] Invalid bytes value for ${processId}: ${bytesDownloaded}`,
    );
    return;
  }

  const now = Date.now();

  if (!isValidTimestamp(now)) {
    console.warn(`[SpeedCalc] Invalid timestamp: ${now}`);
    return;
  }

  if (!dataPoints.has(processId)) {
    dataPoints.set(processId, []);
  }

  const points = dataPoints.get(processId)!;

  // Validate that bytes are increasing (or at least not decreasing)
  if (points.length > 0) {
    const lastPoint = points[points.length - 1];
    if (bytesDownloaded < lastPoint.bytesDownloaded) {
      console.warn(
        `[SpeedCalc] Bytes decreased for ${processId}: ${lastPoint.bytesDownloaded} -> ${bytesDownloaded}. Resetting.`,
      );
      // Reset the data for this process
      dataPoints.set(processId, []);
    }
  }

  // Add new data point
  points.push({
    timestamp: now,
    bytesDownloaded,
  });

  // Remove data points older than the window
  const cutoffTime = now - DOWNLOAD_SPEED_WINDOW_MS;
  while (points.length > 0 && points[0].timestamp < cutoffTime) {
    points.shift();
  }
}

// Bytes over elapsed time, and not an average of the gaps between events: progress arrives in
// bursts, and a weighted average of the gaps let the last few events of a lull decide the number.
export function calculateSpeed(processId: string): number | undefined {
  const points = dataPoints.get(processId);

  if (!points || points.length < MIN_DATA_POINTS) {
    return undefined;
  }

  const oldest = points[0];
  const newest = points[points.length - 1];

  // Validate data points
  if (
    !isValidBytes(oldest.bytesDownloaded) ||
    !isValidBytes(newest.bytesDownloaded) ||
    !isValidTimestamp(oldest.timestamp) ||
    !isValidTimestamp(newest.timestamp)
  ) {
    console.warn(`[SpeedCalc] Invalid data points for ${processId}`);
    return undefined;
  }

  const timeDelta = (newest.timestamp - oldest.timestamp) / 1000; // seconds
  const bytesDelta = newest.bytesDownloaded - oldest.bytesDownloaded;

  // Validate calculations
  if (timeDelta < 0.5) {
    // Not enough time has passed
    return undefined;
  }

  if (bytesDelta < 0) {
    console.warn(
      `[SpeedCalc] Negative bytes delta for ${processId}: ${bytesDelta}`,
    );
    return undefined;
  }

  const speed = bytesDelta / timeDelta; // bytes per second

  // Sanity check: if speed is unrealistically high, something is wrong
  if (!Number.isFinite(speed) || speed < 0 || speed > MAX_REASONABLE_SPEED) {
    console.warn(`[SpeedCalc] Unrealistic speed for ${processId}: ${speed}`);
    return undefined;
  }

  return speed;
}

// Calculate ETA in seconds
export function calculateETA(
  processId: string,
  bytesDownloaded: number,
  totalBytes: number,
): number | undefined {
  const speed = calculateSpeed(processId);

  if (!speed || speed <= 0 || !totalBytes || totalBytes <= 0) {
    return undefined;
  }

  const bytesRemaining = totalBytes - bytesDownloaded;
  if (bytesRemaining <= 0) {
    return 0;
  }

  const secondsRemaining = bytesRemaining / speed;

  // Sanity check
  if (!Number.isFinite(secondsRemaining) || secondsRemaining < 0) {
    return undefined;
  }

  return secondsRemaining;
}

// Calculate smoothed ETA using Exponential Moving Average (EMA)
// This provides much smoother ETA estimates, reducing jumpy time estimates
const emaETA = new Map<string, number>();

export function calculateSmoothedETA(
  processId: string,
  bytesDownloaded: number,
  totalBytes: number,
): number | undefined {
  const currentETA = calculateETA(processId, bytesDownloaded, totalBytes);

  if (currentETA === undefined) {
    return undefined;
  }

  const previousEma = emaETA.get(processId);

  if (previousEma === undefined) {
    // First calculation, initialize with current ETA
    emaETA.set(processId, currentETA);
    return currentETA;
  }

  // EMA formula: EMA(t) = α * current + (1 - α) * EMA(t-1)
  // Lower alpha = smoother but slower to respond
  const smoothed = EMA_ALPHA * currentETA + (1 - EMA_ALPHA) * previousEma;

  emaETA.set(processId, smoothed);
  return smoothed;
}

export function clearSpeedData(processId: string): void {
  dataPoints.delete(processId);
  emaETA.delete(processId);
}

export function resetAllSpeedData(): void {
  dataPoints.clear();
  emaETA.clear();
}

// Debug function to inspect current state
export function getSpeedDataDebug(
  processId: string,
): SpeedDataPoint[] | undefined {
  return dataPoints.get(processId);
}

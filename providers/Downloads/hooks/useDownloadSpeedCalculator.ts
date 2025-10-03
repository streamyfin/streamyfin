interface SpeedDataPoint {
  timestamp: number;
  bytesDownloaded: number;
}

const WINDOW_DURATION = 60000; // 1 minute in ms
const MIN_DATA_POINTS = 3; // Need at least 3 points for accurate speed
const MAX_REASONABLE_SPEED = 1024 * 1024 * 1024; // 1 GB/s sanity check

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

  // Remove data points older than 1 minute
  const cutoffTime = now - WINDOW_DURATION;
  while (points.length > 0 && points[0].timestamp < cutoffTime) {
    points.shift();
  }
}

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

// Calculate weighted average speed (more recent data has higher weight)
export function calculateWeightedSpeed(processId: string): number | undefined {
  const points = dataPoints.get(processId);

  if (!points || points.length < MIN_DATA_POINTS) {
    return undefined;
  }

  let totalWeightedSpeed = 0;
  let totalWeight = 0;

  // Calculate speed between consecutive points with exponential weighting
  for (let i = 1; i < points.length; i++) {
    const prevPoint = points[i - 1];
    const currPoint = points[i];

    // Validate both points
    if (
      !isValidBytes(prevPoint.bytesDownloaded) ||
      !isValidBytes(currPoint.bytesDownloaded) ||
      !isValidTimestamp(prevPoint.timestamp) ||
      !isValidTimestamp(currPoint.timestamp)
    ) {
      continue;
    }

    const timeDelta = (currPoint.timestamp - prevPoint.timestamp) / 1000;
    const bytesDelta = currPoint.bytesDownloaded - prevPoint.bytesDownloaded;

    // Skip invalid deltas
    if (timeDelta < 0.1 || bytesDelta < 0) {
      continue;
    }

    const speed = bytesDelta / timeDelta;

    // Sanity check
    if (!Number.isFinite(speed) || speed < 0 || speed > MAX_REASONABLE_SPEED) {
      console.warn(`[SpeedCalc] Skipping unrealistic speed point: ${speed}`);
      continue;
    }

    // More recent points get exponentially higher weight
    const weight = 2 ** i;
    totalWeightedSpeed += speed * weight;
    totalWeight += weight;
  }

  if (totalWeight === 0) {
    return undefined;
  }

  const weightedSpeed = totalWeightedSpeed / totalWeight;

  // Final sanity check
  if (!Number.isFinite(weightedSpeed) || weightedSpeed < 0) {
    return undefined;
  }

  return weightedSpeed;
}

export function clearSpeedData(processId: string): void {
  dataPoints.delete(processId);
}

export function resetAllSpeedData(): void {
  dataPoints.clear();
}

// Debug function to inspect current state
export function getSpeedDataDebug(
  processId: string,
): SpeedDataPoint[] | undefined {
  return dataPoints.get(processId);
}

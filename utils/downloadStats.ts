export function formatSpeed(bytesPerSecond: number | undefined): string {
  if (!bytesPerSecond || bytesPerSecond <= 0) return "N/A";

  const mbps = bytesPerSecond / (1024 * 1024);
  if (mbps >= 1) {
    return `${mbps.toFixed(2)} MB/s`;
  }

  const kbps = bytesPerSecond / 1024;
  return `${kbps.toFixed(0)} KB/s`;
}

export function formatETA(
  bytesDownloaded: number | undefined,
  totalBytes: number | undefined,
  speed: number | undefined,
): string {
  if (!bytesDownloaded || !totalBytes || !speed || speed <= 0) {
    return "Calculating...";
  }

  const remainingBytes = totalBytes - bytesDownloaded;
  if (remainingBytes <= 0) return "0s";

  const secondsRemaining = remainingBytes / speed;

  if (secondsRemaining < 60) {
    return `${Math.ceil(secondsRemaining)}s`;
  }
  if (secondsRemaining < 3600) {
    const minutes = Math.floor(secondsRemaining / 60);
    const seconds = Math.ceil(secondsRemaining % 60);
    return `${minutes}m ${seconds}s`;
  }
  const hours = Math.floor(secondsRemaining / 3600);
  const minutes = Math.floor((secondsRemaining % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

export function calculateETA(
  bytesDownloaded: number | undefined,
  totalBytes: number | undefined,
  speed: number | undefined,
): number | undefined {
  if (!bytesDownloaded || !totalBytes || !speed || speed <= 0) {
    return undefined;
  }

  const remainingBytes = totalBytes - bytesDownloaded;
  return remainingBytes / speed; // seconds
}

/**
 * Estimates the download file size based on bitrate and video duration.
 * Used when transcoding at lower bitrates where final size is unknown.
 * Adds 10% overhead to account for container and metadata.
 *
 * @param bitrateValue - The bitrate in bits per second
 * @param runTimeTicks - The video duration in ticks (1 tick = 100 nanoseconds)
 * @returns Estimated file size in bytes (with 10% overhead), or undefined if duration is invalid
 */
export function estimateDownloadSize(
  bitrateValue: number,
  runTimeTicks?: number | null,
): number | undefined {
  if (!runTimeTicks || runTimeTicks <= 0) return undefined;

  // Convert ticks to seconds (1 tick = 100 nanoseconds)
  const durationSeconds = runTimeTicks / 10000000;

  // Calculate size in bytes: (bitrate * duration) / 8
  // Add 10% overhead for container and metadata
  const estimatedBytes = ((bitrateValue * durationSeconds) / 8) * 1.1;

  return Math.floor(estimatedBytes);
}

/**
 * Estimates a transcoded download, whose response carries no Content-Length.
 * The server encodes at the chosen bitrate but never above the source's, and
 * "Max" leaves no chosen bitrate at all, so the source's is the only figure.
 */
export function estimateTranscodeSize(
  maxBitrate: number | undefined,
  sourceBitrate: number | null | undefined,
  runTimeTicks?: number | null,
): number | undefined {
  const bitrates = [maxBitrate, sourceBitrate].filter(
    (b): b is number => !!b && b > 0,
  );
  if (bitrates.length === 0) return undefined;
  return estimateDownloadSize(Math.min(...bitrates), runTimeTicks);
}

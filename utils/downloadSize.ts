import type { MediaSourceInfo } from "@jellyfin/sdk/lib/generated-client/models";
import {
  DOWNLOAD_BITS_PER_BYTE,
  DOWNLOAD_SIZE_OVERHEAD,
  DOWNLOAD_TICKS_PER_SECOND,
} from "@/constants/Downloads";

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
  const durationSeconds = runTimeTicks / DOWNLOAD_TICKS_PER_SECOND;

  // Calculate size in bytes: (bitrate * duration) / 8
  // Add 10% overhead for container and metadata
  const estimatedBytes =
    ((bitrateValue * durationSeconds) / DOWNLOAD_BITS_PER_BYTE) *
    DOWNLOAD_SIZE_OVERHEAD;

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

/** Direct downloads report their real length; do not seed an estimated total. */
export function estimateDownloadActivitySize(
  mediaSource: Pick<MediaSourceInfo, "TranscodingUrl" | "Bitrate">,
  maxBitrate: number | undefined,
  runTimeTicks?: number | null,
): number | undefined {
  if (!mediaSource.TranscodingUrl) return undefined;
  return estimateTranscodeSize(maxBitrate, mediaSource.Bitrate, runTimeTicks);
}

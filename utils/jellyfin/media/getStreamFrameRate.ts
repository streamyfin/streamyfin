import type { MediaStream } from "@jellyfin/sdk/lib/generated-client/models";

/**
 * The frame rate to show for a video stream, in frames per second.
 *
 * `ReferenceFrameRate` is the server's own pick between the average and the
 * real frame rate: the average unless it is missing or unrealistic. Reading
 * `AverageFrameRate` directly shows that unrealistic value instead, which is
 * what jellyfin-web stopped doing as well. The average stays as the fallback
 * for a server that does not send the reference rate.
 *
 * A rate of zero is the probe not knowing, so it is reported as no rate at
 * all rather than shown as "0 fps".
 */
export const getStreamFrameRate = (
  stream:
    | Pick<MediaStream, "ReferenceFrameRate" | "AverageFrameRate">
    | null
    | undefined,
): number | undefined => {
  const frameRate = stream?.ReferenceFrameRate ?? stream?.AverageFrameRate;
  return frameRate != null && frameRate > 0 ? frameRate : undefined;
};

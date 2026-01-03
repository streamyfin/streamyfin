/**
 * Subtitle utility functions for mapping between Jellyfin and MPV track indices.
 *
 * Jellyfin uses server-side indices (e.g., 3, 4, 5 for subtitles in MediaStreams).
 * MPV uses its own track IDs starting from 1, only counting tracks loaded into MPV.
 *
 * Image-based subtitles (PGS, VOBSUB) during transcoding are burned into the video
 * and NOT available in MPV's track list.
 */

import {
  type MediaSourceInfo,
  type MediaStream,
  SubtitleDeliveryMethod,
} from "@jellyfin/sdk/lib/generated-client";

/** Check if subtitle is image-based (PGS, VOBSUB, etc.) */
export const isImageBasedSubtitle = (sub: MediaStream): boolean =>
  sub.IsTextSubtitleStream === false;

/**
 * Determine if a subtitle will be available in MPV's track list.
 *
 * A subtitle is in MPV if:
 * - Delivery is Embed/Hls/External AND not an image-based sub during transcode
 */
export const isSubtitleInMpv = (
  sub: MediaStream,
  isTranscoding: boolean,
): boolean => {
  // During transcoding, image-based subs are burned in, not in MPV
  if (isTranscoding && isImageBasedSubtitle(sub)) {
    return false;
  }

  // Embed/Hls/External methods mean the sub is loaded into MPV
  return (
    sub.DeliveryMethod === SubtitleDeliveryMethod.Embed ||
    sub.DeliveryMethod === SubtitleDeliveryMethod.Hls ||
    sub.DeliveryMethod === SubtitleDeliveryMethod.External
  );
};

/**
 * Calculate the MPV track ID for a given Jellyfin subtitle index.
 *
 * MPV track IDs are 1-based and only count subtitles that are actually in MPV.
 * We iterate through all subtitles, counting only those in MPV, until we find
 * the one matching the Jellyfin index.
 *
 * @param mediaSource - The media source containing subtitle streams
 * @param jellyfinSubtitleIndex - The Jellyfin server-side subtitle index (-1 = disabled)
 * @param isTranscoding - Whether the stream is being transcoded
 * @returns MPV track ID (1-based), or -1 if disabled, or undefined if not in MPV
 */
export const getMpvSubtitleId = (
  mediaSource: MediaSourceInfo | null | undefined,
  jellyfinSubtitleIndex: number | undefined,
  isTranscoding: boolean,
): number | undefined => {
  // -1 or undefined means disabled
  if (jellyfinSubtitleIndex === undefined || jellyfinSubtitleIndex === -1) {
    return -1;
  }

  const allSubs =
    mediaSource?.MediaStreams?.filter((s) => s.Type === "Subtitle") || [];

  // Find the subtitle with the matching Jellyfin index
  const targetSub = allSubs.find((s) => s.Index === jellyfinSubtitleIndex);

  // If the target subtitle isn't in MPV (e.g., image-based during transcode), return undefined
  if (!targetSub || !isSubtitleInMpv(targetSub, isTranscoding)) {
    return undefined;
  }

  // Count MPV track position (1-based)
  let mpvIndex = 0;
  for (const sub of allSubs) {
    if (isSubtitleInMpv(sub, isTranscoding)) {
      mpvIndex++;
      if (sub.Index === jellyfinSubtitleIndex) {
        return mpvIndex;
      }
    }
  }

  return undefined;
};

/**
 * Calculate the MPV track ID for a given Jellyfin audio index.
 *
 * Audio tracks are simpler - they're always in MPV (no burn-in like image subs).
 * MPV track IDs are 1-based.
 *
 * @param mediaSource - The media source containing audio streams
 * @param jellyfinAudioIndex - The Jellyfin server-side audio index
 * @returns MPV track ID (1-based), or undefined if not found
 */
export const getMpvAudioId = (
  mediaSource: MediaSourceInfo | null | undefined,
  jellyfinAudioIndex: number | undefined,
): number | undefined => {
  if (jellyfinAudioIndex === undefined) {
    return undefined;
  }

  const allAudio =
    mediaSource?.MediaStreams?.filter((s) => s.Type === "Audio") || [];

  // Find position in audio list (1-based for MPV)
  const position = allAudio.findIndex((a) => a.Index === jellyfinAudioIndex);
  return position >= 0 ? position + 1 : undefined;
};

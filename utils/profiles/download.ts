/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
import type {
  DeviceProfile,
  SubtitleProfile,
} from "@jellyfin/sdk/lib/generated-client/models";
import { type AudioTranscodeModeType, generateDeviceProfile } from "./native";
import { IMAGE_SUBTITLE_CODECS, TEXT_SUBTITLE_CODECS } from "./subtitles";

/**
 * Download-specific subtitle profiles.
 */
const downloadSubtitleProfiles: SubtitleProfile[] = [
  ...TEXT_SUBTITLE_CODECS.map(
    (Format): SubtitleProfile => ({ Format, Method: "External" }),
  ),
  ...IMAGE_SUBTITLE_CODECS.map(
    (Format): SubtitleProfile => ({ Format, Method: "Encode" }),
  ),
];

/**
 * Generates a device profile optimized for downloads.
 * Uses the same audio codec logic as streaming but with download-specific bitrate limits.
 */
export const generateDownloadProfile = (
  audioMode: AudioTranscodeModeType = "auto",
): DeviceProfile => {
  // Get the base profile with proper audio codec configuration
  const baseProfile = generateDeviceProfile({ audioMode });

  // Override with download-specific settings
  return {
    ...baseProfile,
    Name: "1. MPV Download",
    // Limit bitrate for downloads (20 Mbps)
    MaxStaticBitrate: 20_000_000,
    MaxStreamingBitrate: 20_000_000,
    // Use download-specific subtitle profiles
    SubtitleProfiles: downloadSubtitleProfiles,
    // Update transcoding profiles with download-specific settings
    TranscodingProfiles: baseProfile.TranscodingProfiles.map((profile) => {
      if (profile.Type === "Video") {
        return {
          ...profile,
          Protocol: "http" as const,
          Container: "mp4",
          AudioCodec: "aac,mp3,ac3,eac3",
          CopyTimestamps: false,
        };
      }
      return profile;
    }),
  };
};

// Default export for backward compatibility
export default generateDownloadProfile();

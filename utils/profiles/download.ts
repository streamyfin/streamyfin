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

/**
 * Download-specific subtitle profiles.
 * These are more permissive than streaming profiles since we can embed subtitles.
 */
const downloadSubtitleProfiles: SubtitleProfile[] = [
  // Official formats
  { Format: "vtt", Method: "Encode" },
  { Format: "webvtt", Method: "Encode" },
  { Format: "srt", Method: "Encode" },
  { Format: "subrip", Method: "Encode" },
  { Format: "ttml", Method: "Encode" },
  { Format: "dvdsub", Method: "Encode" },
  { Format: "ass", Method: "Encode" },
  { Format: "idx", Method: "Encode" },
  { Format: "pgs", Method: "Encode" },
  { Format: "pgssub", Method: "Encode" },
  { Format: "ssa", Method: "Encode" },
  // Other formats
  { Format: "microdvd", Method: "Encode" },
  { Format: "mov_text", Method: "Encode" },
  { Format: "mpl2", Method: "Encode" },
  { Format: "pjs", Method: "Encode" },
  { Format: "realtext", Method: "Encode" },
  { Format: "scc", Method: "Encode" },
  { Format: "smi", Method: "Encode" },
  { Format: "stl", Method: "Encode" },
  { Format: "sub", Method: "Encode" },
  { Format: "subviewer", Method: "Encode" },
  { Format: "teletext", Method: "Encode" },
  { Format: "text", Method: "Encode" },
  { Format: "vplayer", Method: "Encode" },
  { Format: "xsub", Method: "Encode" },
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
          CopyTimestamps: false,
        };
      }
      return profile;
    }),
  };
};

// Default export for backward compatibility
export default generateDownloadProfile();

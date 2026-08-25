/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
import type { DeviceProfile } from "@jellyfin/sdk/lib/generated-client/models";
import { type AudioTranscodeModeType, generateDeviceProfile } from "./native";
import { getSubtitleProfiles } from "./subtitles";

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
    // No bitrate cap of its own: "Max" in the quality picker has to mean the
    // source bitrate, and any lower choice is already sent as
    // maxStreamingBitrate on the PlaybackInfo request.
    // Text subtitles come down as sidecar files, image ones are burned in.
    SubtitleProfiles: getSubtitleProfiles({ target: "download" }),
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

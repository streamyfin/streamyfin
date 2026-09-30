/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
import type { DeviceProfile } from "@jellyfin/sdk/lib/generated-client/models";
import {
  DOWNLOAD_MULTI_TRACK_AUDIO_BITRATE,
  DOWNLOAD_MULTI_TRACK_AUDIO_CHANNELS,
  DOWNLOAD_MULTI_TRACK_AUDIO_CODEC,
  DOWNLOAD_MULTI_TRACK_AUDIO_PROFILE,
  DOWNLOAD_MULTI_TRACK_EXTRA_VIDEO_BITRATE,
  DOWNLOAD_MULTI_TRACK_EXTRA_VIDEO_FRAMERATE,
  DOWNLOAD_MULTI_TRACK_EXTRA_VIDEO_HEIGHT,
  DOWNLOAD_MULTI_TRACK_EXTRA_VIDEO_WIDTH,
  DOWNLOAD_MULTI_TRACK_VIDEO_BIT_DEPTH,
  DOWNLOAD_MULTI_TRACK_VIDEO_CODEC,
  DOWNLOAD_MULTI_TRACK_VIDEO_PROFILE,
} from "@/constants/Downloads";
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

/**
 * Negotiates progressive MP4 inputs for the native multi-track MKV remuxer.
 * Baseline excludes B-frames; forced AAC encoding uses the server's LC encoder.
 * Audio channels are capped at stereo; Jellyfin preserves mono sources.
 * The legacy single-track download profile is intentionally independent.
 *
 * @param additionalAudio Whether to limit the disposable video accompanying an extra audio track.
 */
export const generateMultiTrackDownloadProfile = (
  additionalAudio = false,
): DeviceProfile => ({
  Name: "Multi-track download",
  DirectPlayProfiles: [],
  TranscodingProfiles: [
    {
      Type: "Video",
      Context: "Streaming",
      Protocol: "http",
      Container: "mp4",
      VideoCodec: DOWNLOAD_MULTI_TRACK_VIDEO_CODEC,
      AudioCodec: DOWNLOAD_MULTI_TRACK_AUDIO_CODEC,
      MaxAudioChannels: String(DOWNLOAD_MULTI_TRACK_AUDIO_CHANNELS),
      CopyTimestamps: false,
      EnableAudioVbrEncoding: false,
    },
  ],
  CodecProfiles: [
    {
      Type: "Video",
      Codec: DOWNLOAD_MULTI_TRACK_VIDEO_CODEC,
      Conditions: [
        {
          Condition: "Equals",
          Property: "VideoProfile",
          Value: DOWNLOAD_MULTI_TRACK_VIDEO_PROFILE,
        },
        {
          Condition: "LessThanEqual",
          Property: "VideoBitDepth",
          Value: String(DOWNLOAD_MULTI_TRACK_VIDEO_BIT_DEPTH),
        },
        ...(additionalAudio
          ? ([
              {
                Condition: "LessThanEqual",
                Property: "Width",
                Value: String(DOWNLOAD_MULTI_TRACK_EXTRA_VIDEO_WIDTH),
              },
              {
                Condition: "LessThanEqual",
                Property: "Height",
                Value: String(DOWNLOAD_MULTI_TRACK_EXTRA_VIDEO_HEIGHT),
              },
              {
                Condition: "LessThanEqual",
                Property: "VideoFramerate",
                Value: String(DOWNLOAD_MULTI_TRACK_EXTRA_VIDEO_FRAMERATE),
              },
              {
                Condition: "LessThanEqual",
                Property: "VideoBitrate",
                Value: String(DOWNLOAD_MULTI_TRACK_EXTRA_VIDEO_BITRATE),
              },
            ] as const)
          : []),
      ],
    },
    {
      Type: "VideoAudio",
      Codec: DOWNLOAD_MULTI_TRACK_AUDIO_CODEC,
      Conditions: [
        {
          Condition: "Equals",
          Property: "AudioProfile",
          Value: DOWNLOAD_MULTI_TRACK_AUDIO_PROFILE,
        },
        {
          Condition: "LessThanEqual",
          Property: "AudioChannels",
          Value: String(DOWNLOAD_MULTI_TRACK_AUDIO_CHANNELS),
        },
        {
          Condition: "LessThanEqual",
          Property: "AudioBitrate",
          Value: String(DOWNLOAD_MULTI_TRACK_AUDIO_BITRATE),
        },
      ],
    },
  ],
  SubtitleProfiles: getSubtitleProfiles({ target: "download" }),
});

// Default export for backward compatibility
export default generateDownloadProfile();

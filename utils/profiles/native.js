/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
import { Platform } from "react-native";
import MediaTypes from "../../constants/MediaTypes";
import { getSubtitleProfiles } from "./subtitles";

/**
 * @typedef {"ios" | "android"} PlatformType
 * @typedef {"mpv"} PlayerType
 * @typedef {"auto" | "stereo" | "5.1" | "passthrough"} AudioTranscodeModeType
 *
 * @typedef {Object} ProfileOptions
 * @property {PlatformType} [platform] - Target platform
 * @property {PlayerType} [player] - Video player being used (MPV only)
 * @property {AudioTranscodeModeType} [audioMode] - Audio transcoding mode
 */

/**
 * Audio profiles for react-native-track-player based on platform capabilities.
 * iOS uses AVPlayer, Android uses ExoPlayer - each has different codec support.
 */
const getAudioDirectPlayProfile = (platform) => {
  if (platform === "ios") {
    // iOS AVPlayer supported formats
    return {
      Type: MediaTypes.Audio,
      Container: "mp3,m4a,aac,flac,alac,wav,aiff,caf",
      AudioCodec: "mp3,aac,alac,flac,opus,pcm",
    };
  }

  // Android ExoPlayer supported formats
  return {
    Type: MediaTypes.Audio,
    Container: "mp3,m4a,aac,ogg,flac,wav,webm,mka",
    AudioCodec: "mp3,aac,flac,vorbis,opus,pcm",
  };
};

const getAudioCodecProfile = (platform) => {
  if (platform === "ios") {
    // iOS AVPlayer codec constraints
    return {
      Type: MediaTypes.Audio,
      Codec: "aac,ac3,eac3,mp3,flac,alac,opus,pcm",
    };
  }

  // Android ExoPlayer codec constraints
  return {
    Type: MediaTypes.Audio,
    Codec: "aac,ac3,eac3,mp3,flac,vorbis,opus,pcm",
  };
};

/**
 * Gets the video audio codec configuration based on platform and audio mode.
 *
 * MPV handles most codecs well. TrueHD is only enabled in passthrough mode
 * for users with external DAC/receiver setups.
 *
 * @param {PlatformType} platform
 * @param {AudioTranscodeModeType} audioMode
 * @returns {{ directPlayCodec: string, maxAudioChannels: string }}
 */
const getVideoAudioCodecs = (platform, audioMode) => {
  // Base codecs that work everywhere
  const baseCodecs = "aac,mp3,flac,opus,vorbis";

  // Surround codecs - MPV handles these well
  const surroundCodecs = "ac3,eac3,dts";

  // Lossless HD codecs - only for passthrough mode
  const losslessHdCodecs = "truehd";

  // Platform-specific codecs
  const platformCodecs = platform === "ios" ? "alac,wma" : "wma";

  switch (audioMode) {
    case "stereo":
      // Force stereo transcoding - only allow basic codecs
      return {
        directPlayCodec: `${baseCodecs},${platformCodecs}`,
        maxAudioChannels: "2",
      };

    case "5.1":
      // Allow up to 5.1 - include surround codecs but not lossless HD
      return {
        directPlayCodec: `${baseCodecs},${surroundCodecs},${platformCodecs}`,
        maxAudioChannels: "6",
      };

    case "passthrough":
      // Allow all codecs - for users with external DAC/receiver
      return {
        directPlayCodec: `${baseCodecs},${surroundCodecs},${losslessHdCodecs},${platformCodecs}`,
        maxAudioChannels: "8",
      };

    default:
      // Auto mode: default to 5.1 support for MPV
      return {
        directPlayCodec: `${baseCodecs},${surroundCodecs},${platformCodecs}`,
        maxAudioChannels: "6",
      };
  }
};

/**
 * Generates a device profile for Jellyfin playback.
 *
 * @param {ProfileOptions} [options] - Profile configuration options
 * @returns {Object} Jellyfin device profile
 */
export const generateDeviceProfile = (options = {}) => {
  const platform = options.platform || Platform.OS;
  const audioMode = options.audioMode || "auto";

  const { directPlayCodec, maxAudioChannels } = getVideoAudioCodecs(
    platform,
    audioMode,
  );

  /**
   * Device profile for MPV player
   */
  const profile = {
    Name: "1. MPV",
    MaxStaticBitrate: 999_999_999,
    MaxStreamingBitrate: 999_999_999,
    CodecProfiles: [
      {
        Type: MediaTypes.Video,
        Codec: "h264,mpeg4,divx,xvid,wmv,vc1,vp8,vp9,av1",
      },
      {
        Type: MediaTypes.Video,
        Codec: "hevc,h265",
        Conditions: [
          {
            Condition: "LessThanEqual",
            Property: "VideoLevel",
            Value: "153",
            IsRequired: false,
          },
          {
            Condition: "NotEquals",
            Property: "VideoRangeType",
            Value: "DOVI", //no dolby vision at all
            IsRequired: true,
          },
        ],
      },
      getAudioCodecProfile(platform),
    ],
    DirectPlayProfiles: [
      {
        Type: MediaTypes.Video,
        Container: "mp4,mkv,avi,mov,flv,ts,m2ts,webm,ogv,3gp,hls",
        VideoCodec:
          "h264,hevc,mpeg4,divx,xvid,wmv,vc1,vp8,vp9,av1,avi,mpeg,mpeg2video",
        AudioCodec: directPlayCodec,
      },
      getAudioDirectPlayProfile(platform),
    ],
    TranscodingProfiles: [
      {
        Type: MediaTypes.Video,
        Context: "Streaming",
        Protocol: "hls",
        Container: "ts",
        VideoCodec: "h264, hevc",
        AudioCodec: "aac,mp3,ac3,dts",
        MaxAudioChannels: maxAudioChannels,
      },
      {
        Type: MediaTypes.Audio,
        Context: "Streaming",
        Protocol: "http",
        Container: "mp3",
        AudioCodec: "mp3",
        MaxAudioChannels: "2",
      },
    ],
    SubtitleProfiles: getSubtitleProfiles(),
  };

  return profile;
};

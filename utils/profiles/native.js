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
 * @typedef {"vlc" | "ksplayer"} PlayerType
 * @typedef {"auto" | "stereo" | "5.1" | "passthrough"} AudioTranscodeModeType
 *
 * @typedef {Object} ProfileOptions
 * @property {PlatformType} [platform] - Target platform
 * @property {PlayerType} [player] - Video player being used
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
 * Gets the video audio codec configuration based on platform, player, and audio mode.
 *
 * Key insight: VLC handles AC3/EAC3/DTS downmixing fine.
 * Only TrueHD and DTS-HD MA (lossless 7.1) cause issues on mobile devices
 * because VLC's internal downmixing from 7.1 to stereo fails on some Android audio pipelines.
 *
 * @param {PlatformType} platform
 * @param {PlayerType} player
 * @param {AudioTranscodeModeType} audioMode
 * @returns {{ directPlayCodec: string, maxAudioChannels: string }}
 */
const getVideoAudioCodecs = (platform, player, audioMode) => {
  // Base codecs that work everywhere
  const baseCodecs = "aac,mp3,flac,opus,vorbis";

  // Surround codecs that VLC handles well (downmixes properly)
  const surroundCodecs = "ac3,eac3,dts";

  // Lossless HD codecs that cause issues with VLC's downmixing on mobile
  const losslessHdCodecs = "truehd";

  // Platform-specific codecs
  const platformCodecs = platform === "ios" ? "alac,wma" : "wma";

  // Handle explicit user settings first
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
      // Auto mode: platform and player-specific defaults
      break;
  }

  // Auto mode logic based on platform and player
  if (player === "ksplayer" && platform === "ios") {
    // KSPlayer on iOS handles all codecs well, including TrueHD
    return {
      directPlayCodec: `${baseCodecs},${surroundCodecs},${losslessHdCodecs},${platformCodecs}`,
      maxAudioChannels: "8",
    };
  }

  // VLC on Android or iOS - don't include TrueHD (causes 7.1 downmix issues)
  // DTS core is fine, VLC handles it well. Only lossless 7.1 formats are problematic.
  return {
    directPlayCodec: `${baseCodecs},${surroundCodecs},${platformCodecs}`,
    maxAudioChannels: "6",
  };
};

/**
 * Generates a device profile for Jellyfin playback.
 *
 * @param {ProfileOptions} [options] - Profile configuration options
 * @returns {Object} Jellyfin device profile
 */
export const generateDeviceProfile = (options = {}) => {
  const platform = options.platform || Platform.OS;
  const player = options.player || "vlc";
  const audioMode = options.audioMode || "auto";

  const { directPlayCodec, maxAudioChannels } = getVideoAudioCodecs(
    platform,
    player,
    audioMode,
  );

  const playerName = player === "ksplayer" ? "KSPlayer" : "VLC Player";

  /**
   * Device profile for Native video player
   */
  const profile = {
    Name: `1. ${playerName}`,
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

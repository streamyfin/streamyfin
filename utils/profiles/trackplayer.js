/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
import { Platform } from "react-native";
import MediaTypes from "../../constants/MediaTypes";

/**
 * @typedef {"ios" | "android"} PlatformType
 *
 * @typedef {Object} TrackPlayerProfileOptions
 * @property {PlatformType} [platform] - Target platform
 */

/**
 * Audio direct play profiles for react-native-track-player.
 * iOS uses AVPlayer, Android uses ExoPlayer - each has different codec support.
 *
 * @param {PlatformType} platform
 */
const getDirectPlayProfile = (platform) => {
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

/**
 * Audio codec profiles for react-native-track-player.
 *
 * @param {PlatformType} platform
 */
const getCodecProfile = (platform) => {
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
 * Generates a device profile for music playback via react-native-track-player.
 *
 * This profile is specifically for standalone audio playback using:
 * - AVPlayer on iOS
 * - ExoPlayer on Android
 *
 * @param {TrackPlayerProfileOptions} [options] - Profile configuration options
 * @returns {Object} Jellyfin device profile for track player
 */
export const generateTrackPlayerProfile = (options = {}) => {
  const platform = options.platform || Platform.OS;

  return {
    Name: "Track Player",
    MaxStaticBitrate: 320_000_000,
    MaxStreamingBitrate: 320_000_000,
    CodecProfiles: [getCodecProfile(platform)],
    DirectPlayProfiles: [getDirectPlayProfile(platform)],
    TranscodingProfiles: [
      {
        Type: MediaTypes.Audio,
        Context: "Streaming",
        Protocol: "http",
        Container: "mp3",
        AudioCodec: "mp3",
        MaxAudioChannels: "2",
      },
    ],
    SubtitleProfiles: [],
  };
};

// Default export for convenience
export default generateTrackPlayerProfile();

/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
import { Platform } from "react-native";
import MediaTypes from "../../constants/MediaTypes";
import { getSubtitleProfiles } from "./subtitles";

/**
 * Audio profiles for react-native-track-player based on platform capabilities.
 * iOS uses AVPlayer, Android uses ExoPlayer - each has different codec support.
 */
const getAudioDirectPlayProfile = () => {
  if (Platform.OS === "ios") {
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

const getAudioCodecProfile = () => {
  if (Platform.OS === "ios") {
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

export const generateDeviceProfile = () => {
  /**
   * Device profile for Native video player
   */
  const profile = {
    Name: `1. MPV Player`,
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
      getAudioCodecProfile(),
    ],
    DirectPlayProfiles: [
      {
        Type: MediaTypes.Video,
        Container: "mp4,mkv,avi,mov,flv,ts,m2ts,webm,ogv,3gp,hls",
        VideoCodec:
          "h264,hevc,mpeg4,divx,xvid,wmv,vc1,vp8,vp9,av1,avi,mpeg,mpeg2video",
        AudioCodec: "aac,ac3,eac3,mp3,flac,alac,opus,vorbis,wma,dts,truehd",
      },
      getAudioDirectPlayProfile(),
    ],
    TranscodingProfiles: [
      {
        Type: MediaTypes.Video,
        Context: "Streaming",
        Protocol: "hls",
        Container: "ts",
        VideoCodec: "h264, hevc",
        AudioCodec: "aac,mp3,ac3,dts",
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

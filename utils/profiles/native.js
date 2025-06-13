import { Platform } from "react-native";
import DeviceInfo from "react-native-device-info";
/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
import MediaTypes from "../../constants/MediaTypes";

export const generateDeviceProfile = async () => {
  /**
   * Device profile for Native video player
   */
  const profile = {
    Name: "1. Vlc Player",
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
      {
        Type: MediaTypes.Audio,
        Codec: "aac,ac3,eac3,mp3,flac,alac,opus,vorbis,pcm,wma",
      },
    ],
    DirectPlayProfiles: [
      {
        Type: MediaTypes.Video,
        Container: "mp4,mkv,avi,mov,flv,ts,m2ts,webm,ogv,3gp,hls",
        VideoCodec:
          "h264,hevc,mpeg4,divx,xvid,wmv,vc1,vp8,vp9,av1,avi,mpeg,mpeg2video",
        AudioCodec: "aac,ac3,eac3,mp3,flac,alac,opus,vorbis,wma,dts",
      },
      {
        Type: MediaTypes.Audio,
        Container: "mp3,aac,flac,alac,wav,ogg,wma",
        AudioCodec:
          "mp3,aac,flac,alac,opus,vorbis,wma,pcm,mpa,wav,ogg,oga,webma,ape",
      },
    ],
    TranscodingProfiles: [
      {
        Type: MediaTypes.Video,
        Context: "Streaming",
        Protocol: "hls",
        Container: "mp4",
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
    SubtitleProfiles: [
      // Official formats
      { Format: "vtt", Method: "Embed" },
      { Format: "vtt", Method: "External" },

      { Format: "webvtt", Method: "Embed" },
      { Format: "webvtt", Method: "External" },

      { Format: "srt", Method: "Embed" },
      { Format: "srt", Method: "External" },

      { Format: "subrip", Method: "Embed" },
      { Format: "subrip", Method: "External" },

      { Format: "ttml", Method: "Embed" },
      { Format: "ttml", Method: "External" },

      { Format: "dvbsub", Method: "Embed" },
      { Format: "dvdsub", Method: "Encode" },

      { Format: "ass", Method: "Embed" },
      { Format: "ass", Method: "External" },

      { Format: "idx", Method: "Embed" },
      { Format: "idx", Method: "Encode" },

      { Format: "pgs", Method: "Embed" },
      { Format: "pgs", Method: "Encode" },

      { Format: "pgssub", Method: "Embed" },
      { Format: "pgssub", Method: "Encode" },

      { Format: "ssa", Method: "Embed" },
      { Format: "ssa", Method: "External" },

      // Other formats
      { Format: "microdvd", Method: "Embed" },
      { Format: "microdvd", Method: "External" },

      { Format: "mov_text", Method: "Embed" },
      { Format: "mov_text", Method: "External" },

      { Format: "mpl2", Method: "Embed" },
      { Format: "mpl2", Method: "External" },

      { Format: "pjs", Method: "Embed" },
      { Format: "pjs", Method: "External" },

      { Format: "realtext", Method: "Embed" },
      { Format: "realtext", Method: "External" },

      { Format: "scc", Method: "Embed" },
      { Format: "scc", Method: "External" },

      { Format: "smi", Method: "Embed" },
      { Format: "smi", Method: "External" },

      { Format: "stl", Method: "Embed" },
      { Format: "stl", Method: "External" },

      { Format: "sub", Method: "Embed" },
      { Format: "sub", Method: "External" },

      { Format: "subviewer", Method: "Embed" },
      { Format: "subviewer", Method: "External" },

      { Format: "teletext", Method: "Embed" },
      { Format: "teletext", Method: "Encode" },

      { Format: "text", Method: "Embed" },
      { Format: "text", Method: "External" },

      { Format: "vplayer", Method: "Embed" },
      { Format: "vplayer", Method: "External" },

      { Format: "xsub", Method: "Embed" },
      { Format: "xsub", Method: "External" },
    ],
  };

  return profile;
};

export default async () => {
  return await generateDeviceProfile();
};

/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
import MediaTypes from "../../constants/MediaTypes";

/**
 * Device profile for Native video player
 */
export default {
  Name: "1. Native iOS Video Profile",
  MaxStaticBitrate: 100000000,
  MaxStreamingBitrate: 120000000,
  MusicStreamingTranscodingBitrate: 384000,
  CodecProfiles: [
    {
      Codec: "h264",
      Conditions: [
        {
          Condition: "NotEquals",
          IsRequired: false,
          Property: "IsAnamorphic",
          Value: "true",
        },
        {
          Condition: "EqualsAny",
          IsRequired: false,
          Property: "VideoProfile",
          Value: "high|main|baseline|constrained baseline",
        },
        {
          Condition: "LessThanEqual",
          IsRequired: false,
          Property: "VideoLevel",
          Value: "80",
        },
        {
          Condition: "NotEquals",
          IsRequired: false,
          Property: "IsInterlaced",
          Value: "true",
        },
      ],
      Type: MediaTypes.Video,
    },
    {
      Codec: "hevc",
      Conditions: [
        {
          Condition: "NotEquals",
          IsRequired: false,
          Property: "IsAnamorphic",
          Value: "true",
        },
        {
          Condition: "EqualsAny",
          IsRequired: false,
          Property: "VideoProfile",
          Value: "high|main|main 10",
        },
        {
          Condition: "LessThanEqual",
          IsRequired: false,
          Property: "VideoLevel",
          Value: "175",
        },
        {
          Condition: "NotEquals",
          IsRequired: false,
          Property: "IsInterlaced",
          Value: "true",
        },
      ],
      Type: MediaTypes.Video,
    },
  ],
  DirectPlayProfiles: [
    {
      AudioCodec: "flac,alac,aac,eac3,ac3,opus",
      Container: "mp4",
      Type: MediaTypes.Video,
      VideoCodec: "hevc,h264,mpeg4",
    },
    {
      AudioCodec: "flac,alac,aac,eac3,ac3,opus",
      Container: "mkv",
      Type: MediaTypes.Video,
      VideoCodec: "hevc,h264,mpeg4",
    },
    {
      AudioCodec: "alac,aac,ac3",
      Container: "m4v",
      Type: MediaTypes.Video,
      VideoCodec: "h264,mpeg4",
    },
    {
      AudioCodec:
        "alac,aac,eac3,ac3,mp3,pcm_s24be,pcm_s24le,pcm_s16be,pcm_s16le",
      Container: "mov",
      Type: MediaTypes.Video,
      VideoCodec: "hevc,h264,mpeg4,mjpeg",
    },
    {
      AttrudioCodec: "aac,eac3,ac3,mp3",
      Container: "mpegts",
      Type: MediaTypes.Video,
      VideoCodec: "h264",
    },
    {
      AttrudioCodec: "aac,amr_nb",
      Container: "3gp,3g2",
      Type: MediaTypes.Video,
      VideoCodec: "h264,mpeg4",
    },
    {
      AttrudioCodec: "pcm_s16le,pcm_mulaw",
      Container: "avi",
      Type: MediaTypes.Video,
      VideoCodec: "mjpeg",
    },
    {
      Container: "mp3",
      Type: MediaTypes.Audio,
    },
    {
      Container: "aac",
      Type: MediaTypes.Audio,
    },
    {
      AudioCodec: "aac",
      Container: "m4a",
      Type: MediaTypes.Audio,
    },
    {
      AudioCodec: "aac",
      Container: "m4b",
      Type: MediaTypes.Audio,
    },
    {
      Container: "flac",
      Type: MediaTypes.Audio,
    },
    {
      Container: "alac",
      Type: MediaTypes.Audio,
    },
    {
      AudioCodec: "alac",
      Container: "m4a",
      Type: MediaTypes.Audio,
    },
    {
      AudioCodec: "alac",
      Container: "m4b",
      Type: MediaTypes.Audio,
    },
    {
      Container: "wav",
      Type: MediaTypes.Audio,
    },
  ],
  TranscodingProfiles: [
    {
      AudioCodec: "flac,alac,aac,eac3,ac3,opus",
      BreakOnNonKeyFrames: true,
      Container: "mp4",
      Context: "streaming",
      MaxAudioChannels: "8",
      MinSegments: 2,
      Protocol: "hls",
      Type: "video",
      VideoCodec: "hevc,h264,mpeg4",
    },
    {
      AudioCodec: "aac",
      BreakOnNonKeyFrames: true,
      Container: "aac",
      Context: "Streaming",
      MaxAudioChannels: "6",
      MinSegments: "2",
      Protocol: "hls",
      Type: MediaTypes.Audio,
    },
    {
      AudioCodec: "aac",
      Container: "aac",
      Context: "Streaming",
      MaxAudioChannels: "6",
      Protocol: "http",
      Type: MediaTypes.Audio,
    },
    {
      AudioCodec: "mp3",
      Container: "mp3",
      Context: "Streaming",
      MaxAudioChannels: "6",
      Protocol: "http",
      Type: MediaTypes.Audio,
    },
    {
      AudioCodec: "wav",
      Container: "wav",
      Context: "Streaming",
      MaxAudioChannels: "6",
      Protocol: "http",
      Type: MediaTypes.Audio,
    },
    {
      AudioCodec: "mp3",
      Container: "mp3",
      Context: "Static",
      MaxAudioChannels: "6",
      Protocol: "http",
      Type: MediaTypes.Audio,
    },
    {
      AudioCodec: "aac",
      Container: "aac",
      Context: "Static",
      MaxAudioChannels: "6",
      Protocol: "http",
      Type: MediaTypes.Audio,
    },
    {
      AudioCodec: "wav",
      Container: "wav",
      Context: "Static",
      MaxAudioChannels: "6",
      Protocol: "http",
      Type: MediaTypes.Audio,
    },
    {
      AudioCodec: "aac,mp3",
      BreakOnNonKeyFrames: true,
      Container: "ts",
      Context: "Streaming",
      MaxAudioChannels: "6",
      MinSegments: "2",
      Protocol: "hls",
      Type: MediaTypes.Video,
      VideoCodec: "h264",
    },
    {
      AudioCodec: "aac,mp3,ac3,eac3,flac,alac",
      Container: "mp4",
      Context: "Static",
      Protocol: "http",
      Type: MediaTypes.Video,
      VideoCodec: "h264",
    },
  ],
  ResponseProfiles: [
    {
      Container: "m4v",
      MimeType: "video/mp4",
      Type: MediaTypes.Video,
    },
  ],
  SubtitleProfiles: [
    {
      Format: "srt",
      Method: "external",
    },
    {
      Format: "pgssub",
      Method: "embed",
    },
    {
      Format: "dvdsub",
      Method: "embed",
    },
    {
      Format: "dvbsub",
      Method: "embed",
    },
    {
      Format: "xsub",
      Method: "embed",
    },
    {
      Format: "vtt",
      Method: "embed",
    },
    {
      Format: "ttml",
      Method: "embed",
    },
    {
      Format: "cc_dec",
      Method: "embed",
    },
  ],
};

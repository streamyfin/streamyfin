/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
import MediaTypes from "../../constants/MediaTypes";
import { getSubtitleProfiles } from "./subtitles";

export const generateDeviceProfile = ({ transcode = false } = {}) => {
  /**
   * Device profile for Native video player
   */
  const profile = {
    Name: `1. Vlc Player${transcode ? " (Transcoding)" : ""}`,
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
    SubtitleProfiles: getSubtitleProfiles(transcode ? "hls" : "External"),
  };

  return profile;
};

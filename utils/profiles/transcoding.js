/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
import MediaTypes from "../../constants/MediaTypes";


export default {
  Name: "Vlc Player for HLS streams.",
  MaxStaticBitrate: 20_000_000,
  MaxStreamingBitrate: 12_000_000,
  CodecProfiles: [
    {
      Type: MediaTypes.Video,
      Codec: "h264,h265,hevc,mpeg4,divx,xvid,wmv,vc1,vp8,vp9,av1",
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
      AudioCodec: "aac,ac3,eac3,mp3,flac,alac,opus,vorbis,wma",
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
      AudioCodec: "aac,mp3,ac3",
      CopyTimestamps: false,
      EnableSubtitlesInManifest: true,
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
    // Text based subtitles must use HLS.
    { Format: "ass", Method: "Hls" },
    { Format: "microdvd", Method: "Hls" },
    { Format: "mov_text", Method: "Hls" },
    { Format: "mpl2", Method: "Hls" },
    { Format: "pjs", Method: "Hls" },
    { Format: "realtext", Method: "Hls" },
    { Format: "scc", Method: "Hls" },
    { Format: "smi", Method: "Hls" },
    { Format: "srt", Method: "Hls" },
    { Format: "ssa", Method: "Hls" },
    { Format: "stl", Method: "Hls" },
    { Format: "sub", Method: "Hls" },
    { Format: "subrip", Method: "Hls" },
    { Format: "subviewer", Method: "Hls" },
    { Format: "teletext", Method: "Hls" },
    { Format: "text", Method: "Hls" },
    { Format: "ttml", Method: "Hls" },
    { Format: "vplayer", Method: "Hls" },
    { Format: "vtt", Method: "Hls" },
    { Format: "webvtt", Method: "Hls" },


    // Image based subs use encode.
    { Format: "dvdsub", Method: "Encode" },
    { Format: "pgs", Method: "Encode" },
    { Format: "pgssub", Method: "Encode" },
    { Format: "xsub", Method: "Encode" },
  ],
};
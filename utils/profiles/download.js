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
  Name: "1. Vlc Player",
  MaxStaticBitrate: 20_000_000,
  MaxStreamingBitrate: 20_000_000,
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
  // DirectPlayProfiles: [
  //   {
  //     Type: MediaTypes.Video,
  //     Container: "mp4,mkv,avi,mov,flv,ts,m2ts,webm,ogv,3gp,hls",
  //     VideoCodec:
  //       "h264,hevc,mpeg4,divx,xvid,wmv,vc1,vp8,vp9,av1,avi,mpeg,mpeg2video",
  //     AudioCodec: "aac,ac3,eac3,mp3,flac,alac,opus,vorbis,wma",
  //   },
  //   {
  //     Type: MediaTypes.Audio,
  //     Container: "mp3,aac,flac,alac,wav,ogg,wma",
  //     AudioCodec:
  //       "mp3,aac,flac,alac,opus,vorbis,wma,pcm,mpa,wav,ogg,oga,webma,ape",
  //   },
  // ],
  TranscodingProfiles: [
    {
      Type: MediaTypes.Video,
      Context: "Streaming",
      Protocol: "hls",
      Container: "ts,mp4,mkv,avi,mov,flv,m2ts,webm,ogv,3gp",
      VideoCodec:
        "h264,hevc,mpeg4,divx,xvid,wmv,vc1,vp8,vp9,av1,avi,mpeg,mpeg2video",
      AudioCodec: "aac,mp3,ac3",
      CopyTimestamps: false,
      EnableSubtitlesInManifest: true,
    },
    {
      Type: MediaTypes.Audio,
      Context: "Streaming",
      Protocol: "http",
      Container: "mp3,aac,flac,alac,wav,ogg,wma",
      AudioCodec:
        "mp3,aac,flac,alac,opus,vorbis,wma,pcm,mpa,wav,ogg,oga,webma,ape",
      MaxAudioChannels: "2",
    },
  ],
  SubtitleProfiles: [
    // Official foramts
    { Format: "vtt", Method: "Embed" },
    { Format: "vtt", Method: "Encode" },

    { Format: "webvtt", Method: "Embed" },
    { Format: "webvtt", Method: "Encode" },

    { Format: "srt", Method: "Embed" },
    { Format: "srt", Method: "Encode" },

    { Format: "subrip", Method: "Embed" },
    { Format: "subrip", Method: "Encode" },

    { Format: "ttml", Method: "Embed" },
    { Format: "ttml", Method: "Encode" },

    { Format: "dvbsub", Method: "Embed" },
    { Format: "dvdsub", Method: "Encode" },

    { Format: "ass", Method: "Embed" },
    { Format: "ass", Method: "Encode" },

    { Format: "idx", Method: "Embed" },
    { Format: "idx", Method: "Encode" },

    { Format: "pgs", Method: "Embed" },
    { Format: "pgs", Method: "Encode" },

    { Format: "pgssub", Method: "Embed" },
    { Format: "pgssub", Method: "Encode" },

    { Format: "ssa", Method: "Embed" },
    { Format: "ssa", Method: "Encode" },

    // Other formats
    { Format: "microdvd", Method: "Embed" },
    { Format: "microdvd", Method: "Encode" },

    { Format: "mov_text", Method: "Embed" },
    { Format: "mov_text", Method: "Encode" },

    { Format: "mpl2", Method: "Embed" },
    { Format: "mpl2", Method: "Encode" },

    { Format: "pjs", Method: "Embed" },
    { Format: "pjs", Method: "Encode" },

    { Format: "realtext", Method: "Embed" },
    { Format: "realtext", Method: "Encode" },

    { Format: "scc", Method: "Embed" },
    { Format: "scc", Method: "Encode" },

    { Format: "smi", Method: "Embed" },
    { Format: "smi", Method: "Encode" },

    { Format: "stl", Method: "Embed" },
    { Format: "stl", Method: "Encode" },

    { Format: "sub", Method: "Embed" },
    { Format: "sub", Method: "Encode" },

    { Format: "subviewer", Method: "Embed" },
    { Format: "subviewer", Method: "Encode" },

    { Format: "teletext", Method: "Embed" },
    { Format: "teletext", Method: "Encode" },

    { Format: "text", Method: "Embed" },
    { Format: "text", Method: "Encode" },

    { Format: "vplayer", Method: "Embed" },
    { Format: "vplayer", Method: "Encode" },

    { Format: "xsub", Method: "Embed" },
    { Format: "xsub", Method: "Encode" },
  ],
};

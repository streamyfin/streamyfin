import {
  DeviceProfile
} from "@jellyfin/sdk/lib/generated-client/models";

export const chromecastProfile: DeviceProfile = {
  Name: "Chromecast Video Profile",
  Id: "chromecast-001",
  MaxStreamingBitrate: 4000000, // 4 Mbps
  MaxStaticBitrate: 4000000, // 4 Mbps
  MusicStreamingTranscodingBitrate: 384000, // 384 kbps
  DirectPlayProfiles: [
    {
      Container: "mp4,webm",
      Type: "Video",
      VideoCodec: "h264,vp8,vp9",
      AudioCodec: "aac,mp3,opus,vorbis",
    },
    {
      Container: "mp3",
      Type: "Audio",
    },
    {
      Container: "aac",
      Type: "Audio",
    },
    {
      Container: "flac",
      Type: "Audio",
    },
    {
      Container: "wav",
      Type: "Audio",
    },
  ],
  TranscodingProfiles: [
    {
      Container: "ts",
      Type: "Video",
      VideoCodec: "h264",
      AudioCodec: "aac,mp3",
      Protocol: "hls",
      Context: "Streaming",
      MaxAudioChannels: "2",
      MinSegments: 2,
      BreakOnNonKeyFrames: true,
    },
    {
      Container: "mp4",
      Type: "Video",
      VideoCodec: "h264",
      AudioCodec: "aac",
      Protocol: "http",
      Context: "Streaming",
      MaxAudioChannels: "2",
    },
    {
      Container: "mp3",
      Type: "Audio",
      AudioCodec: "mp3",
      Protocol: "http",
      Context: "Streaming",
      MaxAudioChannels: "2",
    },
    {
      Container: "aac",
      Type: "Audio",
      AudioCodec: "aac",
      Protocol: "http",
      Context: "Streaming",
      MaxAudioChannels: "2",
    },
  ],
  ContainerProfiles: [
    {
      Type: "Video",
      Container: "mp4",
    },
    {
      Type: "Video",
      Container: "webm",
    },
  ],
  CodecProfiles: [
    {
      Type: "Video",
      Codec: "h264",
      Conditions: [
        {
          Condition: "LessThanEqual",
          Property: "VideoBitDepth",
          Value: "8",
        },
        {
          Condition: "LessThanEqual",
          Property: "VideoLevel",
          Value: "41",
        },
      ],
    },
    {
      Type: "Video",
      Codec: "vp9",
      Conditions: [
        {
          Condition: "LessThanEqual",
          Property: "VideoBitDepth",
          Value: "10",
        },
      ],
    },
  ],
  SubtitleProfiles: [
    {
      Format: "vtt",
      Method: "Hls",
    },
    {
      Format: "vtt",
      Method: "External",
    },
  ],
};

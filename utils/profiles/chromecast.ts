import { DeviceProfile } from "@jellyfin/sdk/lib/generated-client/models";

export const chromecast: DeviceProfile = {
  Name: "Chromecast Video Profile",
  MaxStreamingBitrate: 8000000, // 8 Mbps
  MaxStaticBitrate: 8000000, // 8 Mbps
  MusicStreamingTranscodingBitrate: 384000, // 384 kbps
  DirectPlayProfiles: [
    {
      Container: "mp4",
      Type: "Video",
      VideoCodec: "h264",
      AudioCodec: "aac,mp3",
    },
    {
      Container: "mp3",
      Type: "Audio",
    },
    {
      Container: "aac",
      Type: "Audio",
    },
  ],
  TranscodingProfiles: [
    {
      Container: "ts",
      Type: "Video",
      AudioCodec: "aac,mp3",
      VideoCodec: "h264",
      Context: "Streaming",
      Protocol: "hls",
      MaxAudioChannels: "2",
      MinSegments: 2,
      BreakOnNonKeyFrames: true,
    },
    {
      Container: "mp4",
      Type: "Video",
      VideoCodec: "h264",
      AudioCodec: "aac,mp3",
      Protocol: "http",
      Context: "Streaming",
      MaxAudioChannels: "2",
      MinSegments: 2,
      BreakOnNonKeyFrames: true,
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
  ContainerProfiles: [],
  CodecProfiles: [
    {
      Type: "Video",
      Codec: "h264",
    },
    {
      Type: "Audio",
      Codec: "aac,mp3",
    },
  ],
  SubtitleProfiles: [
    {
      Format: "vtt",
      Method: "Encode",
    },
    {
      Format: "vtt",
      Method: "Encode",
    },
  ],
};

import type { DeviceProfile } from "@jellyfin/sdk/lib/generated-client/models";

export const chromecasth265: DeviceProfile = {
  Name: "Chromecast Video Profile",
  MaxStreamingBitrate: 16000000, // 16Mbps
  MaxStaticBitrate: 16000000, // 16 Mbps
  MusicStreamingTranscodingBitrate: 384000, // 384 kbps
  CodecProfiles: [
    {
      Type: "Video",
      Codec: "hevc,h264",
    },
    {
      Type: "Audio",
      Codec: "aac,mp3,flac,opus,vorbis",
    },
  ],
  ContainerProfiles: [],
  DirectPlayProfiles: [
    {
      Container: "mp4,mkv",
      Type: "Video",
      VideoCodec: "hevc,h264",
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
      VideoCodec: "hevc,h264",
      AudioCodec: "aac,mp3",
      Protocol: "hls",
      Context: "Streaming",
      MaxAudioChannels: "2",
      MinSegments: 2,
      BreakOnNonKeyFrames: true,
    },
    {
      Container: "mp4,mkv",
      Type: "Video",
      VideoCodec: "hevc,h264",
      AudioCodec: "aac",
      Protocol: "http",
      Context: "Streaming",
      MaxAudioChannels: "2",
      MinSegments: 2,
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

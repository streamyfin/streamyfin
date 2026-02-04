import type { DeviceProfile } from "@jellyfin/sdk/lib/generated-client/models";

export const chromecast: DeviceProfile = {
  Name: "Chromecast Video Profile",
  MaxStreamingBitrate: 16000000, // 16 Mbps
  MaxStaticBitrate: 16000000, // 16 Mbps
  MusicStreamingTranscodingBitrate: 384000, // 384 kbps
  CodecProfiles: [
    {
      Type: "Video",
      Codec: "h264",
    },
    {
      Type: "Audio",
      Codec: "aac,mp3,flac,opus,vorbis",
      // Force transcode if audio has more than 2 channels (5.1, 7.1, etc)
      Conditions: [
        {
          Condition: "LessThanEqual",
          Property: "AudioChannels",
          Value: "2",
        },
      ],
    },
  ],
  ContainerProfiles: [],
  DirectPlayProfiles: [
    {
      Container: "mp4",
      Type: "Video",
      VideoCodec: "h264",
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

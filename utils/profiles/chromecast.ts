import { DeviceProfile } from "@jellyfin/sdk/lib/generated-client/models";

export const chromecastProfile: DeviceProfile = {
  Name: "Chromecast Video Profile",
  MaxStreamingBitrate: 8000000, // 8 Mbps
  MaxStaticBitrate: 8000000, // 8 Mbps
  MusicStreamingTranscodingBitrate: 384000, // 384 kbps
  CodecProfiles: [
    {
      Type: "Video",
      Codec: "h264",
    },
    {
      Type: "Audio",
      Codec: "aac,mp3,flac,opus,vorbis",
    },
  ],
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
      Type: "Video",
      Context: "Streaming",
      Protocol: "hls",
      Container: "ts",
      VideoCodec: "h264, hevc",
      AudioCodec: "aac,mp3,ac3",
      CopyTimestamps: false,
      EnableSubtitlesInManifest: true,
    },
    {
      Type: "Audio",
      Context: "Streaming",
      Protocol: "http",
      Container: "mp3",
      AudioCodec: "mp3",
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

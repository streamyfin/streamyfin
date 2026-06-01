import type {
  DeviceProfile,
  ProfileCondition,
} from "@jellyfin/sdk/lib/generated-client/models";
import type { ChromecastCapabilities } from "./capabilities";

/**
 * Build a Jellyfin `DeviceProfile` for a Chromecast from its detected capabilities.
 * Replaces the former static `chromecast.ts` / `chromecasth265.ts` profiles.
 */
export const buildChromecastProfile = (
  caps: ChromecastCapabilities,
): DeviceProfile => {
  const videoCodecs = caps.hevc ? "hevc,h264" : "h264";
  const maxHeight = caps.maxResolution === 2160 ? "2160" : "1080";
  const maxChannels = String(caps.maxAudioChannels);

  const videoConditions: ProfileCondition[] = [
    {
      Condition: "LessThanEqual",
      Property: "Height",
      Value: maxHeight,
      IsRequired: false,
    },
  ];
  // When HEVC is allowed but 10-bit is not, force the server to transcode
  // 10-bit sources down to 8-bit.
  if (caps.hevc && !caps.hevc10bit) {
    videoConditions.push({
      Condition: "LessThanEqual",
      Property: "VideoBitDepth",
      Value: "8",
      IsRequired: false,
    });
  }

  return {
    Name: "Chromecast Video Profile",
    MaxStreamingBitrate: caps.maxVideoBitrate,
    MaxStaticBitrate: caps.maxVideoBitrate,
    MusicStreamingTranscodingBitrate: 384000,
    CodecProfiles: [
      {
        Type: "Video",
        Codec: videoCodecs,
        Conditions: videoConditions,
      },
      {
        Type: "Audio",
        Codec: "aac,mp3,flac,opus,vorbis",
        // Force transcode of multichannel audio the receiver cannot output.
        Conditions: [
          {
            Condition: "LessThanEqual",
            Property: "AudioChannels",
            Value: maxChannels,
            IsRequired: false,
          },
        ],
      },
    ],
    ContainerProfiles: [],
    DirectPlayProfiles: [
      {
        Container: caps.hevc ? "mp4,mkv" : "mp4",
        Type: "Video",
        VideoCodec: videoCodecs,
        AudioCodec: "aac,mp3,opus,vorbis",
      },
      { Container: "mp3", Type: "Audio" },
      { Container: "aac", Type: "Audio" },
      { Container: "flac", Type: "Audio" },
      { Container: "wav", Type: "Audio" },
    ],
    TranscodingProfiles: [
      {
        Container: "ts",
        Type: "Video",
        VideoCodec: videoCodecs,
        AudioCodec: "aac,mp3",
        Protocol: "hls",
        Context: "Streaming",
        MaxAudioChannels: maxChannels,
        MinSegments: 2,
        BreakOnNonKeyFrames: true,
      },
      {
        Container: "mp3",
        Type: "Audio",
        AudioCodec: "mp3",
        Protocol: "http",
        Context: "Streaming",
        MaxAudioChannels: maxChannels,
      },
      {
        Container: "aac",
        Type: "Audio",
        AudioCodec: "aac",
        Protocol: "http",
        Context: "Streaming",
        MaxAudioChannels: maxChannels,
      },
    ],
    SubtitleProfiles: [{ Format: "vtt", Method: "Encode" }],
  };
};

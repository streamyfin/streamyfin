/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
import type { DeviceProfile } from "@jellyfin/sdk/lib/generated-client/models";
import { Platform } from "react-native";
import MediaTypes from "../../constants/MediaTypes";
import { supportsAv1HardwareDecode } from "./codecSupport";
import { getSubtitleProfiles } from "./subtitles";

export type PlatformType = "ios" | "android";
export type PlayerType = "mpv" | "exoplayer";
export type AudioTranscodeModeType = "auto" | "stereo" | "5.1" | "passthrough";

export interface ProfileOptions {
  /** Target platform */
  platform?: PlatformType;
  /** Video player being used */
  player?: PlayerType;
  /** Audio transcoding mode */
  audioMode?: AudioTranscodeModeType;
  /**
   * Whether the device can decode AV1 in hardware. Defaults to probing the
   * device (see `./codecSupport`); pass explicitly only for tests.
   */
  supportsAv1?: boolean;
}

/**
 * Audio direct play profiles for standalone audio items in MPV player.
 * These define which audio file formats can be played directly without transcoding.
 */
const getAudioDirectPlayProfile = (platform: PlatformType) => {
  if (platform === "ios") {
    // iOS audio formats supported by MPV
    return {
      Type: MediaTypes.Audio,
      Container: "mp3,m4a,aac,flac,alac,wav,aiff,caf",
      AudioCodec: "mp3,aac,alac,flac,opus,pcm",
    };
  }

  // Android audio formats supported by MPV
  return {
    Type: MediaTypes.Audio,
    Container: "mp3,m4a,aac,ogg,flac,wav,webm,mka",
    AudioCodec: "mp3,aac,flac,vorbis,opus,pcm",
  };
};

/**
 * Audio codec profiles for standalone audio items in MPV player.
 * These define codec constraints for audio file playback.
 */
const getAudioCodecProfile = (platform: PlatformType) => {
  if (platform === "ios") {
    // iOS audio codec constraints for MPV
    return {
      Type: MediaTypes.Audio,
      Codec: "aac,ac3,eac3,mp3,flac,alac,opus,pcm",
    };
  }

  // Android audio codec constraints for MPV
  return {
    Type: MediaTypes.Audio,
    Codec: "aac,ac3,eac3,mp3,flac,vorbis,opus,pcm",
  };
};

/**
 * Resolves the MaxAudioChannels string for a given audio transcoding mode.
 * Used by both the MPV and ExoPlayer profile branches — the channel-cap
 * rule is player-agnostic (the player decodes; the cap just tells the
 * server when to transcode down).
 */
const maxChannelsForMode = (audioMode: AudioTranscodeModeType): string => {
  switch (audioMode) {
    case "stereo":
      return "2";
    case "5.1":
      return "6";
    case "passthrough":
      return "8";
    default:
      // Auto: default to 5.1 (6 channels)
      return "6";
  }
};

/**
 * Gets the video audio codec configuration based on platform and audio mode.
 *
 * MPV (via FFmpeg) can decode all audio codecs including TrueHD and DTS-HD MA.
 * The audioMode setting only controls the maximum channel count - MPV will
 * decode and downmix as needed.
 */
const getVideoAudioCodecs = (
  platform: PlatformType,
  audioMode: AudioTranscodeModeType,
): { directPlayCodec: string; maxAudioChannels: string } => {
  // Base codecs
  const baseCodecs = "aac,mp3,flac,opus,vorbis";

  // Surround codecs
  const surroundCodecs = "ac3,eac3,dts";

  // Lossless HD codecs - MPV decodes these and downmixes as needed
  const losslessHdCodecs = "truehd";

  // Platform-specific codecs
  const platformCodecs = platform === "ios" ? "alac,wma" : "wma";

  // MPV can decode all codecs - only channel count varies by mode
  const allCodecs = `${baseCodecs},${surroundCodecs},${losslessHdCodecs},${platformCodecs}`;

  return {
    directPlayCodec: allCodecs,
    maxAudioChannels: maxChannelsForMode(audioMode),
  };
};

/**
 * ExoPlayer (Media3 1.10.1) direct-play profile for Android TV.
 *
 * Codec set aligned with Media3's documented supported-formats list:
 *   - Video: H.263, H.264, H.265, VP8, VP9, AV1
 *   - Audio: Vorbis, Opus, FLAC, ALAC, PCM, MP3, AAC, AC-3, E-AC-3, DTS,
 *     DTS-HD, TrueHD
 *
 * Hardware decode (MediaCodec) handles whatever the device ships with;
 * the rest fall through to FFmpeg software decode via the Jellyfin-published
 * `org.jellyfin.media3:media3-ffmpeg-decoder` extension wired up with
 * `DefaultRenderersFactory.EXTENSION_RENDERER_MODE_PREFER` (see
 * ExoPlayerView.kt:ensurePlayer).
 *
 * Cross-checked against the reference-device probe in
 * docs/research/hdr-dv-atmos-tv-plan.md (Amlogic Android 14 TV; HDMI sink
 * accepts AC3/EAC3 as bitstream and multichannel PCM up to 7.1 @ 192 kHz,
 * so software-decoded DTS/DTS-HD/TrueHD reach the sink as PCM).
 *
 * Dolby Vision: the CodecProfile below uses `NotEquals VideoRangeType
 * DOVI`, which in Jellyfin's semantics blocks ONLY pure Profile 5
 * (IPTPQc2 — the stream that renders purple/green without a DV-aware
 * decoder). DV Profiles 7/8 with HDR10 or SDR base layers (Jellyfin
 * reports these as `DOVIWithHDR10`, `DOVIWithHDR10Plus`, `DOVIWithEL`)
 * are NOT blocked — Media3 1.9.1+ correctly falls back to the AVC/HEVC
 * base layer.
 *
 * Containers limited to Media3's bundled extractors. FLV is intentionally
 * absent — Media3 has no FLV extractor (MPV claims it via FFmpeg).
 */
const getExoPlayerDirectPlayProfile = () => {
  const audioCodecs =
    "vorbis,opus,flac,alac,pcm,mp3,aac,ac3,eac3,dts,dtshd,truehd";

  return {
    video: {
      Type: MediaTypes.Video,
      Container: "mp4,mkv,webm,ts,mpegts,mov",
      VideoCodec: "h263,h264,hevc,vp8,vp9,av1",
      AudioCodec: audioCodecs,
    },
    audio: {
      Type: MediaTypes.Audio,
      Container: "mp3,m4a,aac,ogg,flac,wav,webm,mka",
      AudioCodec: "vorbis,opus,flac,alac,pcm,mp3,aac",
    },
  };
};

/**
 * Video codecs the MPV player can direct play, minus anything this device has
 * no viable decode path for.
 *
 * AV1 is conditional: without a hardware decoder mpv falls back to dav1d
 * software decode, and on tvOS the resulting 10-bit planar frames stall
 * `vo_avfoundation` before they reach the display layer — the player hangs
 * rather than erroring. Dropping `av1` from the profile makes Jellyfin transcode
 * to H.264/HEVC for those devices instead of handing over a stream they cannot
 * show. Devices that do have the decoder (recent iPhones) are unaffected.
 */
const getMpvVideoCodecs = (supportsAv1: boolean) => {
  const codecProfileCodecs = [
    "h264",
    "mpeg4",
    "divx",
    "xvid",
    "wmv",
    "vc1",
    "vp8",
    "vp9",
  ];
  const directPlayCodecs = [
    "h264",
    "hevc",
    "mpeg4",
    "divx",
    "xvid",
    "wmv",
    "vc1",
    "vp8",
    "vp9",
  ];

  if (supportsAv1) {
    codecProfileCodecs.push("av1");
    directPlayCodecs.push("av1");
  }

  // Container-ish entries Jellyfin also matches on, kept at the tail as before
  directPlayCodecs.push("avi", "mpeg", "mpeg2video");

  return {
    codecProfile: codecProfileCodecs.join(","),
    directPlay: directPlayCodecs.join(","),
  };
};

/**
 * Generates a device profile for Jellyfin playback.
 */
export const generateDeviceProfile = (options: ProfileOptions = {}) => {
  const platform = (options.platform || Platform.OS) as PlatformType;
  const audioMode = options.audioMode || "auto";
  const player = options.player || "mpv";
  const supportsAv1 = options.supportsAv1 ?? supportsAv1HardwareDecode();

  // ExoPlayer branch — Media3 capabilities on Android TV.
  if (player === "exoplayer" && platform === "android") {
    const exoDirect = getExoPlayerDirectPlayProfile();

    return {
      Name: "1. ExoPlayer",
      MaxStaticBitrate: 999_999_999,
      MaxStreamingBitrate: 999_999_999,
      CodecProfiles: [
        {
          Type: MediaTypes.Video,
          Codec: "h263,h264,vp8,vp9,av1",
        },
        {
          Type: MediaTypes.Video,
          Codec: "hevc,h265",
          Conditions: [
            {
              Condition: "NotEquals",
              Property: "VideoRangeType",
              // Blocks ONLY pure DV Profile 5 (IPTPQc2). Profiles 7/8 with
              // HDR10/SDR base layers fall through to Media3's HEVC fallback
              // (1.9.1+). See getExoPlayerDirectPlayProfile doc above.
              Value: "DOVI",
              IsRequired: true,
            },
          ],
        },
        {
          Type: MediaTypes.Audio,
          Codec: "vorbis,opus,flac,alac,pcm,mp3,aac,ac3,eac3,dts,dtshd,truehd",
        },
      ],
      DirectPlayProfiles: [exoDirect.video, exoDirect.audio],
      TranscodingProfiles: [
        {
          Type: MediaTypes.Video,
          Context: "Streaming",
          Protocol: "hls",
          Container: "ts",
          VideoCodec: "h264,hevc",
          AudioCodec: "aac,mp3,ac3",
          MaxAudioChannels: maxChannelsForMode(audioMode),
        },
        // Audio fallback for standalone audio items that can't direct play.
        // Mirrors the MPV profile. MP3 over HTTP is well within Media3's
        // bundled-extractor support; without a Type: Audio transcode target
        // the server has nothing to fall back to for audio outside the
        // DirectPlay audio list.
        {
          Type: MediaTypes.Audio,
          Context: "Streaming",
          Protocol: "http",
          Container: "mp3",
          AudioCodec: "mp3",
          MaxAudioChannels: "2",
        },
      ],
      // Text-only subtitles for direct play. PGS delivered as Encode
      // (burn-in) because Media3's PGS support is inconsistent.
      SubtitleProfiles: getSubtitleProfiles({ target: "exoplayer" }),
    } satisfies DeviceProfile;
  }

  const { directPlayCodec, maxAudioChannels } = getVideoAudioCodecs(
    platform,
    audioMode,
  );
  const videoCodecs = getMpvVideoCodecs(supportsAv1);

  /**
   * Device profile for MPV player
   */
  const profile = {
    Name: "1. MPV",
    MaxStaticBitrate: 999_999_999,
    MaxStreamingBitrate: 999_999_999,
    CodecProfiles: [
      {
        Type: MediaTypes.Video,
        Codec: videoCodecs.codecProfile,
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
      getAudioCodecProfile(platform),
    ],
    DirectPlayProfiles: [
      {
        Type: MediaTypes.Video,
        Container: "mp4,mkv,avi,mov,flv,ts,m2ts,webm,ogv,3gp,hls",
        VideoCodec: videoCodecs.directPlay,
        AudioCodec: directPlayCodec,
      },
      getAudioDirectPlayProfile(platform),
    ],
    TranscodingProfiles: [
      {
        Type: MediaTypes.Video,
        Context: "Streaming",
        Protocol: "hls",
        Container: "ts",
        VideoCodec: "h264,hevc",
        AudioCodec: "aac,mp3,ac3,dts",
        MaxAudioChannels: maxAudioChannels,
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
    SubtitleProfiles: getSubtitleProfiles({ target: "mpv" }),
  } satisfies DeviceProfile;

  return profile;
};

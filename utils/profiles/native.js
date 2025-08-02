import { Platform } from "react-native";
import DeviceInfo from "react-native-device-info";
/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */
import MediaTypes from "../../constants/MediaTypes";
import { getSubtitleProfiles } from "./subtitles";

// Helper function to detect Dolby Vision support
const supportsDolbyVision = async () => {
  if (Platform.OS === "ios") {
    const deviceModel = await DeviceInfo.getModel();
    // iPhone 12 and newer generally support Dolby Vision
    const modelNumber = Number.parseInt(deviceModel.replace(/iPhone/, ""), 10);
    return !Number.isNaN(modelNumber) && modelNumber >= 12;
  }

  if (Platform.OS === "android") {
    const apiLevel = await DeviceInfo.getApiLevel();
    const isHighEndDevice =
      (await DeviceInfo.getTotalMemory()) > 4 * 1024 * 1024 * 1024; // >4GB RAM
    // Very rough approximation - Android 10+ on higher-end devices may support it
    return apiLevel >= 29 && isHighEndDevice;
  }

  return false;
};

export const generateDeviceProfile = async ({ transcode = false } = {}) => {
  console.log("generating device profile", { transcode });
  const dolbyVisionSupported = await supportsDolbyVision();
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
          // We'll add Dolby Vision condition below if not supported
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
        Container: "mkv,avi,mov,flv,ts,m2ts,webm,ogv,3gp,hls",
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
        Container: transcode ? "fmp4" : "ts",
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

  // Add Dolby Vision restriction if not supported
  if (!dolbyVisionSupported) {
    const hevcProfile = profile.CodecProfiles.find(
      (p) => p.Type === MediaTypes.Video && p.Codec.includes("hevc"),
    );

    if (hevcProfile) {
      hevcProfile.Conditions.push({
        Condition: "NotEquals",
        Property: "VideoRangeType",
        Value: "DOVI", //no dolby vision at all
        IsRequired: true,
      });
    }
  }

  return profile;
};

export default async () => {
  return await generateDeviceProfile({ transcode: false });
};

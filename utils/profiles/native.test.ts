import { describe, expect, mock, test } from "bun:test";
import { stubReactNative } from "@/test-utils/reactNative";

stubReactNative();
mock.module("expo", () => ({
  // codecSupport probes the native MPV module; under bun:test there is none.
  requireOptionalNativeModule: () => null,
}));

const { generateDeviceProfile } = await import("./native");

describe("generateDeviceProfile", () => {
  test("video transcoding profile offers hevc alongside h264", () => {
    const profile = generateDeviceProfile({
      audioMode: "auto",
      supportsAv1: false,
    });

    const video = profile.TranscodingProfiles?.find((p) => p.Type === "Video");

    // The codec list must be comma-separated WITHOUT spaces: the server
    // splits on "," without trimming, so " hevc" never matches "hevc" and
    // HEVC would be silently dropped from transcode negotiation.
    expect(video).toEqual({
      Type: "Video",
      Context: "Streaming",
      Protocol: "hls",
      Container: "ts",
      VideoCodec: "h264,hevc",
      AudioCodec: "aac,mp3,ac3,dts",
      MaxAudioChannels: "6",
    });
  });
  test.each(["ios", "android"] as const)(
    "%s MPV offers AV1 with MP4 segments when supported",
    (platform) => {
      const video = generateDeviceProfile({
        platform,
        supportsAv1: true,
      }).TranscodingProfiles.find((p) => p.Type === "Video");
      expect(video?.VideoCodec).toBe("av1,h264,hevc");
      expect(video?.Container).toBe("mp4");
    },
  );
});

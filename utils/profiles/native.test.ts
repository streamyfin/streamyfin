import { stubReactNative } from "@/test-utils/reactNative";

stubReactNative();
jest.mock("expo", () => ({
  // codecSupport probes the native MPV module, which no test environment has.
  requireOptionalNativeModule: () => null,
}));

import { generateDeviceProfile } from "./native";

describe("generateDeviceProfile", () => {
  test("video transcoding profile offers hevc alongside h264", () => {
    const profile = generateDeviceProfile({
      audioMode: "auto",
      supportsAv1Transcode: false,
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
        supportsAv1Transcode: true,
      }).TranscodingProfiles.find((p) => p.Type === "Video");
      expect(video?.VideoCodec).toBe("av1,h264,hevc");
      expect(video?.Container).toBe("mp4");
    },
  );
  test("android MPV keeps AV1 direct play but not AV1 transcodes without a hardware decoder", () => {
    const profile = generateDeviceProfile({
      platform: "android",
      supportsAv1: true,
      supportsAv1Transcode: false,
    });
    const direct = profile.DirectPlayProfiles.find((p) => p.Type === "Video");
    const video = profile.TranscodingProfiles.find((p) => p.Type === "Video");
    expect(direct?.VideoCodec?.split(",")).toContain("av1");
    expect(video?.VideoCodec).toBe("h264,hevc");
    expect(video?.Container).toBe("ts");
  });
});

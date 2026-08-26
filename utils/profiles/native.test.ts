import { stubReactNative } from "@/test-utils/reactNative";

stubReactNative();
jest.mock("expo", () => ({
  // codecSupport probes the native MPV module, which no test environment has.
  requireOptionalNativeModule: () => null,
}));

import { generateDeviceProfile } from "./native";

describe("generateDeviceProfile", () => {
  test("video transcoding profile offers hevc alongside h264", () => {
    const profile = generateDeviceProfile({ audioMode: "auto" });

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
});

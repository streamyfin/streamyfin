import { describe, expect, mock, test } from "bun:test";

mock.module("react-native", () => ({
  Platform: {
    OS: "ios",
    isTV: false,
    select: (spec: Record<string, unknown>) => spec.ios ?? spec.default,
  },
}));
mock.module("expo", () => ({
  // codecSupport probes the native MPV module; under bun:test there is none.
  requireOptionalNativeModule: () => null,
}));

const { generateDeviceProfile } = await import("./native");

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

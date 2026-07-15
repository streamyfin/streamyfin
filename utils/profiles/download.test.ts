import { describe, expect, mock, test } from "bun:test";

mock.module("react-native", () => ({
  Platform: {
    OS: "ios",
    isTV: false,
    select: (spec: Record<string, unknown>) => spec.ios ?? spec.default,
  },
}));

const { generateDownloadProfile } = await import("./download");

describe("generateDownloadProfile", () => {
  test("video transcoding profile requests a progressive http ts stream", () => {
    const profile = generateDownloadProfile("auto");

    const video = profile.TranscodingProfiles?.find((p) => p.Type === "Video");

    // Context must stay "Streaming": the server's MediaInfoHelper hardcodes
    // EncodingContext.Streaming for PlaybackInfo, so "Static" profiles are
    // never matched. Protocol "http" makes the server return the progressive
    // /videos/{id}/stream.ts URL directly instead of an HLS playlist.
    expect(video).toEqual({
      Type: "Video",
      Context: "Streaming",
      Protocol: "http",
      Container: "ts",
      VideoCodec: "h264,hevc",
      AudioCodec: "aac,mp3,ac3,dts",
      MaxAudioChannels: "6",
      CopyTimestamps: false,
    });
  });
});

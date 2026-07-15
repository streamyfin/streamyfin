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
  test("text subtitles are delivered externally, image subtitles burned in", () => {
    const profile = generateDownloadProfile("auto");

    // Text formats come as separate downloadable files (survive transcodes,
    // keep video stream-copyable); image formats can't be loaded externally
    // by the players nor embedded in ts, so they burn in.
    expect(profile.SubtitleProfiles).toEqual([
      ...[
        "webvtt",
        "vtt",
        "srt",
        "subrip",
        "ttml",
        "ass",
        "ssa",
        "microdvd",
        "mov_text",
        "mpl2",
        "pjs",
        "realtext",
        "scc",
        "smi",
        "stl",
        "sub",
        "subviewer",
        "text",
        "vplayer",
        "xsub",
      ].map((Format) => ({ Format, Method: "External" as const })),
      ...["dvdsub", "idx", "pgs", "pgssub", "teletext", "vobsub"].map(
        (Format) => ({ Format, Method: "Encode" as const }),
      ),
    ]);
  });

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

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

  test("video transcoding profile requests a progressive http fmp4 stream", () => {
    const profile = generateDownloadProfile("auto");

    const video = profile.TranscodingProfiles?.find((p) => p.Type === "Video");

    // Context must stay "Streaming": the server's MediaInfoHelper hardcodes
    // EncodingContext.Streaming for PlaybackInfo, so "Static" profiles are
    // never matched. Protocol "http" makes the server return the progressive
    // /videos/{id}/stream.mp4 URL directly instead of an HLS playlist; a
    // progressive mp4 is written as fragmented MP4 by the server.
    //
    // The audio list keeps eac3 (proper ec-3 tag in mp4, stream-copies with
    // Dolby Atmos metadata intact) and drops dts: ffmpeg muxes DTS into mp4
    // under the legacy mp4a/esds dialect that only ffmpeg-family software
    // reads reliably, so DTS sources get a deterministic transcode instead.
    expect(video).toEqual({
      Type: "Video",
      Context: "Streaming",
      Protocol: "http",
      Container: "mp4",
      VideoCodec: "h264,hevc",
      AudioCodec: "aac,mp3,ac3,eac3",
      MaxAudioChannels: "6",
      CopyTimestamps: false,
    });
  });

  test("transcoded downloads honor the audioTranscodeMode channel limit", () => {
    const channels = (mode: Parameters<typeof generateDownloadProfile>[0]) =>
      generateDownloadProfile(mode).TranscodingProfiles?.find(
        (profile) => profile.Type === "Video",
      )?.MaxAudioChannels;

    expect(channels("stereo")).toBe("2");
    expect(channels("5.1")).toBe("6");
    expect(channels("passthrough")).toBe("8");
    expect(channels("auto")).toBe("6");
  });
});

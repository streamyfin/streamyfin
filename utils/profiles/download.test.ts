import { describe, expect, mock, test } from "bun:test";
import { stubReactNative } from "@/test-utils/reactNative";

stubReactNative();
mock.module("expo", () => ({
  // codecSupport probes the native MPV module; under bun:test there is none.
  requireOptionalNativeModule: () => null,
}));

const { generateDownloadProfile, generateMultiTrackDownloadProfile } =
  await import("./download");

describe("generateDownloadProfile", () => {
  test("leaves the bitrate uncapped so Max means Max", () => {
    const profile = generateDownloadProfile("auto");

    expect(profile.MaxStreamingBitrate).toBe(999_999_999);
    expect(profile.MaxStaticBitrate).toBe(999_999_999);
  });

  test("text subtitles are delivered externally, image subtitles burned in", () => {
    const profile = generateDownloadProfile("auto");

    expect(profile.SubtitleProfiles).toEqual([
      // "webvtt" is absent on purpose — see TEXT_EXTERNAL_FORMATS (#1892).
      ...[
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
      ].map((Format) => ({ Format, Method: "External" as const })),
      ...["dvdsub", "idx", "pgs", "pgssub", "teletext", "vobsub", "xsub"].map(
        (Format) => ({ Format, Method: "Encode" as const }),
      ),
    ]);
  });

  test("video transcoding profile requests a progressive http fmp4 stream", () => {
    const profile = generateDownloadProfile("auto");

    const video = profile.TranscodingProfiles?.find((p) => p.Type === "Video");

    expect(video).toEqual({
      Type: "Video",
      Context: "Streaming",
      Protocol: "http",
      Container: "mp4",
      VideoCodec: "av1,h264,hevc",
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

describe("generateMultiTrackDownloadProfile", () => {
  test("only negotiates progressive H.264 baseline and AAC-LC up to stereo", () => {
    const profile = generateMultiTrackDownloadProfile();

    expect(profile.DirectPlayProfiles).toEqual([]);
    expect(profile.MaxStreamingBitrate).toBeUndefined();
    expect(profile.TranscodingProfiles).toEqual([
      {
        Type: "Video",
        Context: "Streaming",
        Protocol: "http",
        Container: "mp4",
        VideoCodec: "h264",
        AudioCodec: "aac",
        MaxAudioChannels: "2",
        CopyTimestamps: false,
        EnableAudioVbrEncoding: false,
      },
    ]);
    expect(profile.CodecProfiles).toContainEqual(
      expect.objectContaining({
        Type: "Video",
        Codec: "h264",
        Conditions: expect.arrayContaining([
          { Condition: "Equals", Property: "VideoProfile", Value: "baseline" },
        ]),
      }),
    );
    expect(profile.CodecProfiles).toContainEqual({
      Type: "VideoAudio",
      Codec: "aac",
      Conditions: [
        { Condition: "Equals", Property: "AudioProfile", Value: "LC" },
        { Condition: "LessThanEqual", Property: "AudioChannels", Value: "2" },
        {
          Condition: "LessThanEqual",
          Property: "AudioBitrate",
          Value: "128000",
        },
      ],
    });
    expect(profile.SubtitleProfiles).toEqual(
      generateDownloadProfile().SubtitleProfiles,
    );
  });

  test("extra audio negotiation caps its disposable video, not the main video", () => {
    const mainVideo = generateMultiTrackDownloadProfile().CodecProfiles?.find(
      (profile) => profile.Type === "Video",
    );
    const extraVideo = generateMultiTrackDownloadProfile(
      true,
    ).CodecProfiles?.find((profile) => profile.Type === "Video");
    const tinyVideoConditions = [
      { Condition: "LessThanEqual", Property: "Width", Value: "160" },
      { Condition: "LessThanEqual", Property: "Height", Value: "90" },
      { Condition: "LessThanEqual", Property: "VideoFramerate", Value: "1" },
      { Condition: "LessThanEqual", Property: "VideoBitrate", Value: "32000" },
    ];
    expect(extraVideo?.Conditions).toEqual(
      expect.arrayContaining(tinyVideoConditions),
    );
    for (const condition of tinyVideoConditions) {
      expect(mainVideo?.Conditions).not.toContainEqual(condition);
    }
  });
});

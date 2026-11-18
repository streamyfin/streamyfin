import type { MediaSourceInfo } from "@jellyfin/sdk/lib/generated-client";
import type { Jellyfin12MediaStream } from "@/utils/jellyfin/trackLabel";
import { buildTrackMenus } from "./buildNativePlayerConfig";

// Settings pull in the auth provider and the router; no menu label reads them.

// Track resolution belongs to the config build, not to the menus, and loading
// it starts the logger (MMKV, and a Sentry timer that keeps Jest alive). So
// does the bitrate the stream is asked at.
jest.mock("./resolveTrackIndexes", () => ({}));
jest.mock("@/utils/jellyfin/maxStreamingBitrate", () => ({}));

// The subtitle prefetch logs its outcome; the log module reaches MMKV.
jest.mock("@/utils/log", () => ({ writeInfoLog: () => undefined }));

const menus = (streams: Jellyfin12MediaStream[]) =>
  buildTrackMenus({
    mediaSource: { MediaStreams: streams } as MediaSourceInfo,
    audioIndex: 1,
    subtitleIndex: -1,
    offline: false,
    downloadedItem: null,
    offLabel: "None",
    originalLabel: "Original",
    qualityLabel: (bitrate: { key: string }) =>
      bitrate.key === "Auto" ? "Auto" : bitrate.key,
    bitrateValue: "max",
    trackTags: { forced: "Forced", default: "Default", external: "External" },
  });

describe("buildTrackMenus", () => {
  test("hands the native chrome an audio label with the original track marked", () => {
    // The native menus render the label as is, so the tag has to be in it.
    const { audio } = menus([
      { Type: "Audio", Index: 1, DisplayTitle: "English - AAC" },
      {
        Type: "Audio",
        Index: 2,
        DisplayTitle: "Japanese - AAC",
        IsOriginal: true,
      },
    ]);
    expect(audio.map((a) => a.label)).toEqual([
      "English - AAC",
      "Japanese - AAC - Original",
    ]);
  });

  test("does not repeat the tag a Jellyfin 12 DisplayTitle already carries", () => {
    const { audio } = menus([
      {
        Type: "Audio",
        Index: 1,
        DisplayTitle: "Japanese - AAC - Stereo - Original",
        LocalizedOriginal: "Original",
        IsOriginal: true,
      },
    ]);
    expect(audio[0].label).toBe("Japanese - AAC - Stereo - Original");
  });

  test("falls back to the resolved language name when DisplayTitle is empty", () => {
    // `??` used to keep an empty DisplayTitle, leaving a blank row.
    const { audio, subtitles } = menus([
      {
        Type: "Audio",
        Index: 1,
        DisplayTitle: "",
        Language: "jpn",
        LocalizedLanguage: "Japanese",
      },
      { Type: "Subtitle", Index: 2, Language: "swe" },
    ]);
    expect(audio[0].label).toBe("Japanese");
    expect(subtitles.map((s) => s.label)).toEqual(["None", "swe"]);
  });

  // The spec mocked the table to nothing, so the quality menu was never
  // checked against the real one.
  test("offers Auto, then Max and every cap, the quality playing marked", () => {
    const quality = menus([]).quality ?? [];
    expect(quality.map((entry) => entry.label)).toEqual([
      "Auto",
      "Max",
      "8 Mb/s",
      "4 Mb/s",
      "2 Mb/s",
      "1 Mb/s",
      "500 Kb/s",
      "250 Kb/s",
    ]);
    expect(quality.filter((entry) => entry.selected)).toEqual([
      expect.objectContaining({ label: "Max", jellyfinIndex: -1 }),
    ]);
    expect(quality[0].jellyfinIndex).toBe(-2);
    expect(quality.every((entry) => entry.requiresReload)).toBe(true);
  });

  // Jellyfin 12 resolves the language to a name; the rest of the title moves to a second line.
  test("an audio row carries its language as label and its codec and channels as detail", () => {
    const { audio } = menus([
      {
        Type: "Audio",
        Index: 1,
        DisplayTitle: "English - AC3 - 5.1 - Default",
        Language: "eng",
        LocalizedLanguage: "English",
        Codec: "ac3",
        ChannelLayout: "5.1(side)",
        Channels: 6,
        IsDefault: true,
      },
      {
        Type: "Audio",
        Index: 2,
        DisplayTitle: "Commentary - English - AAC - Stereo",
        Title: "Commentary",
        Language: "eng",
        LocalizedLanguage: "English",
        Codec: "aac",
        Channels: 2,
      },
    ]);
    expect(audio.map(({ label, detail }) => ({ label, detail }))).toEqual([
      { label: "English", detail: "AC3 · 5.1" },
      { label: "English", detail: "Commentary · AAC · 2 ch" },
    ]);
  });

  test("a subtitle row says its format and whether it is forced, default or external", () => {
    const { subtitles } = menus([
      {
        Type: "Subtitle",
        Index: 3,
        Language: "fre",
        LocalizedLanguage: "French",
        Codec: "subrip",
        IsForced: true,
        IsDefault: true,
      },
      {
        Type: "Subtitle",
        Index: 4,
        Language: "eng",
        LocalizedLanguage: "English",
        Codec: "pgssub",
      },
      {
        Type: "Subtitle",
        Index: 5,
        Language: "eng",
        LocalizedLanguage: "English",
        Codec: "ass",
        IsExternal: true,
      },
    ]);
    expect(subtitles.map(({ label, detail }) => ({ label, detail }))).toEqual([
      { label: "None", detail: undefined },
      { label: "French", detail: "SRT · Forced · Default" },
      { label: "English", detail: "PGS" },
      { label: "English", detail: "ASS · External" },
    ]);
  });

  // Before Jellyfin 12 the language is a raw ISO code: the server's own title reads better, and it already
  // says the codec, so nothing is repeated under it.
  test("a row without a language falls back to its display title", () => {
    const { audio, subtitles } = menus([
      {
        Type: "Audio",
        Index: 1,
        DisplayTitle: "English - AAC - Stereo",
        Language: "eng",
        Codec: "aac",
        Channels: 2,
      },
      { Type: "Subtitle", Index: 2, DisplayTitle: "Signs", Codec: "ass" },
    ]);
    expect(audio[0]).toEqual(
      expect.objectContaining({ label: "English - AAC - Stereo" }),
    );
    expect(audio[0].detail).toBeUndefined();
    expect(subtitles[1].label).toBe("Signs");
    expect(subtitles[1].detail).toBeUndefined();
  });

  test("a row with nothing to add has no detail", () => {
    const { audio } = menus([
      {
        Type: "Audio",
        Index: 1,
        Language: "eng",
        LocalizedLanguage: "English",
      },
    ]);
    expect(audio[0].label).toBe("English");
    expect(audio[0].detail).toBeUndefined();
  });
});

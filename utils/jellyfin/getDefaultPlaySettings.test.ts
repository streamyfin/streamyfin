import { beforeEach, describe, expect, mock, test } from "bun:test";
import type {
  BaseItemDto,
  MediaSourceInfo,
  MediaStream,
} from "@jellyfin/sdk/lib/generated-client";
import type { Settings } from "@/utils/atoms/settings";

// react-native-mmkv needs a native module. Back it with a Map so the per-series
// memory under test is exercised for real rather than stubbed out.
const store = new Map<string, string>();
mock.module("react-native-mmkv", () => ({
  createMMKV: () => ({
    getString: (key: string) => store.get(key),
    set: (key: string, value: string) => void store.set(key, value),
    delete: (key: string) => void store.delete(key),
  }),
}));

// BitrateSelector is a React component module; only the BITRATES table matters.
mock.module("@/components/BitrateSelector", () => ({
  BITRATES: [{ key: "Max", value: undefined }],
}));

// Imported after the mocks are registered — static ESM imports would evaluate
// the real modules first.
const { getDefaultPlaySettings } = await import("./getDefaultPlaySettings");
const { rememberSeriesTrack } = await import("@/utils/seriesTrackMemory");

const audio = (
  index: number,
  language: string,
  extra: Partial<MediaStream> = {},
): MediaStream => ({
  Type: "Audio",
  Index: index,
  Language: language,
  ...extra,
});

const sub = (
  index: number,
  language: string,
  extra: Partial<MediaStream> = {},
): MediaStream => ({
  Type: "Subtitle",
  Index: index,
  Language: language,
  ...extra,
});

const source = (
  streams: MediaStream[],
  defaults: { audio?: number; subtitle?: number } = {},
): MediaSourceInfo => ({
  Id: "src-1",
  MediaStreams: streams,
  DefaultAudioStreamIndex: defaults.audio,
  DefaultSubtitleStreamIndex: defaults.subtitle,
});

const episode = (mediaSource: MediaSourceInfo): BaseItemDto => ({
  Id: "ep-1",
  Type: "Episode",
  SeriesId: "series-1",
  MediaSources: [mediaSource],
});

const settingsWith = (patch: Partial<Settings>): Settings =>
  ({
    rememberAudioSelections: true,
    rememberSubtitleSelections: true,
    ...patch,
  }) as Settings;

const lang = (code: string) => ({ ThreeLetterISOLanguageName: code }) as never;

beforeEach(() => store.clear());

describe("language preferences apply on every path", () => {
  // Regression: this block used to be gated behind an `applyLanguagePreferences`
  // option that the item pages passed and every TV / native-player next-episode
  // handler forgot, so advancing an episode on Apple TV kept the server's
  // default track while the same show on the phone resolved correctly.
  test("subtitle preference is honoured with no options argument", () => {
    const item = episode(
      source([sub(0, "tur"), sub(1, "eng")], { subtitle: 0 }),
    );
    const result = getDefaultPlaySettings(
      item,
      settingsWith({ defaultSubtitleLanguage: lang("eng") }),
    );
    expect(result.subtitleIndex).toBe(1);
  });

  test("audio preference is honoured with no options argument", () => {
    const item = episode(
      source([audio(0, "tur"), audio(1, "eng")], { audio: 0 }),
    );
    const result = getDefaultPlaySettings(
      item,
      settingsWith({ defaultAudioLanguage: lang("eng") }),
    );
    expect(result.audioIndex).toBe(1);
  });

  test("no preference set leaves the server defaults untouched", () => {
    // Making the block unconditional must be a no-op for users who never
    // configured a language, or it would silently re-pick everyone's tracks.
    const item = episode(
      source([sub(0, "tur"), sub(1, "eng")], { subtitle: 0 }),
    );
    const result = getDefaultPlaySettings(item, settingsWith({}));
    expect(result.subtitleIndex).toBe(0);
  });
});

describe("findTrackByLanguage — ISO 639 variants", () => {
  test("matches a 639-2/B stream against a 639-2/T preference", () => {
    // CultureDto gives .NET-style /T ("deu"); streams are tagged /B ("ger").
    // Plain string equality never matched, so German preferences did nothing.
    const item = episode(source([sub(0, "tur"), sub(1, "ger")]));
    const result = getDefaultPlaySettings(
      item,
      settingsWith({ defaultSubtitleLanguage: lang("deu") }),
    );
    expect(result.subtitleIndex).toBe(1);
  });

  test("matches a 639-1 stream against a 639-2 preference", () => {
    const item = episode(source([sub(0, "tur"), sub(1, "sv")]));
    const result = getDefaultPlaySettings(
      item,
      settingsWith({ defaultSubtitleLanguage: lang("swe") }),
    );
    expect(result.subtitleIndex).toBe(1);
  });

  test("does not match Swahili for a Swedish preference", () => {
    // The old `substring(0, 2)` fallback turned "swe" into "sw" — Swahili.
    const item = episode(
      source([sub(0, "swa"), sub(1, "sw")], { subtitle: -1 }),
    );
    const result = getDefaultPlaySettings(
      item,
      settingsWith({ defaultSubtitleLanguage: lang("swe") }),
    );
    expect(result.subtitleIndex).toBe(-1);
  });

  test("prefers the default track when several share the language", () => {
    const item = episode(
      source([sub(0, "eng"), sub(1, "eng", { IsDefault: true })]),
    );
    const result = getDefaultPlaySettings(
      item,
      settingsWith({ defaultSubtitleLanguage: lang("eng") }),
    );
    expect(result.subtitleIndex).toBe(1);
  });
});

describe("subtitle mode", () => {
  const streams = [
    sub(0, "eng"),
    sub(1, "swe", { IsForced: true }),
    sub(2, "swe"),
    audio(3, "eng"),
  ];

  test("None disables subtitles even with a preference set", () => {
    const result = getDefaultPlaySettings(
      episode(source(streams, { subtitle: 0 })),
      settingsWith({
        subtitleMode: "None" as never,
        defaultSubtitleLanguage: lang("swe"),
      }),
    );
    expect(result.subtitleIndex).toBe(-1);
  });

  test("OnlyForced picks the forced track in the preferred language", () => {
    const result = getDefaultPlaySettings(
      episode(source(streams)),
      settingsWith({
        subtitleMode: "OnlyForced" as never,
        defaultSubtitleLanguage: lang("swe"),
      }),
    );
    expect(result.subtitleIndex).toBe(1);
  });

  test("Smart disables subtitles when audio already matches the preference", () => {
    const result = getDefaultPlaySettings(
      episode(source(streams, { audio: 3 })),
      settingsWith({
        subtitleMode: "Smart" as never,
        defaultSubtitleLanguage: lang("eng"),
        defaultAudioLanguage: lang("eng"),
      }),
    );
    expect(result.subtitleIndex).toBe(-1);
  });

  test("Smart enables subtitles when audio is a different language", () => {
    const jpAudio = [sub(0, "eng"), audio(1, "jpn")];
    const result = getDefaultPlaySettings(
      episode(source(jpAudio, { audio: 1 })),
      settingsWith({
        subtitleMode: "Smart" as never,
        defaultSubtitleLanguage: lang("eng"),
      }),
    );
    expect(result.subtitleIndex).toBe(0);
  });

  test("Smart disables subtitles when 639-1 audio (sv) matches 639-2/T subtitle preference (swe)", () => {
    const svAudioStreams = [sub(0, "swe"), audio(1, "sv")];
    const result = getDefaultPlaySettings(
      episode(source(svAudioStreams, { audio: 1 })),
      settingsWith({
        subtitleMode: "Smart" as never,
        defaultSubtitleLanguage: lang("swe"),
      }),
    );
    expect(result.subtitleIndex).toBe(-1);
  });

  test("Smart disables subtitles when 639-2/B audio (ger) matches 639-2/T subtitle preference (deu)", () => {
    const gerAudioStreams = [sub(0, "deu"), audio(1, "ger")];
    const result = getDefaultPlaySettings(
      episode(source(gerAudioStreams, { audio: 1 })),
      settingsWith({
        subtitleMode: "Smart" as never,
        defaultSubtitleLanguage: lang("deu"),
      }),
    );
    expect(result.subtitleIndex).toBe(-1);
  });

  test("Smart does not disable subtitles for Swahili (swa) audio when subtitle preference is Swedish (swe)", () => {
    const swaAudioStreams = [sub(0, "swe"), audio(1, "swa")];
    const result = getDefaultPlaySettings(
      episode(source(swaAudioStreams, { audio: 1 })),
      settingsWith({
        subtitleMode: "Smart" as never,
        defaultSubtitleLanguage: lang("swe"),
      }),
    );
    expect(result.subtitleIndex).toBe(0);
  });
});

describe("precedence", () => {
  test("previous-episode carry-over beats the language preference", () => {
    // The ranker match is the freshest signal — a deliberate pick on the last
    // episode must not be overwritten by a standing preference. The new episode
    // numbers its tracks differently, which is the whole reason the ranker
    // exists rather than a plain index carry-over.
    const prev = source([sub(0, "eng"), sub(1, "tur")]);
    const item = episode(source([sub(0, "fre"), sub(1, "eng"), sub(2, "tur")]));
    const result = getDefaultPlaySettings(
      item,
      settingsWith({ defaultSubtitleLanguage: lang("eng") }),
      { indexes: { subtitleIndex: 1 }, source: prev },
    );
    expect(result.subtitleIndex).toBe(2);
  });

  test("series memory beats the language preference", () => {
    rememberSeriesTrack("series-1", { subtitleLang: "tur" });
    const item = episode(source([sub(0, "eng"), sub(1, "tur")]));
    const result = getDefaultPlaySettings(
      item,
      settingsWith({ defaultSubtitleLanguage: lang("eng") }),
    );
    expect(result.subtitleIndex).toBe(1);
  });

  test("a remembered 'off' survives the language preference", () => {
    rememberSeriesTrack("series-1", { subtitleLang: "off" });
    const item = episode(source([sub(0, "eng")], { subtitle: 0 }));
    const result = getDefaultPlaySettings(
      item,
      settingsWith({ defaultSubtitleLanguage: lang("eng") }),
    );
    expect(result.subtitleIndex).toBe(-1);
  });

  test("series memory is ignored when the toggle is off", () => {
    rememberSeriesTrack("series-1", { subtitleLang: "tur" });
    const item = episode(source([sub(0, "eng"), sub(1, "tur")]));
    const result = getDefaultPlaySettings(
      item,
      settingsWith({
        rememberSubtitleSelections: false,
        defaultSubtitleLanguage: lang("eng"),
      }),
    );
    expect(result.subtitleIndex).toBe(0);
  });
});

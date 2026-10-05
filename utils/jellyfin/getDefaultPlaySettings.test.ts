import type {
  BaseItemDto,
  MediaSourceInfo,
  MediaStream,
} from "@jellyfin/sdk/lib/generated-client";
import type { Settings } from "@/utils/atoms/settings";

jest.mock(
  "react-native-mmkv",
  () => jest.requireActual("@/test-utils/mmkv").mmkvModule,
);

// BitrateSelector is a React component module; only the BITRATES table matters.
jest.mock("@/components/BitrateSelector", () => ({
  BITRATES: [{ key: "Max", value: undefined }],
}));
// The log module reaches Sentry, whose client keeps a timer running past the
// last test, so it is stubbed with the surface the modules under test call.
jest.mock("@/utils/log", () => ({
  writeToLog: () => undefined,
  writeInfoLog: () => undefined,
  writeErrorLog: () => undefined,
  writeDebugLog: () => undefined,
  logAndCaptureError: () => undefined,
  readFromLog: () => [],
}));

import { clearMmkv } from "@/test-utils/mmkv";
import { rememberSeriesTrack } from "@/utils/seriesTrackMemory";
import {
  getAdjacentStartTicks,
  getDefaultPlaySettings,
} from "./getDefaultPlaySettings";

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

beforeEach(clearMmkv);

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

describe("findTrackByLanguage — region and script variants", () => {
  // Regression: tags were compared by primary subtag only, so "pt-BR" and
  // "pt-PT" (or "zh-Hans" and "zh-Hant") were one language and the first track
  // of it won, whichever variant had been picked.
  test("a remembered subtitle variant carries over to the same variant", () => {
    rememberSeriesTrack("series-1", { subtitleLang: "pt-BR" });
    const item = episode(source([sub(0, "pt-PT"), sub(1, "pt-BR")]));
    const result = getDefaultPlaySettings(item, settingsWith({}));
    expect(result.subtitleIndex).toBe(1);
  });

  test("a remembered script variant carries over to the same script", () => {
    rememberSeriesTrack("series-1", { subtitleLang: "zh-Hant" });
    const item = episode(source([sub(0, "zh-Hans"), sub(1, "zh-Hant")]));
    const result = getDefaultPlaySettings(item, settingsWith({}));
    expect(result.subtitleIndex).toBe(1);
  });

  test("a remembered audio variant carries over to the same variant", () => {
    rememberSeriesTrack("series-1", { audioLang: "es-419" });
    const item = episode(
      source([audio(0, "es-ES"), audio(1, "es-419")], { audio: 0 }),
    );
    const result = getDefaultPlaySettings(item, settingsWith({}));
    expect(result.audioIndex).toBe(1);
  });

  test("a remembered variant is not carried over to a different one", () => {
    rememberSeriesTrack("series-1", { subtitleLang: "pt-BR" });
    const item = episode(
      source([sub(0, "eng"), sub(1, "pt-PT")], { subtitle: 0 }),
    );
    const result = getDefaultPlaySettings(item, settingsWith({}));
    expect(result.subtitleIndex).toBe(0);
  });

  test("the track tagged exactly as remembered beats one that only shares the language", () => {
    // Both directions: a bare "por" track is not the Brazilian one that was
    // picked, and a Brazilian one is not the bare track that was picked.
    rememberSeriesTrack("series-1", { subtitleLang: "pt-BR" });
    expect(
      getDefaultPlaySettings(
        episode(source([sub(0, "por"), sub(1, "pt-BR")])),
        settingsWith({}),
      ).subtitleIndex,
    ).toBe(1);

    rememberSeriesTrack("series-1", { subtitleLang: "por" });
    expect(
      getDefaultPlaySettings(
        episode(source([sub(0, "pt-BR", { IsDefault: true }), sub(1, "por")])),
        settingsWith({}),
      ).subtitleIndex,
    ).toBe(1);
  });

  test("a remembered variant subtag carries over to the same one", () => {
    // Regression: variant subtags were dropped, so "ca-valencia" was plain
    // Catalan and "de-1901" was "de-1996".
    rememberSeriesTrack("series-1", { subtitleLang: "ca-valencia" });
    expect(
      getDefaultPlaySettings(
        episode(source([sub(0, "cat"), sub(1, "ca-valencia")])),
        settingsWith({}),
      ).subtitleIndex,
    ).toBe(1);

    rememberSeriesTrack("series-1", { subtitleLang: "de-1996" });
    expect(
      getDefaultPlaySettings(
        episode(source([sub(0, "de-1901"), sub(1, "de-1996")])),
        settingsWith({}),
      ).subtitleIndex,
    ).toBe(1);
  });

  test("a bare preference matches every variant and keeps the default-track rule", () => {
    // CultureDto codes carry no region, so the preference cannot choose between
    // variants: both match and the file's own default decides.
    const item = episode(
      source([sub(0, "pt-PT"), sub(1, "pt-BR", { IsDefault: true })]),
    );
    const result = getDefaultPlaySettings(
      item,
      settingsWith({ defaultSubtitleLanguage: lang("por") }),
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

describe("version carry-over on sequential play", () => {
  // Jellyfin 12 groups alternate episode versions in MediaSources like movie
  // versions. Advancing an episode keeps the version the user was watching,
  // matched by name the way jellyfin-web's getMatchingMediaSource does.
  const named = (id: string, name: string, streams: MediaStream[] = []) => ({
    ...source(streams),
    Id: id,
    Name: name,
  });
  const twoVersions = (): BaseItemDto => ({
    ...episode(named("next-1080", "1080p")),
    MediaSources: [
      named("next-1080", "1080p", [sub(0, "eng")]),
      named("next-4k", "4K", [sub(0, "fre"), sub(1, "eng")]),
    ],
  });

  test("picks the next episode's version with the same name", () => {
    const result = getDefaultPlaySettings(twoVersions(), settingsWith({}), {
      indexes: { subtitleIndex: 0 },
      source: named("cur-4k", "4K", [sub(0, "eng")]),
    });
    expect(result.mediaSource?.Id).toBe("next-4k");
    // Track carry-over ranks against the matched version's streams.
    expect(result.subtitleIndex).toBe(1);
  });

  test("falls back to the first version when no name matches", () => {
    const result = getDefaultPlaySettings(twoVersions(), settingsWith({}), {
      source: named("cur-720", "720p"),
    });
    expect(result.mediaSource?.Id).toBe("next-1080");
  });

  test("offline keeps the first version", () => {
    // A download's item lists every server version, not only the one on disk.
    const result = getDefaultPlaySettings(twoVersions(), settingsWith({}), {
      source: named("cur-4k", "4K"),
      offline: true,
    });
    expect(result.mediaSource?.Id).toBe("next-1080");
  });

  test("uses the first version without a previous source", () => {
    const result = getDefaultPlaySettings(twoVersions(), settingsWith({}));
    expect(result.mediaSource?.Id).toBe("next-1080");
  });
});

describe("getAdjacentStartTicks", () => {
  const resumed = (sources: MediaSourceInfo[]): BaseItemDto => ({
    Id: "ep-2",
    MediaSources: sources,
    UserData: { PlaybackPositionTicks: 600 },
  });

  test("the primary version resumes at the item's position", () => {
    const item = resumed([{ Id: "ep-2" }, { Id: "ep-2-4k" }]);
    expect(getAdjacentStartTicks(item, { Id: "ep-2" }, false)).toBe(600);
  });

  test("an alternate version does not take the primary's position", () => {
    // Jellyfin 12 keeps UserData per version: the item's is the primary's.
    const item = resumed([{ Id: "ep-2" }, { Id: "ep-2-4k" }]);
    expect(getAdjacentStartTicks(item, { Id: "ep-2-4k" }, false)).toBe(0);
  });

  test("plugin streams are not versions and keep the item's position", () => {
    // None of the sources is the item itself, so none has its own UserData.
    const item = resumed([{ Id: "stream-a" }, { Id: "stream-b" }]);
    expect(getAdjacentStartTicks(item, { Id: "stream-a" }, false)).toBe(600);
  });

  test("a download keeps its own position", () => {
    // The record's item lists every server version, so the source matched
    // here need not be the one on disk; its position is kept as before.
    const item = resumed([{ Id: "ep-2" }, { Id: "ep-2-4k" }]);
    expect(getAdjacentStartTicks(item, { Id: "ep-2-4k" }, true)).toBe(600);
  });
});

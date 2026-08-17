import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import type { TrackMenuRow } from "@/utils/subtitles/trackMenu";

const store = new Map<string, string>();
mock.module("react-native-mmkv", () => ({
  createMMKV: () => ({
    getString: (key: string) => store.get(key),
    set: (key: string, value: string) => void store.set(key, value),
    delete: (key: string) => void store.delete(key),
  }),
}));
// Bun's mock.module retroactively re-links every module already importing the
// specifier, so a log mock must cover the module's full function surface —
// a missing name breaks OTHER test files' modules that import it.
mock.module("@/utils/log", () => ({
  writeToLog: () => undefined,
  writeInfoLog: () => undefined,
  writeErrorLog: () => undefined,
  writeDebugLog: () => undefined,
  readFromLog: () => [],
}));

const { getSeriesTrackMemory, rememberSeriesTrackFromRow } = await import(
  "./seriesTrackMemory"
);

const episode = { Id: "e1", Type: "Episode", SeriesId: "s1" } as BaseItemDto;
const on = { rememberAudioSelections: true, rememberSubtitleSelections: true };

const row = (patch: Partial<TrackMenuRow>): TrackMenuRow => ({
  index: 1,
  label: "row",
  selected: false,
  kind: "server",
  requiresReload: false,
  ...patch,
});

beforeEach(() => store.clear());

describe("rememberSeriesTrackFromRow", () => {
  test("stores the language carried on the row", () => {
    // The language travels with the row precisely so this never has to consult
    // a stream list that may have been refetched since the menu was built.
    rememberSeriesTrackFromRow({
      item: episode,
      kind: "subtitle",
      row: row({ language: "swe" }),
      settings: on,
    });
    expect(getSeriesTrackMemory("s1")?.subtitleLang).toBe("swe");
  });

  test("stores an explicit off", () => {
    rememberSeriesTrackFromRow({
      item: episode,
      kind: "subtitle",
      row: row({ kind: "off", index: -1 }),
      settings: on,
    });
    expect(getSeriesTrackMemory("s1")?.subtitleLang).toBe("off");
  });

  test("ignores a sidecar — it has no server-side identity", () => {
    rememberSeriesTrackFromRow({
      item: episode,
      kind: "subtitle",
      row: row({ kind: "sidecar", language: "swe" }),
      settings: on,
    });
    expect(getSeriesTrackMemory("s1")).toBeUndefined();
  });

  test("ignores a burned-in row — it is inert", () => {
    // This row's press does nothing, so it must not rewrite the preference.
    rememberSeriesTrackFromRow({
      item: episode,
      kind: "subtitle",
      row: row({ kind: "burnedIn", language: "tur" }),
      settings: on,
    });
    expect(getSeriesTrackMemory("s1")).toBeUndefined();
  });

  test("stores nothing when the stream had no language", () => {
    rememberSeriesTrackFromRow({
      item: episode,
      kind: "audio",
      row: row({ language: undefined }),
      settings: on,
    });
    expect(getSeriesTrackMemory("s1")).toBeUndefined();
  });

  test("respects the per-kind toggle", () => {
    rememberSeriesTrackFromRow({
      item: episode,
      kind: "audio",
      row: row({ language: "jpn" }),
      settings: { rememberAudioSelections: false },
    });
    expect(getSeriesTrackMemory("s1")).toBeUndefined();
  });

  test("only remembers for episodes", () => {
    rememberSeriesTrackFromRow({
      item: { Id: "m1", Type: "Movie" } as BaseItemDto,
      kind: "audio",
      row: row({ language: "eng" }),
      settings: on,
    });
    expect(getSeriesTrackMemory("s1")).toBeUndefined();
  });

  test("keeps audio and subtitle preferences independent", () => {
    rememberSeriesTrackFromRow({
      item: episode,
      kind: "audio",
      row: row({ language: "jpn" }),
      settings: on,
    });
    rememberSeriesTrackFromRow({
      item: episode,
      kind: "subtitle",
      row: row({ language: "eng" }),
      settings: on,
    });
    expect(getSeriesTrackMemory("s1")).toMatchObject({
      audioLang: "jpn",
      subtitleLang: "eng",
    });
  });
});

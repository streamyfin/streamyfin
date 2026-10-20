import { describe, expect, test } from "bun:test";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { createInstance } from "i18next";
import en from "@/translations/en.json";
import { buildEpisodeList } from "./buildEpisodeList";

const i18n = createInstance();
await i18n.init({ lng: "en", resources: { en: { translation: en } } });

const episode = {
  Id: "episode-3",
  Name: "The Journey",
  ParentIndexNumber: 2,
  IndexNumber: 3,
  Overview: "An unexpected journey brings the crew together.",
  RunTimeTicks: 25_200_000_000,
  PremiereDate: "2025-01-15T00:00:00Z",
  OfficialRating: "TV-14",
  CommunityRating: 8.5,
  UserData: { Played: false, PlayedPercentage: 35 },
} satisfies BaseItemDto;

const build = (episodes: BaseItemDto[], locale = "en-US") =>
  buildEpisodeList(episodes, {
    api: null,
    currentItemId: episode.Id,
    t: i18n.t,
    locale,
  });

describe("native episode list", () => {
  test("includes the description and all available episode details", () => {
    expect(build([episode])).toEqual([
      {
        itemId: "episode-3",
        title: "The Journey",
        indexNumber: 3,
        overview: episode.Overview,
        details: "S2 E3 · 42m · Jan 15, 2025 · TV-14 · 8.5/10 · Unwatched",
        imageUrl: undefined,
        progressPercent: 35,
        isCurrent: true,
      },
    ]);
  });

  test("omits unavailable details rather than inventing metadata", () => {
    const [result] = build([{ Id: "other", Name: "Unknown" }]);
    expect(result).toMatchObject({
      title: "Unknown",
      overview: undefined,
      details: undefined,
      progressPercent: 0,
      isCurrent: false,
    });
  });

  test("handles specials and episode zero without treating zero as absent", () => {
    const [result] = build([
      { Id: "special", ParentIndexNumber: 0, IndexNumber: 0 },
    ]);
    expect(result.details).toBe("S0 E0");
  });

  test("handles a missing season or episode number", () => {
    const results = build([
      { IndexNumber: 4, ParentIndexNumber: null },
      { ParentIndexNumber: 2, IndexNumber: null },
    ]);
    expect(results.map((result) => result.details)).toEqual([
      "Episode 4",
      "Season 2",
    ]);
  });

  test("includes watched status from downloaded or server user data", () => {
    const [result] = build([
      { ...episode, UserData: { Played: true, PlayedPercentage: 100 } },
    ]);
    expect(result.details).toEndWith("Watched");
    expect(result.progressPercent).toBe(100);
  });

  test("keeps date-only air dates in UTC and formats dates and ratings by locale", () => {
    const [result] = build([episode], "de-DE");
    expect(result.details).toContain("15.01.2025");
    expect(result.details).toContain("8,5/10");
  });

  test("ignores empty descriptions and invalid optional metadata", () => {
    const [result] = build([
      {
        Overview: "   ",
        PremiereDate: "not-a-date",
        RunTimeTicks: 0,
        OfficialRating: " ",
        CommunityRating: Number.NaN,
        UserData: {},
      },
    ]);
    expect(result.overview).toBeUndefined();
    expect(result.details).toBeUndefined();
  });

  test("keeps full descriptions and does not include virtual episodes", () => {
    const overview = "A longer episode description. ".repeat(100).trim();
    const results = build([
      { ...episode, Overview: overview },
      { Id: "missing", LocationType: "Virtual" },
    ]);
    expect(results).toHaveLength(1);
    expect(results[0].overview).toBe(overview);
  });
});

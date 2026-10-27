import {
  getWatchlistSources,
  isWatchlistsTabVisible,
  resolveActiveWatchlistSource,
} from "./watchlistSources";

const url = "https://stats.example";

describe("isWatchlistsTabVisible", () => {
  test("hides the tab when neither source is set up", () => {
    expect(isWatchlistsTabVisible({})).toBe(false);
    expect(isWatchlistsTabVisible(undefined)).toBe(false);
  });

  test("shows the tab for KefinTweaks alone, without Streamystats", () => {
    expect(isWatchlistsTabVisible({ useKefinTweaks: true })).toBe(true);
  });

  test("shows the tab for Streamystats alone", () => {
    expect(isWatchlistsTabVisible({ streamyStatsServerUrl: url })).toBe(true);
  });

  // hideWatchlistsTab only ever meant the Streamystats lists.
  test("keeps the tab for KefinTweaks when hideWatchlistsTab is on", () => {
    const settings = {
      streamyStatsServerUrl: url,
      hideWatchlistsTab: true,
      useKefinTweaks: true,
    };
    expect(isWatchlistsTabVisible(settings)).toBe(true);
    expect(getWatchlistSources(settings)).toEqual({
      streamystats: false,
      kefin: true,
    });
  });

  test("hides the tab when hideWatchlistsTab leaves nothing to show", () => {
    expect(
      isWatchlistsTabVisible({
        streamyStatsServerUrl: url,
        hideWatchlistsTab: true,
      }),
    ).toBe(false);
  });
});

describe("resolveActiveWatchlistSource", () => {
  test("follows the user's choice when both sources are shown", () => {
    expect(resolveActiveWatchlistSource(true, true, "streamystats")).toBe(
      "streamystats",
    );
    expect(resolveActiveWatchlistSource(true, true, "kefin")).toBe("kefin");
  });

  test("falls back to the only source shown, whatever was chosen", () => {
    expect(resolveActiveWatchlistSource(true, false, "kefin")).toBe(
      "streamystats",
    );
    expect(resolveActiveWatchlistSource(false, true, "streamystats")).toBe(
      "kefin",
    );
  });
});

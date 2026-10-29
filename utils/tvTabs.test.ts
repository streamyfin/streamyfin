import { isTVTabGone, showsWatchlists, tvTabGroups } from "./tvTabs";

describe("tvTabGroups", () => {
  // The phone gathers favorites, watchlists and settings in More because its
  // bar has no room for them. The TV bar has, and More would only add a click.
  test("puts every section in the bar, with no More tab", () => {
    expect(tvTabGroups(true)).toEqual([
      "(home)",
      "(search)",
      "(tv-favorites)",
      "(tv-watchlists)",
      "(libraries)",
      "(tv-settings)",
    ]);
  });

  test("leaves Watchlists out when they are not shown", () => {
    expect(tvTabGroups(false)).toEqual([
      "(home)",
      "(search)",
      "(tv-favorites)",
      "(libraries)",
      "(tv-settings)",
    ]);
  });
});

describe("showsWatchlists", () => {
  test("needs a Streamystats server", () => {
    expect(showsWatchlists({ streamyStatsServerUrl: "https://stats" })).toBe(
      true,
    );
    expect(showsWatchlists({ streamyStatsServerUrl: "" })).toBe(false);
    expect(showsWatchlists(undefined)).toBe(false);
  });

  test("respects the setting that hides them", () => {
    expect(
      showsWatchlists({
        streamyStatsServerUrl: "https://stats",
        hideWatchlistsTab: true,
      }),
    ).toBe(false);
  });
});

describe("isTVTabGone", () => {
  // The Android TV bar is drawn in JS: when the plugin settings hid the
  // watchlists while they were open, their page stayed on screen with no tab
  // selected. The layout sends the user Home when this says so.
  test("is true for the Watchlists tab once watchlists are hidden", () => {
    expect(isTVTabGone("(tv-watchlists)", false)).toBe(true);
    expect(isTVTabGone("(tv-watchlists)", true)).toBe(false);
  });

  test("is false for the tabs the bar always shows", () => {
    for (const tab of tvTabGroups(false)) {
      expect(isTVTabGone(tab, false)).toBe(false);
    }
  });

  // TV pages push into `(more)` (a favorites see-all, settings pages): those
  // are not tabs that left the bar.
  test("ignores what is not one of the bar's groups", () => {
    expect(isTVTabGone("(more)", false)).toBe(false);
    expect(isTVTabGone(undefined, false)).toBe(false);
  });
});

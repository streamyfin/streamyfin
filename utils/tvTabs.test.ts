import { isTVTabGone, showsWatchlists, tvTabGroups } from "./tvTabs";

describe("tvTabGroups", () => {
  // The phone gathers favorites, watchlists and settings in More because its
  // bar has no room for them. The TV bar has, and More would only add a click.
  test("puts every section in the bar, with no More tab", () => {
    expect(tvTabGroups({ watchlists: true, liveTV: true })).toEqual([
      "(home)",
      "(search)",
      "(tv-favorites)",
      "(tv-livetv)",
      "(tv-watchlists)",
      "(libraries)",
      "(tv-settings)",
    ]);
  });

  test("leaves Watchlists out when they are not shown", () => {
    expect(tvTabGroups({ watchlists: false, liveTV: true })).toEqual([
      "(home)",
      "(search)",
      "(tv-favorites)",
      "(tv-livetv)",
      "(libraries)",
      "(tv-settings)",
    ]);
  });

  test("leaves Live TV out when it is not shown", () => {
    expect(tvTabGroups({ watchlists: true, liveTV: false })).toEqual([
      "(home)",
      "(search)",
      "(tv-favorites)",
      "(tv-watchlists)",
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
    expect(
      isTVTabGone("(tv-watchlists)", { watchlists: false, liveTV: true }),
    ).toBe(true);
    expect(
      isTVTabGone("(tv-watchlists)", { watchlists: true, liveTV: true }),
    ).toBe(false);
  });

  test("is true for the Live TV tab once Live TV is hidden", () => {
    expect(
      isTVTabGone("(tv-livetv)", { watchlists: true, liveTV: false }),
    ).toBe(true);
    expect(isTVTabGone("(tv-livetv)", { watchlists: true, liveTV: true })).toBe(
      false,
    );
  });

  test("is false for the tabs the bar always shows", () => {
    const none = { watchlists: false, liveTV: false };
    for (const tab of tvTabGroups(none)) {
      expect(isTVTabGone(tab, none)).toBe(false);
    }
  });

  // TV pages push into `(more)` (a favorites see-all, settings pages): those
  // are not tabs that left the bar.
  test("ignores what is not one of the bar's groups", () => {
    const none = { watchlists: false, liveTV: false };
    expect(isTVTabGone("(more)", none)).toBe(false);
    expect(isTVTabGone(undefined, none)).toBe(false);
  });
});

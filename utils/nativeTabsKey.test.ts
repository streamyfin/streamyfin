import { nativeTabsKey } from "./nativeTabsKey";

const url = "https://stats.example";

describe("nativeTabsKey", () => {
  // Turning the watchlist integration on inserted the Watchlists tab while the
  // tab bar was on screen, and tvOS crashed the app (#2171).
  test("mounts the tvOS tab bar again when the Watchlists tab appears", () => {
    expect(nativeTabsKey({ useKefinTweaks: true }, true)).not.toBe(
      nativeTabsKey({ useKefinTweaks: false }, true),
    );
  });

  test("mounts the tvOS tab bar again when the custom links tab appears", () => {
    expect(nativeTabsKey({ showCustomMenuLinks: true }, true)).not.toBe(
      nativeTabsKey({ showCustomMenuLinks: false }, true),
    );
  });

  // A remount drops every tab's navigation stack, so a setting that leaves the
  // same tabs on screen must not cause one.
  test("keeps the tvOS tab bar when the same tabs stay on screen", () => {
    const kefin = { useKefinTweaks: true };

    expect(nativeTabsKey({ ...kefin, streamyStatsServerUrl: url }, true)).toBe(
      nativeTabsKey(kefin, true),
    );
    expect(
      nativeTabsKey(
        { ...kefin, streamyStatsServerUrl: url, hideWatchlistsTab: true },
        true,
      ),
    ).toBe(nativeTabsKey(kefin, true));
  });

  test("never mounts the phone tab bar again", () => {
    expect(nativeTabsKey({ useKefinTweaks: true }, false)).toBeUndefined();
    expect(nativeTabsKey({ showCustomMenuLinks: true }, false)).toBeUndefined();
  });
});

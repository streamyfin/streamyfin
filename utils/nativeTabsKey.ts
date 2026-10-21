import {
  isCustomLinksTabVisible,
  isWatchlistsTabVisible,
} from "@/utils/watchlistSources";

type OptionalTabSettings = NonNullable<
  Parameters<typeof isWatchlistsTabVisible>[0]
> &
  NonNullable<Parameters<typeof isCustomLinksTabVisible>[0]>;

/**
 * The key the native tab bar is mounted under. On tvOS, SwiftUI's TabView
 * throws (UIViewControllerHierarchyInconsistency) when a tab appears while it
 * is on screen, as the Watchlists tab does when the watchlist integration is
 * turned on, so the tab bar is mounted again for each set of optional tabs.
 * Anywhere else the tabs change in place and the key stays undefined.
 *
 * Each part is the rule its tab is shown by, the same one the tab bar reads,
 * so an optional tab added later needs a part of its own.
 */
export const nativeTabsKey = (
  settings: OptionalTabSettings | undefined,
  isTV: boolean,
): string | undefined =>
  isTV
    ? `${isWatchlistsTabVisible(settings)}:${isCustomLinksTabVisible(settings)}`
    : undefined;

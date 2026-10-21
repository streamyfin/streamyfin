import type { Settings } from "@/utils/atoms/settings";
import { isWatchlistsTabVisible } from "@/utils/watchlistSources";

type OptionalTabSettings = NonNullable<
  Parameters<typeof isWatchlistsTabVisible>[0]
> &
  Partial<Pick<Settings, "showCustomMenuLinks">>;

/**
 * The key the native tab bar is mounted under. On tvOS, SwiftUI's TabView
 * throws (UIViewControllerHierarchyInconsistency) when a tab appears while it
 * is on screen, as the Watchlists tab does when the watchlist integration is
 * turned on, so the tab bar is mounted again for each set of optional tabs.
 * Anywhere else the tabs change in place and the key stays undefined.
 */
export const nativeTabsKey = (
  settings: OptionalTabSettings | undefined,
  isTV: boolean,
): string | undefined =>
  isTV
    ? `${isWatchlistsTabVisible(settings)}:${Boolean(settings?.showCustomMenuLinks)}`
    : undefined;

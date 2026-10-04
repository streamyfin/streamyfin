import type { Settings } from "@/utils/atoms/settings";

export type WatchlistSource = "streamystats" | "kefin";

type WatchlistSettings = Partial<
  Pick<
    Settings,
    "streamyStatsServerUrl" | "hideWatchlistsTab" | "useKefinTweaks"
  >
>;

/**
 * Which watchlist sources the Watchlists tab hosts. `hideWatchlistsTab` predates
 * KefinTweaks and only ever meant the Streamystats lists, so it hides that side
 * alone: a user with KefinTweaks on still gets the tab.
 */
export function getWatchlistSources(settings: WatchlistSettings | undefined): {
  streamystats: boolean;
  kefin: boolean;
} {
  return {
    streamystats:
      Boolean(settings?.streamyStatsServerUrl) && !settings?.hideWatchlistsTab,
    kefin: Boolean(settings?.useKefinTweaks),
  };
}

/** The tab is shown whenever at least one source has something to show. */
export function isWatchlistsTabVisible(
  settings: WatchlistSettings | undefined,
): boolean {
  const { streamystats, kefin } = getWatchlistSources(settings);
  return streamystats || kefin;
}

/**
 * The source the tab shows. With both enabled the user's choice wins; with one,
 * that one wins whatever was chosen before, so turning a source off in settings
 * never leaves the tab on a view that is gone.
 */
export function resolveActiveWatchlistSource(
  streamystatsShown: boolean,
  kefinShown: boolean,
  chosen: WatchlistSource,
): WatchlistSource {
  if (streamystatsShown && kefinShown) return chosen;
  return streamystatsShown ? "streamystats" : "kefin";
}

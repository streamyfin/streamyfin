import type { Settings } from "@/utils/atoms/settings";

type WatchlistSettings = Partial<
  Pick<Settings, "streamyStatsServerUrl" | "hideWatchlistsTab">
>;

/** Watchlists come from Streamystats, and the user can hide them. */
export const showsWatchlists = (settings?: WatchlistSettings | null) =>
  Boolean(settings?.streamyStatsServerUrl) && !settings?.hideWatchlistsTab;

// The phone bar has room for four tabs and gathers the rest in More. The TV
// bar runs along the top of the screen with room for every section, where More
// would only add a click, so favorites, watchlists and settings stay tabs.
// Their TV-only groups sort after `(home)`, as every tab group must: see
// .claude/learned-facts/shared-route-from-outside-tabs-lands-in-first-group.md.
const TV_TAB_GROUPS = [
  "(home)",
  "(search)",
  "(tv-favorites)",
  "(tv-livetv)",
  "(tv-watchlists)",
  "(libraries)",
  "(tv-settings)",
] as const;

export type TVTabGroup = (typeof TV_TAB_GROUPS)[number];

/** The TV tabs that come and go: Watchlists, and Live TV on a server that has it. */
export type TVOptionalTabs = { watchlists: boolean; liveTV: boolean };

/** The tab groups of the TV bar, in order. Spec: utils/tvTabs.test.ts. */
export const tvTabGroups = ({
  watchlists,
  liveTV,
}: TVOptionalTabs): TVTabGroup[] =>
  TV_TAB_GROUPS.filter(
    (group) =>
      (watchlists || group !== "(tv-watchlists)") &&
      (liveTV || group !== "(tv-livetv)"),
  );

/**
 * Whether the user is on a TV tab the bar no longer shows, which happens when
 * a settings refresh turns watchlists off while they are open: the page would
 * stay on screen with no tab selected. Only the bar's own groups count, since
 * a page pushed into `(more)` or a shared group is not a tab that left.
 * Spec: utils/tvTabs.test.ts.
 */
export const isTVTabGone = (
  currentTab: string | undefined,
  shown: TVOptionalTabs,
): boolean =>
  (TV_TAB_GROUPS as readonly string[]).includes(currentTab ?? "") &&
  !(tvTabGroups(shown) as string[]).includes(currentTab ?? "");

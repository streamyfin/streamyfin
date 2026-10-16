import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  resolveActiveWatchlistSource,
  type WatchlistSource,
} from "@/utils/watchlistSources";

const DEFAULT_SOURCE: WatchlistSource = "streamystats";

/**
 * Resolves which watchlist source the Watchlists tab shows. When both are
 * shown the user toggles between them, defaulting to Streamystats; otherwise
 * the single enabled source wins.
 *
 * Only a source the user picked is remembered. Seeding the state from the
 * sources enabled at mount pinned the tab to KefinTweaks for a user who set up
 * Streamystats afterwards, since the tab stays mounted through the change.
 */
export function useWatchlistSource(
  streamystatsShown: boolean,
  kefinShown: boolean,
) {
  const [chosen, setSource] = useState<WatchlistSource | null>(null);

  const activeSource = resolveActiveWatchlistSource(
    streamystatsShown,
    kefinShown,
    chosen ?? DEFAULT_SOURCE,
  );

  return {
    activeSource,
    setSource,
    showToggle: streamystatsShown && kefinShown,
  };
}

/** The labelled sources for the tab's source toggle, mobile and TV alike. */
export function useWatchlistSourceOptions() {
  const { t } = useTranslation();
  return useMemo(
    () => [
      {
        value: "streamystats" as const,
        label: t("watchlists.source_streamystats"),
      },
      { value: "kefin" as const, label: t("watchlists.source_kefintweaks") },
    ],
    [t],
  );
}

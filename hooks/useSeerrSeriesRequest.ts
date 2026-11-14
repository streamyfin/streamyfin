import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { useSegments } from "expo-router";
import { useAtomValue } from "jotai";
import { useMemo } from "react";
import useRouter from "@/hooks/useAppRouter";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { useSeerr } from "@/hooks/useSeerr";
import { apiAtom } from "@/providers/JellyfinProvider";
import { useOfflineMode } from "@/providers/OfflineModeProvider";
import { getPrimaryImageUrl } from "@/utils/jellyfin/image/getPrimaryImageUrl";
import { seerrSeriesPageParams } from "@/utils/seerr/seriesRequest";

/**
 * Opens a library series on its Seerr page, where the missing seasons can be
 * requested. Undefined when there is nothing to open: Seerr is not signed in,
 * the page is offline, or Seerr cannot identify the series.
 */
export const useSeerrSeriesRequest = (
  item: BaseItemDto,
): (() => void) | undefined => {
  const { seerrApi } = useSeerr();
  const api = useAtomValue(apiAtom);
  const isOffline = useOfflineMode();
  // Offline mode is a route flag, not connectivity: without a connection the
  // Seerr page this opens can never answer its details query.
  const { isConnected } = useNetworkStatus();
  const router = useRouter();
  const segments = useSegments();
  const segment = (segments as string[])[2];
  // Narrow to a literal union: the template pathname below is only a valid
  // Href when `from` is one of the tab groups the route lives in.
  const from =
    segment === "(search)" ||
    segment === "(libraries)" ||
    segment === "(more)" ||
    segment === "(tv-favorites)" ||
    segment === "(tv-watchlists)"
      ? segment
      : "(home)";

  return useMemo(() => {
    if (!seerrApi || isOffline || !isConnected) return undefined;

    const params = seerrSeriesPageParams({
      item,
      posterSrc: getPrimaryImageUrl({ api, item }) ?? "",
    });
    if (!params) return undefined;

    return () =>
      router.push({
        pathname: `/(auth)/(tabs)/${from}/seerr/page`,
        params: { ...params },
      });
  }, [seerrApi, isOffline, isConnected, item, api, router, from]);
};

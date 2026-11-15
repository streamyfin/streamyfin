import { getShowApi } from "@jellyfin/sdk/lib/utils/api";
import { useQuery } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { Platform } from "react-native";
import { useDownload } from "@/providers/DownloadProvider";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import {
  buildOfflineSeriesFromEpisodes,
  downloadsKeyPart,
  getDownloadedEpisodesForSeries,
  keepThroughDownloadRefresh,
} from "@/utils/downloads/offline-series";
import { isJellyfinItem, refetchUnlessItem } from "@/utils/jellyfin/jellyfin";
import { getUserItemData } from "@/utils/jellyfin/user-library/getUserItemData";

/**
 * The series page's two queries: the series and every episode of it. Online
 * they come from the server and the downloads play no part in their keys.
 * Offline they are built from the downloaded episodes, read again on every
 * download refresh, and keep their answer on screen while they do.
 * Covered by useSeriesQueries.test.tsx.
 */
export function useSeriesQueries(seriesId: string, isOffline: boolean) {
  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);
  const { getDownloadedItems, refreshKey } = useDownload();

  const seriesKey = [
    "series",
    seriesId,
    isOffline,
    downloadsKeyPart(isOffline, refreshKey),
  ];
  const { data: item } = useQuery({
    queryKey: seriesKey,
    queryFn: async () => {
      if (isOffline) {
        return buildOfflineSeriesFromEpisodes(getDownloadedItems(), seriesId);
      }
      return await getUserItemData({
        api,
        userId: user?.Id,
        itemId: seriesId,
      });
    },
    placeholderData: keepThroughDownloadRefresh(seriesKey),
    // A cache saved by an earlier version can hold an answer that was not an
    // item: read as none, and fetched again on mount even while fresh.
    select: (data) => (isJellyfinItem(data) ? data : null),
    refetchOnMount: refetchUnlessItem,
    staleTime: isOffline ? Infinity : 60 * 1000,
    refetchInterval: !isOffline && Platform.isTV ? 60 * 1000 : undefined,
    enabled: isOffline || (!!api && !!user?.Id),
  });

  const episodesKey = [
    "AllEpisodes",
    seriesId,
    isOffline,
    downloadsKeyPart(isOffline, refreshKey),
  ];
  const { data: allEpisodes, isLoading } = useQuery({
    queryKey: episodesKey,
    queryFn: async () => {
      if (isOffline) {
        return getDownloadedEpisodesForSeries(getDownloadedItems(), seriesId);
      }
      if (!api || !user?.Id) return [];

      const res = await getShowApi(api).getEpisodes({
        seriesId: seriesId,
        userId: user.Id,
        enableUserData: true,
        fields: ["MediaSources", "MediaStreams", "Overview", "Trickplay"],
      });
      return res?.data.Items || [];
    },
    placeholderData: keepThroughDownloadRefresh(episodesKey),
    select: (data) =>
      [...(data || [])].sort(
        (a, b) =>
          (a.ParentIndexNumber ?? 0) - (b.ParentIndexNumber ?? 0) ||
          (a.IndexNumber ?? 0) - (b.IndexNumber ?? 0),
      ),
    staleTime: isOffline ? Infinity : 60 * 1000,
    refetchInterval: !isOffline && Platform.isTV ? 60 * 1000 : undefined,
    enabled: isOffline || (!!api && !!user?.Id),
  });

  return { item, allEpisodes, isLoading };
}

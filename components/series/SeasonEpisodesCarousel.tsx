import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { getTvShowsApi } from "@jellyfin/sdk/lib/utils/api";
import { useQuery } from "@tanstack/react-query";
import { useAtom } from "jotai";
import { useMemo } from "react";
import { View, type ViewStyle } from "react-native";
import { CardRow } from "@/components/cards/CardRow";
import useRouter from "@/hooks/useAppRouter";
import { useDownload } from "@/providers/DownloadProvider";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { useOfflineMode } from "@/providers/OfflineModeProvider";
import { getDownloadedEpisodesBySeasonId } from "@/utils/downloads/offline-series";

interface Props {
  item?: BaseItemDto | null;
  loading?: boolean;
  style?: ViewStyle;
  containerStyle?: ViewStyle;
}

export const SeasonEpisodesCarousel: React.FC<Props> = ({
  item,
  loading,
  style,
  containerStyle,
}) => {
  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);
  const router = useRouter();
  const isOffline = useOfflineMode();
  // Read the live (cached) downloads DB inside the query rather than the
  // provider's downloadedItems snapshot, so refetches after
  // updateDownloadedItem() reflect the latest state instead of a stale
  // refreshKey-gated snapshot. getAllDownloadedItems() is cached, so this stays cheap.
  const { getDownloadedItems } = useDownload();

  const seasonId = useMemo(() => {
    return item?.SeasonId;
  }, [item]);

  const { data: episodes, isPending } = useQuery({
    queryKey: ["episodes", seasonId, isOffline],
    queryFn: async () => {
      if (isOffline) {
        return getDownloadedEpisodesBySeasonId(getDownloadedItems(), seasonId!);
      }
      if (!api || !user?.Id || !item?.SeriesId) return [];
      const response = await getTvShowsApi(api).getEpisodes({
        userId: user.Id,
        seasonId: seasonId || undefined,
        seriesId: item.SeriesId,
        enableUserData: true,
        fields: [
          "ItemCounts",
          "PrimaryImageAspectRatio",
          "CanDelete",
          "MediaSourceCount",
          "Overview",
        ],
      });
      return response.data.Items as BaseItemDto[];
    },
    enabled: !!seasonId && (isOffline || (!!api && !!user?.Id)),
  });

  return (
    <View style={[containerStyle, style]}>
      <CardRow
        kind='episode'
        items={episodes ?? []}
        useEpisodePoster
        loading={loading || isPending}
        // Everything but the episode being viewed is faded back.
        selectedId={item?.Id}
        scrollToId={item?.Type === "Episode" ? item?.Id : null}
        // Swaps the item shown by the page rather than navigating.
        onPressItem={(episode) => router.setParams({ id: episode.Id })}
      />
    </View>
  );
};

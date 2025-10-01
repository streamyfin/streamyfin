import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { getTvShowsApi } from "@jellyfin/sdk/lib/utils/api";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useAtom } from "jotai";
import { useEffect, useMemo, useRef } from "react";
import { TouchableOpacity, type ViewProps } from "react-native";
import { useDownload } from "@/providers/DownloadProvider";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import ContinueWatchingPoster from "../ContinueWatchingPoster";
import {
  HorizontalScroll,
  type HorizontalScrollRef,
} from "../common/HorizontalScroll";
import { ItemCardText } from "../ItemCardText";

interface Props extends ViewProps {
  item?: BaseItemDto | null;
  loading?: boolean;
  isOffline?: boolean;
}

export const SeasonEpisodesCarousel: React.FC<Props> = ({
  item,
  loading,
  isOffline,
  ...props
}) => {
  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);
  const { getDownloadedItems } = useDownload();
  const downloadedFiles = useMemo(
    () => getDownloadedItems(),
    [getDownloadedItems],
  );

  const scrollRef = useRef<HorizontalScrollRef>(null);

  const scrollToIndex = (index: number) => {
    scrollRef.current?.scrollToIndex(index, 16);
  };

  const seasonId = useMemo(() => {
    return item?.SeasonId;
  }, [item]);

  const { data: episodes, isPending } = useQuery({
    queryKey: ["episodes", seasonId, isOffline],
    queryFn: async () => {
      if (isOffline) {
        return downloadedFiles
          ?.filter(
            (f) => f.item.Type === "Episode" && f.item.SeasonId === seasonId,
          )
          .map((f) => f.item);
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
    enabled: !!api && !!user?.Id && !!seasonId,
  });

  useEffect(() => {
    if (item?.Type === "Episode" && item.Id) {
      const index = episodes?.findIndex((ep) => ep.Id === item.Id);
      if (index !== undefined && index !== -1) {
        setTimeout(() => {
          scrollToIndex(index);
        }, 400);
      }
    }
  }, [episodes, item]);

  return (
    <HorizontalScroll
      ref={scrollRef}
      data={episodes}
      extraData={item}
      loading={loading || isPending}
      renderItem={(_item, _idx) => (
        <TouchableOpacity
          key={_item.Id}
          onPress={() => {
            router.setParams({ id: _item.Id });
          }}
          className={`flex flex-col w-44 
                  ${item?.Id === _item.Id ? "" : "opacity-50"}
                `}
        >
          <ContinueWatchingPoster item={_item} useEpisodePoster />
          <ItemCardText item={_item} />
        </TouchableOpacity>
      )}
      {...props}
    />
  );
};

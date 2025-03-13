import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { getUserItemData } from "@/utils/jellyfin/user-library/getUserItemData";
import { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useAtom } from "jotai";
import { useEffect, useMemo, useRef } from "react";
import { TouchableOpacity, View, ViewProps, Platform } from "react-native";
import {
  HorizontalScroll,
  HorizontalScrollRef,
} from "../common/HorrizontalScroll";
import ContinueWatchingPoster from "../ContinueWatchingPoster";
import { ItemCardText } from "../ItemCardText";
import { TVFocusable } from "../common/TVFocusable";

interface Props extends ViewProps {
  item?: BaseItemDto | null;
  loading?: boolean;
}

export const SeasonEpisodesCarousel: React.FC<Props> = ({
  item,
  loading,
  ...props
}) => {
  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);

  const scrollRef = useRef<HorizontalScrollRef>(null);

  const scrollToIndex = (index: number) => {
    scrollRef.current?.scrollToIndex(index, 16);
  };

  const seasonId = useMemo(() => {
    return item?.SeasonId;
  }, [item]);

  const {
    data: episodes,
    isLoading,
    isFetching,
  } = useQuery({
    queryKey: ["episodes", seasonId],
    queryFn: async () => {
      if (!api || !user?.Id) return [];
      const response = await api.axiosInstance.get(
        `${api.basePath}/Shows/${item?.Id}/Episodes`,
        {
          params: {
            userId: user?.Id,
            seasonId,
            Fields:
              "ItemCounts,PrimaryImageAspectRatio,CanDelete,MediaSourceCount,Overview",
          },
          headers: {
            Authorization: `MediaBrowser DeviceId="${api.deviceInfo.id}", Token="${api.accessToken}"`,
          },
        },
      );

      return response.data.Items as BaseItemDto[];
    },
    enabled: !!api && !!user?.Id && !!seasonId,
  });

  /**
   * Prefetch previous and next episode
   */
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!item?.Id || !item.IndexNumber || !episodes || episodes.length === 0) {
      return;
    }

    const previousId = episodes?.find(
      (ep) => ep.IndexNumber === item.IndexNumber! - 1,
    )?.Id;
    if (previousId) {
      queryClient.prefetchQuery({
        queryKey: ["item", previousId],
        queryFn: async () =>
          await getUserItemData({
            api,
            userId: user?.Id,
            itemId: previousId,
          }),
        staleTime: 60 * 1000 * 5,
      });
    }

    const nextId = episodes?.find(
      (ep) => ep.IndexNumber === item.IndexNumber! + 1,
    )?.Id;
    if (nextId) {
      queryClient.prefetchQuery({
        queryKey: ["item", nextId],
        queryFn: async () =>
          await getUserItemData({
            api,
            userId: user?.Id,
            itemId: nextId,
          }),
        staleTime: 60 * 1000 * 5,
      });
    }
  }, [episodes, api, user?.Id, item]);

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

  const handleEpisodeSelect = (episode: BaseItemDto) => {
    router.setParams({ id: episode.Id });
  };

  const renderEpisode = (episode: BaseItemDto, index: number) => {
    const isCurrentEpisode = item?.Id === episode.Id;

    const content = (
      <View
        className={`flex flex-col w-44 ${isCurrentEpisode ? "" : "opacity-50"}`}
      >
        <ContinueWatchingPoster item={episode} useEpisodePoster />
        <ItemCardText item={episode} />
      </View>
    );

    if (Platform.isTV) {
      return (
        <TVFocusable
          key={episode.Id}
          hasTVPreferredFocus={isCurrentEpisode}
          onSelect={() => handleEpisodeSelect(episode)}
        >
          {content}
        </TVFocusable>
      );
    }

    return (
      <TouchableOpacity
        key={episode.Id}
        onPress={() => handleEpisodeSelect(episode)}
        className={`flex flex-col w-44 ${isCurrentEpisode ? "" : "opacity-50"}`}
      >
        {content}
      </TouchableOpacity>
    );
  };

  return (
    <HorizontalScroll
      ref={scrollRef}
      data={episodes}
      extraData={item}
      loading={loading || isLoading || isFetching}
      renderItem={renderEpisode}
      {...props}
    />
  );
};

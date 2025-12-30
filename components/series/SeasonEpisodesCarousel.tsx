import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useEffect, useMemo, useRef } from "react";
import { TouchableOpacity, type ViewStyle } from "react-native";
import { MediaSource } from "@/models/common/types";
import type { Episode } from "@/models/video/types";
import { useVideoApi } from "@/providers/MediaApiProvider";
import { useOfflineLibrary } from "@/providers/OfflineLibrary/OfflineLibraryProvider";
import ContinueWatchingPoster from "../ContinueWatchingPoster";
import {
  HorizontalScroll,
  type HorizontalScrollRef,
} from "../common/HorizontalScroll";
import { ItemCardText } from "../ItemCardText";

interface Props {
  item?: BaseItemDto | null;
  loading?: boolean;
  style?: ViewStyle;
  containerStyle?: ViewStyle;
}

/**
 * Episode carousel for a season
 * Uses unified Video API - automatically handles online/offline mode
 */
export const SeasonEpisodesCarousel: React.FC<Props> = ({
  item,
  loading,
  style,
  containerStyle,
}) => {
  // Use unified Video API - automatically switches between online/offline
  const videoApi = useVideoApi();
  const { offlineMode } = useOfflineLibrary();

  const scrollRef = useRef<HorizontalScrollRef>(null);

  const scrollToIndex = (index: number) => {
    scrollRef.current?.scrollToIndex(index, -16);
  };

  const seasonId = useMemo(() => {
    return item?.SeasonId;
  }, [item]);

  // Fetch episodes using unified API
  // Online mode: Fetches from Jellyfin server, enriches with download status
  // Offline mode: Returns only downloaded episodes
  const { data: episodes, isPending } = useQuery({
    queryKey: ["season-episodes", seasonId],
    queryFn: async (): Promise<Episode[]> => {
      if (!seasonId) return [];
      return videoApi.getSeasonEpisodes(seasonId);
    },
    enabled: !!seasonId,
  });

  useEffect(() => {
    if (item?.Type === "Episode" && item.Id) {
      const index = episodes?.findIndex((ep) => ep.id === item.Id);
      if (index !== undefined && index !== -1) {
        setTimeout(() => {
          scrollToIndex(index);
        }, 400);
      }
    }
  }, [episodes, item]);

  const snapOffsets = useMemo(() => {
    const itemWidth = 184; // w-44 (176px) + mr-2 (8px)
    return episodes?.map((_, index) => index * itemWidth) || [];
  }, [episodes]);

  return (
    <HorizontalScroll
      ref={scrollRef}
      data={episodes}
      extraData={item}
      loading={loading || isPending}
      style={style}
      containerStyle={containerStyle}
      renderItem={(episode, _idx) => {
        const isCurrentEpisode = item?.Id === episode.id;
        const isDownloaded = episode.source === MediaSource.Offline;

        // Opacity logic:
        // - Current episode: full opacity
        // - Other episodes: slightly dimmed
        // - In offline mode, unavailable episodes: greyed out
        const opacity = isCurrentEpisode
          ? ""
          : offlineMode && !isDownloaded
            ? "opacity-30"
            : "opacity-70";

        return (
          <TouchableOpacity
            key={episode.id}
            onPress={() => {
              router.setParams({ id: episode.id });
            }}
            className={`flex flex-col w-44 ${opacity}`}
          >
            {/* Use jellyfinItem for components that expect BaseItemDto */}
            <ContinueWatchingPoster
              item={episode.jellyfinItem}
              useEpisodePoster
            />
            <ItemCardText item={episode.jellyfinItem} />
          </TouchableOpacity>
        );
      }}
      snapToOffsets={snapOffsets}
      decelerationRate='fast'
    />
  );
};

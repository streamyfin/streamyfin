import { Ionicons } from "@expo/vector-icons";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useGlobalSearchParams } from "expo-router";
import { atom, useAtom } from "jotai";
import { useEffect, useMemo, useRef } from "react";
import { TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import ContinueWatchingPoster from "@/components/ContinueWatchingPoster";
import {
  HorizontalScroll,
  type HorizontalScrollRef,
} from "@/components/common/HorizontalScroll";
import { Text } from "@/components/common/Text";
import { Loader } from "@/components/Loader";
import {
  SeasonDropdown,
  type SeasonIndexState,
} from "@/components/series/SeasonDropdown";
import { MediaSource } from "@/models/common/types";
import type { Episode, Season } from "@/models/video/types";
import { useVideoApi } from "@/providers/MediaApiProvider";
import { useOfflineLibrary } from "@/providers/OfflineLibrary/OfflineLibraryProvider";
import { runtimeTicksToSeconds } from "@/utils/time";

type Props = {
  item: BaseItemDto;
  close: () => void;
  goToItem: (item: BaseItemDto) => void;
};

export const seasonIndexAtom = atom<SeasonIndexState>({});

/**
 * Episode list overlay for video player
 * Uses unified Video API - automatically handles online/offline mode
 */
export const EpisodeList: React.FC<Props> = ({ item, close, goToItem }) => {
  const videoApi = useVideoApi();
  const { offlineMode } = useOfflineLibrary();
  const [seasonIndexState, setSeasonIndexState] = useAtom(seasonIndexAtom);
  const scrollViewRef = useRef<HorizontalScrollRef>(null);
  const queryClient = useQueryClient();

  const scrollToIndex = (index: number) => {
    scrollViewRef.current?.scrollToIndex(index, 100);
  };

  const { offline } = useGlobalSearchParams<{
    offline: string;
  }>();
  const _isOffline = offline === "true";

  // Set the initial season index
  useEffect(() => {
    if (item.SeriesId) {
      setSeasonIndexState((prev) => ({
        ...prev,
        [item.ParentId ?? ""]: item.ParentIndexNumber ?? 0,
      }));
    }
  }, []);

  const seasonIndex = seasonIndexState[item.ParentId ?? ""];

  // Fetch seasons using unified API
  const { data: seasons } = useQuery({
    queryKey: ["series-seasons", item.SeriesId],
    queryFn: async (): Promise<Season[]> => {
      if (!item.SeriesId) return [];
      return videoApi.getSeriesSeasons(item.SeriesId);
    },
    enabled: !!item.SeriesId,
  });

  // Convert Season domain models to BaseItemDto for SeasonDropdown compatibility
  const seasonsAsBaseItems = useMemo(
    () => seasons?.map((s) => s.jellyfinItem) ?? [],
    [seasons],
  );

  const selectedSeasonId: string | null = useMemo(
    () =>
      seasons?.find((season) => season.seasonNumber === seasonIndex)?.id ??
      null,
    [seasons, seasonIndex],
  );

  // Fetch episodes using unified API
  const { data: episodes, isLoading: episodesLoading } = useQuery({
    queryKey: ["season-episodes", item.SeriesId, selectedSeasonId],
    queryFn: async (): Promise<Episode[]> => {
      if (!selectedSeasonId) return [];
      return videoApi.getSeasonEpisodes(selectedSeasonId);
    },
    enabled: !!selectedSeasonId,
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

  // Prefetch episode data
  useEffect(() => {
    for (const episode of episodes || []) {
      queryClient.prefetchQuery({
        queryKey: ["item", episode.id],
        queryFn: async () => episode.jellyfinItem,
        staleTime: 60 * 5 * 1000,
      });
    }
  }, [episodes]);

  // Scroll to the current item when episodes are fetched
  useEffect(() => {
    if (episodes && scrollViewRef.current) {
      const currentItemIndex = episodes.findIndex((e) => e.id === item.Id);
      if (currentItemIndex !== -1) {
        scrollViewRef.current.scrollToIndex(currentItemIndex, 16);
      }
    }
  }, [episodes, item.Id]);

  return (
    <SafeAreaView
      style={{
        position: "absolute",
        backgroundColor: "black",
        height: "100%",
        width: "100%",
      }}
    >
      <View className='flex-row items-center p-4 z-10'>
        {seasons && seasons.length > 0 && !episodesLoading && episodes && (
          <SeasonDropdown
            item={item}
            seasons={seasonsAsBaseItems}
            state={seasonIndexState}
            onSelect={(season) => {
              setSeasonIndexState((prev) => ({
                ...prev,
                [item.ParentId ?? ""]: season.IndexNumber,
              }));
            }}
          />
        )}
        <TouchableOpacity
          onPress={async () => {
            close();
          }}
          className='aspect-square flex flex-col bg-neutral-800/90 rounded-xl items-center justify-center p-2 ml-auto'
        >
          <Ionicons name='close' size={24} color='white' />
        </TouchableOpacity>
      </View>

      {!episodes || episodesLoading ? (
        <View
          style={{ flex: 1, justifyContent: "center", alignItems: "center" }}
        >
          <Loader />
        </View>
      ) : (
        <HorizontalScroll
          ref={scrollViewRef}
          data={episodes}
          height={800}
          extraData={item}
          renderItem={(episode, _idx) => {
            const isCurrentEpisode = item.Id === episode.id;
            const isDownloaded = episode.source === MediaSource.Offline;
            // Only grey out unavailable episodes in offline mode
            const shouldGreyOut = offlineMode && !isDownloaded;

            return (
              <View
                key={episode.id}
                className={`flex flex-col w-44 ${
                  isCurrentEpisode
                    ? ""
                    : shouldGreyOut
                      ? "opacity-30"
                      : "opacity-50"
                }`}
              >
                <TouchableOpacity
                  onPress={() => {
                    goToItem(episode.jellyfinItem);
                  }}
                >
                  <ContinueWatchingPoster
                    item={episode.jellyfinItem}
                    useEpisodePoster
                    showPlayButton={!isCurrentEpisode}
                  />
                </TouchableOpacity>
                <View className='shrink'>
                  <Text
                    numberOfLines={2}
                    style={{
                      lineHeight: 18,
                      height: 36,
                    }}
                  >
                    {episode.name}
                  </Text>
                  <Text numberOfLines={1} className='text-xs text-neutral-475'>
                    {`S${episode.seasonNumber?.toString()}:E${episode.episodeNumber?.toString()}`}
                  </Text>
                  <Text className='text-xs text-neutral-500'>
                    {runtimeTicksToSeconds(episode.jellyfinItem.RunTimeTicks)}
                  </Text>
                </View>
                <Text
                  numberOfLines={7}
                  className='text-xs text-neutral-500 shrink'
                >
                  {episode.overview}
                </Text>
              </View>
            );
          }}
          keyExtractor={(e: Episode) => e.id ?? ""}
          showsHorizontalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
};

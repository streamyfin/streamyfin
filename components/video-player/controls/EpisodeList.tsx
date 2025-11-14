import { Ionicons } from "@expo/vector-icons";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { getTvShowsApi } from "@jellyfin/sdk/lib/utils/api";
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
import { useDownload } from "@/providers/DownloadProvider";
import type { DownloadedItem } from "@/providers/Downloads/types";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { getUserItemData } from "@/utils/jellyfin/user-library/getUserItemData";
import { runtimeTicksToSeconds } from "@/utils/time";

type Props = {
  item: BaseItemDto;
  close: () => void;
  goToItem: (item: BaseItemDto) => void;
};

export const seasonIndexAtom = atom<SeasonIndexState>({});

export const EpisodeList: React.FC<Props> = ({ item, close, goToItem }) => {
  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);
  const [seasonIndexState, setSeasonIndexState] = useAtom(seasonIndexAtom);
  const scrollViewRef = useRef<HorizontalScrollRef>(null); // Reference to the HorizontalScroll
  const scrollToIndex = (index: number) => {
    scrollViewRef.current?.scrollToIndex(index, 100);
  };
  const { offline } = useGlobalSearchParams<{
    offline: string;
  }>();
  const isOffline = offline === "true";

  // Set the initial season index
  useEffect(() => {
    if (item.SeriesId) {
      setSeasonIndexState((prev) => ({
        ...prev,
        [item.ParentId ?? ""]: item.ParentIndexNumber ?? 0,
      }));
    }
  }, []);

  const { getDownloadedItems } = useDownload();
  const downloadedFiles = useMemo(
    () => getDownloadedItems(),
    [getDownloadedItems],
  );

  const seasonIndex = seasonIndexState[item.ParentId ?? ""];

  const { data: seasons } = useQuery({
    queryKey: ["seasons", item.SeriesId],
    queryFn: async () => {
      if (isOffline) {
        if (!item.SeriesId) return [];
        const seriesEpisodes = downloadedFiles?.filter(
          (f: DownloadedItem) => f.item.SeriesId === item.SeriesId,
        );
        const seasonNumbers = Array.from(
          new Set(
            seriesEpisodes
              ?.map((f: DownloadedItem) => f.item.ParentIndexNumber)
              .filter(Boolean),
          ),
        );
        // Create fake season objects
        return seasonNumbers.map((seasonNumber) => ({
          Id: seasonNumber?.toString(),
          IndexNumber: seasonNumber,
          Name: `Season ${seasonNumber}`,
          SeriesId: item.SeriesId,
        }));
      }

      if (!api || !user?.Id || !item.SeriesId) return [];
      const response = await getTvShowsApi(api).getSeasons({
        seriesId: item.SeriesId,
        userId: user.Id,
        fields: [
          "ItemCounts",
          "PrimaryImageAspectRatio",
          "CanDelete",
          "MediaSourceCount",
        ],
      });
      return response.data.Items;
    },
    enabled: isOffline
      ? !!item.SeriesId
      : !!api && !!user?.Id && !!item.SeasonId,
  });

  const selectedSeasonId: string | null = useMemo(
    () =>
      seasons
        ?.find((season: any) => season.IndexNumber === seasonIndex)
        ?.Id?.toString() || null,
    [seasons, seasonIndex],
  );

  const { data: episodes, isLoading: episodesLoading } = useQuery({
    queryKey: ["episodes", item.SeriesId, selectedSeasonId],
    queryFn: async () => {
      if (isOffline) {
        if (!item.SeriesId) return [];
        return downloadedFiles
          ?.filter(
            (f: DownloadedItem) =>
              f.item.SeriesId === item.SeriesId &&
              f.item.ParentIndexNumber === seasonIndex,
          )
          .map((f: DownloadedItem) => f.item);
      }
      if (!api || !user?.Id || !item.Id || !selectedSeasonId) return [];
      const res = await getTvShowsApi(api).getEpisodes({
        seriesId: item.SeriesId || "",
        userId: user.Id,
        seasonId: selectedSeasonId || undefined,
        enableUserData: true,
        fields: ["MediaSources", "MediaStreams", "Overview"],
      });

      return res.data.Items;
    },
    enabled: !!api && !!user?.Id && !!selectedSeasonId,
  });

  useEffect(() => {
    if (item?.Type === "Episode" && item.Id) {
      const index = episodes?.findIndex((ep: BaseItemDto) => ep.Id === item.Id);
      if (index !== undefined && index !== -1) {
        setTimeout(() => {
          scrollToIndex(index);
        }, 400);
      }
    }
  }, [episodes, item]);

  const queryClient = useQueryClient();
  useEffect(() => {
    for (const e of episodes || []) {
      queryClient.prefetchQuery({
        queryKey: ["item", e.Id],
        queryFn: async () => {
          if (!e.Id) return;
          const res = await getUserItemData({
            api,
            userId: user?.Id,
            itemId: e.Id,
          });
          return res;
        },
        staleTime: 60 * 5 * 1000,
      });
    }
  }, [episodes]);

  // Scroll to the current item when episodes are fetched
  useEffect(() => {
    if (episodes && scrollViewRef.current) {
      const currentItemIndex = episodes.findIndex((e) => e.Id === item.Id);
      if (currentItemIndex !== -1) {
        scrollViewRef.current.scrollToIndex(currentItemIndex, 16); // Adjust the scroll position based on item width
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
            seasons={seasons}
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
          // Note otherItem is the item that is being rendered, not the item that is currently selected
          renderItem={(otherItem, _idx) => (
            <View
              key={otherItem.Id}
              style={{}}
              className={`flex flex-col w-44 ${
                item.Id !== otherItem.Id ? "opacity-50" : ""
              }`}
            >
              <TouchableOpacity
                onPress={() => {
                  goToItem(otherItem);
                }}
              >
                <ContinueWatchingPoster
                  item={otherItem}
                  useEpisodePoster
                  showPlayButton={otherItem.Id !== item.Id}
                />
              </TouchableOpacity>
              <View className='shrink'>
                <Text
                  numberOfLines={2}
                  style={{
                    lineHeight: 18, // Adjust this value based on your text size
                    height: 36, // lineHeight * 2 for consistent two-line space
                  }}
                >
                  {otherItem.Name}
                </Text>
                <Text numberOfLines={1} className='text-xs text-neutral-475'>
                  {`S${otherItem.ParentIndexNumber?.toString()}:E${otherItem.IndexNumber?.toString()}`}
                </Text>
                <Text className='text-xs text-neutral-500'>
                  {runtimeTicksToSeconds(otherItem.RunTimeTicks)}
                </Text>
              </View>
              <Text
                numberOfLines={7}
                className='text-xs text-neutral-500 shrink'
              >
                {otherItem.Overview}
              </Text>
            </View>
          )}
          keyExtractor={(e: BaseItemDto) => e.Id ?? ""}
          showsHorizontalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  );
};

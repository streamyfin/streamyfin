import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { runtimeTicksToSeconds } from "@/utils/time";
import { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { atom, useAtom } from "jotai";
import { useEffect, useMemo, useState, useRef } from "react";
import { View, Platform } from "react-native";
import ContinueWatchingPoster from "../ContinueWatchingPoster";
import { DownloadItems, DownloadSingleItem } from "../DownloadItem";
import { Loader } from "../Loader";
import { Text } from "../common/Text";
import { getTvShowsApi } from "@jellyfin/sdk/lib/utils/api";
import { getUserItemData } from "@/utils/jellyfin/user-library/getUserItemData";
import { TouchableItemRouter, itemRouter } from "../common/TouchableItemRouter";
import { Ionicons } from "@expo/vector-icons";
import { PlayedStatus } from "../PlayedStatus";
import { useTranslation } from "react-i18next";
import { TVFocusable } from "../common/TVFocusable";
import { router, useSegments } from "expo-router";

type Props = {
  item: BaseItemDto;
  initialSeasonIndex?: number;
};

export const seasonIndexAtom = atom<SeasonIndexState>({});

type SeasonIndexState = {
  [key: string]: number | string;
};

export const SeasonPicker: React.FC<Props> = ({ item, initialSeasonIndex }) => {
  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);
  const { t } = useTranslation();
  const segments = useSegments();
  const from = segments[2];

  // Use a ref to track if we've initialized the season
  const initializedRef = useRef(false);

  // Local state for selected season ID
  const [selectedSeasonId, setSelectedSeasonId] = useState<string | null>(null);

  const { data: seasons, isLoading: loadingSeasons } = useQuery({
    queryKey: ["seasons", item.Id],
    queryFn: async () => {
      if (!api || !user?.Id || !item.Id) return [];

      try {
        const response = await api.axiosInstance.get(
          `${api.basePath}/Shows/${item.Id}/Seasons`,
          {
            params: {
              userId: user?.Id,
              itemId: item.Id,
              Fields: "ItemCounts,PrimaryImageAspectRatio,CanDelete,MediaSourceCount",
            },
            headers: {
              Authorization: `MediaBrowser DeviceId="${api.deviceInfo.id}", Token="${api.accessToken}"`,
            },
          }
        );

        return response.data.Items || [];
      } catch (error) {
        console.error(`Error fetching seasons:`, error);
        return [];
      }
    },
    staleTime: 60,
    enabled: !!api && !!user?.Id && !!item.Id,
  });

  // Initialize the selected season once when seasons are loaded
  useEffect(() => {
    if (seasons && seasons.length > 0 && !initializedRef.current) {
      // Set the first season as default
      const firstSeason = seasons[0];
      setSelectedSeasonId(firstSeason.Id || null);
      initializedRef.current = true;
    }
  }, [seasons]);

  const { data: episodes, isFetching } = useQuery({
    queryKey: ["episodes", item.Id, selectedSeasonId],
    queryFn: async () => {
      if (!api || !user?.Id || !item.Id || !selectedSeasonId) {
        return [];
      }

      try {
        const res = await getTvShowsApi(api).getEpisodes({
          seriesId: item.Id,
          userId: user.Id,
          seasonId: selectedSeasonId,
          enableUserData: true,
          fields: ["MediaSources", "MediaStreams", "Overview"],
        });

        return res.data.Items || [];
      } catch (error) {
        console.error(`Error fetching episodes:`, error);
        return [];
      }
    },
    enabled: !!api && !!user?.Id && !!item.Id && !!selectedSeasonId,
  });

  const queryClient = useQueryClient();
  useEffect(() => {
    for (let e of episodes || []) {
      if (e.Id) {
        queryClient.prefetchQuery({
          queryKey: ["item", e.Id],
          queryFn: async () => {
            return await getUserItemData({
              api,
              userId: user?.Id,
              itemId: e.Id!,
            });
          },
          staleTime: 60 * 5 * 1000,
        });
      }
    }
  }, [episodes, api, user?.Id, queryClient]);

  // Used for height calculation
  const [nrOfEpisodes, setNrOfEpisodes] = useState(0);
  useEffect(() => {
    if (episodes && episodes.length > 0) {
      setNrOfEpisodes(episodes.length);
    }
  }, [episodes]);

  if (loadingSeasons) {
    return (
      <View className="flex flex-col items-center justify-center py-8">
        <Loader />
        <Text className="mt-4 text-neutral-500">{t("library.options.loading")}</Text>
      </View>
    );
  }

  if (!seasons || seasons.length === 0) {
    return (
      <View className="flex flex-col items-center justify-center py-8">
        <Text className="text-neutral-500">{t("item_card.no_seasons_available")}</Text>
      </View>
    );
  }

  // Find the currently selected season object
  const selectedSeason = seasons.find(s => s.Id === selectedSeasonId) || seasons[0];
  const currentIndex = seasons.findIndex(s => s.Id === selectedSeason.Id);

  const handlePrevious = () => {
    const prevIndex = currentIndex > 0 ? currentIndex - 1 : seasons.length - 1;
    const prevSeason = seasons[prevIndex];
    if (prevSeason.Id) {
      setSelectedSeasonId(prevSeason.Id);
    }
  };

  const handleNext = () => {
    const nextIndex = (currentIndex + 1) % seasons.length;
    const nextSeason = seasons[nextIndex];
    if (nextSeason.Id) {
      setSelectedSeasonId(nextSeason.Id);
    }
  };

  const handleEpisodeSelect = (episode: BaseItemDto) => {
    if (episode.Id && from) {
      const url = itemRouter(episode, from);
      router.push(url as any);
    }
  };

  return (
    <View
      style={{
        minHeight: Math.max(144, 144 * (nrOfEpisodes || 1)),
      }}
    >
      <View className="flex flex-row justify-start items-center px-4">
        <View className="flex flex-row items-center">
          <TVFocusable
            hasTVPreferredFocus={true}
            onSelect={handlePrevious}
          >
            <View className="flex items-center justify-center bg-neutral-900 rounded-xl p-2 mr-2">
              <Ionicons name="chevron-back" size={20} color="white" />
            </View>
          </TVFocusable>

          <View className="flex items-center justify-center bg-neutral-800 rounded-xl px-4 py-2 mx-1">
            <Text>{selectedSeason.Name}</Text>
          </View>

          <TVFocusable
            onSelect={handleNext}
          >
            <View className="flex items-center justify-center bg-neutral-900 rounded-xl p-2 ml-2">
              <Ionicons name="chevron-forward" size={20} color="white" />
            </View>
          </TVFocusable>
        </View>

        {episodes?.length ? (
          <View className="flex flex-row items-center space-x-2">
            {Platform.isTV ? (
              <TVFocusable onSelect={() => {
                // Handle download action
              }}>
                <View className="ml-2 p-2 bg-neutral-900 rounded-xl">
                  <Ionicons name="download" size={20} color="white" />
                </View>
              </TVFocusable>
            ) : (
              <DownloadItems
                title={t("item_card.download.download_season")}
                className="ml-2"
                items={episodes}
                MissingDownloadIconComponent={() => (
                  <Ionicons name="download" size={20} color="white" />
                )}
                DownloadedIconComponent={() => (
                  <Ionicons name="download" size={20} color="#9333ea" />
                )}
              />
            )}
            <PlayedStatus items={episodes} />
          </View>
        ) : null}
      </View>
      <View className="px-4 flex flex-col mt-4">
        {isFetching ? (
          <View
            style={{
              minHeight: 144 * Math.max(1, nrOfEpisodes),
            }}
            className="flex flex-col items-center justify-center"
          >
            <Loader />
          </View>
        ) : (
          episodes?.map((episode: BaseItemDto, index: number) => (
            <TVFocusable 
              key={episode.Id}
              onSelect={() => handleEpisodeSelect(episode)}
            >
              <View className="flex flex-col mb-4">
                <View className="flex flex-row items-start mb-2">
                  <View className="mr-2">
                    <ContinueWatchingPoster
                      size="small"
                      item={episode}
                      useEpisodePoster
                    />
                  </View>
                  <View className="shrink">
                    <Text numberOfLines={2} className="">
                      {episode.Name}
                    </Text>
                    <Text numberOfLines={1} className="text-xs text-neutral-500">
                      {`S${episode.ParentIndexNumber?.toString()}:E${episode.IndexNumber?.toString()}`}
                    </Text>
                    <Text className="text-xs text-neutral-500">
                      {runtimeTicksToSeconds(episode.RunTimeTicks)}
                    </Text>
                  </View>
                  <View className="self-start ml-auto -mt-0.5">
                    <DownloadSingleItem item={episode} />
                  </View>
                </View>

                <Text
                  numberOfLines={3}
                  className="text-xs text-neutral-500 shrink"
                >
                  {episode.Overview}
                </Text>
              </View>
            </TVFocusable>
          ))
        )}
        {(episodes?.length || 0) === 0 && !isFetching ? (
          <View className="flex flex-col items-center justify-center py-8">
            <Text className="text-neutral-500">
              {t("item_card.no_episodes_for_this_season")}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
};
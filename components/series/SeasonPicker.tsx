import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { runtimeTicksToSeconds } from "@/utils/time";
import { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { atom, useAtom } from "jotai";
import { useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import ContinueWatchingPoster from "../ContinueWatchingPoster";
import {DownloadItems, DownloadSingleItem} from "../DownloadItem";
import { Loader } from "../Loader";
import { Text } from "../common/Text";
import { getTvShowsApi } from "@jellyfin/sdk/lib/utils/api";
import { getUserItemData } from "@/utils/jellyfin/user-library/getUserItemData";
import { TouchableItemRouter } from "../common/TouchableItemRouter";
import {SeasonDropdown, SeasonIndexState} from "@/components/series/SeasonDropdown";
import {Ionicons, MaterialCommunityIcons} from "@expo/vector-icons";

type Props = {
  item: BaseItemDto;
  initialSeasonIndex?: number;
};

export const seasonIndexAtom = atom<SeasonIndexState>({});

export const SeasonPicker: React.FC<Props> = ({ item, initialSeasonIndex }) => {
  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);
  const [seasonIndexState, setSeasonIndexState] = useAtom(seasonIndexAtom);

  const seasonIndex = seasonIndexState[item.Id ?? ""];

  const { data: seasons } = useQuery({
    queryKey: ["seasons", item.Id],
    queryFn: async () => {
      if (!api || !user?.Id || !item.Id) return [];
      const response = await api.axiosInstance.get(
        `${api.basePath}/Shows/${item.Id}/Seasons`,
        {
          params: {
            userId: user?.Id,
            itemId: item.Id,
            Fields:
              "ItemCounts,PrimaryImageAspectRatio,CanDelete,MediaSourceCount",
          },
          headers: {
            Authorization: `MediaBrowser DeviceId="${api.deviceInfo.id}", Token="${api.accessToken}"`,
          },
        }
      );

      return response.data.Items;
    },
    enabled: !!api && !!user?.Id && !!item.Id,
  });

  const selectedSeasonId: string | null = useMemo(
    () =>
      seasons?.find((season: any) => season.IndexNumber === seasonIndex)?.Id,
    [seasons, seasonIndex]
  );

  const { data: episodes, isFetching } = useQuery({
    queryKey: ["episodes", item.Id, selectedSeasonId],
    queryFn: async () => {
      if (!api || !user?.Id || !item.Id || !selectedSeasonId) return [];
      const res = await getTvShowsApi(api).getEpisodes({
        seriesId: item.Id,
        userId: user.Id,
        seasonId: selectedSeasonId,
        enableUserData: true,
        fields: ["MediaSources", "MediaStreams", "Overview"],
      });

      return res.data.Items;
    },
    enabled: !!api && !!user?.Id && !!item.Id && !!selectedSeasonId,
  });

  const queryClient = useQueryClient();
  useEffect(() => {
    for (let e of episodes || []) {
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

  // Used for height calculation
  const [nrOfEpisodes, setNrOfEpisodes] = useState(0);
  useEffect(() => {
    if (episodes && episodes.length > 0) {
      setNrOfEpisodes(episodes.length);
    }
  }, [episodes]);

  return (
    <View
      style={{
        minHeight: 144 * nrOfEpisodes,
      }}
    >
      <View className="flex flex-row justify-start items-center">
        <SeasonDropdown
          item={item}
          seasons={seasons}
          state={seasonIndexState}
          onSelect={(season) => {
            setSeasonIndexState((prev) => ({
              ...prev,
              [item.Id ?? ""]: season.IndexNumber,
            }));
          }} />
        <DownloadItems
          items={episodes || []}
          MissingDownloadIconComponent={() => (
            <MaterialCommunityIcons name="download-multiple" size={24} color="white"/>
          )}
          DownloadedIconComponent={() => (
            <MaterialCommunityIcons name="check-all" size={24} color="#9333ea"/>
          )}
        />
      </View>
      <View className="px-4 flex flex-col my-4">
        {isFetching ? (
          <View
            style={{
              minHeight: 144 * nrOfEpisodes,
            }}
            className="flex flex-col items-center justify-center"
          >
            <Loader />
          </View>
        ) : (
          episodes?.map((e: BaseItemDto) => (
            <TouchableItemRouter
              item={e}
              key={e.Id}
              className="flex flex-col mb-4"
            >
              <View className="flex flex-row items-start mb-2">
                <View className="mr-2">
                  <ContinueWatchingPoster
                    size="small"
                    item={e}
                    useEpisodePoster
                  />
                </View>
                <View className="shrink">
                  <Text numberOfLines={2} className="">
                    {e.Name}
                  </Text>
                  <Text numberOfLines={1} className="text-xs text-neutral-500">
                    {`S${e.ParentIndexNumber?.toString()}:E${e.IndexNumber?.toString()}`}
                  </Text>
                  <Text className="text-xs text-neutral-500">
                    {runtimeTicksToSeconds(e.RunTimeTicks)}
                  </Text>
                </View>
                <View className="self-start ml-auto -mt-0.5">
                  <DownloadSingleItem item={e} />
                </View>
              </View>

              <Text
                numberOfLines={3}
                className="text-xs text-neutral-500 shrink"
              >
                {e.Overview}
              </Text>
            </TouchableItemRouter>
          ))
        )}
      </View>
    </View>
  );
};

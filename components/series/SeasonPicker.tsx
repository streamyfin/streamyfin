import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { runtimeTicksToSeconds } from "@/utils/time";
import { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { atom, useAtom } from "jotai";
import { useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import ContinueWatchingPoster from "../ContinueWatchingPoster";
import { DownloadItems, DownloadSingleItem } from "../DownloadItem";
import { Loader } from "../Loader";
import { Text } from "../common/Text";
import { getTvShowsApi } from "@jellyfin/sdk/lib/utils/api";
import { getUserItemData } from "@/utils/jellyfin/user-library/getUserItemData";
import { TouchableItemRouter } from "../common/TouchableItemRouter";
import {
  SeasonDropdown,
  SeasonIndexState,
} from "@/components/series/SeasonDropdown";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
type Props = {
  item: BaseItemDto;
  initialSeasonIndex?: number;
};

export const seasonIndexAtom = atom<SeasonIndexState>({});

export const SeasonPicker: React.FC<Props> = ({ item, initialSeasonIndex }) => {
  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);
  const [seasonIndexState, setSeasonIndexState] = useAtom(seasonIndexAtom);
  const { t } = useTranslation();

  const seasonIndex = useMemo(
    () => seasonIndexState[item.Id ?? ""],
    [item, seasonIndexState]
  );

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
    staleTime: 60,
    enabled: !!api && !!user?.Id && !!item.Id,
  });

  const selectedSeasonId: string | null = useMemo(() => {
    const season: BaseItemDto = seasons?.find(
      (s: BaseItemDto) =>
        s.IndexNumber === seasonIndex || s.Name === seasonIndex
    );

    if (!season?.Id) return null;

    return season.Id!;
  }, [seasons, seasonIndex]);

  const { data: episodes, isFetching } = useQuery({
    queryKey: ["episodes", item.Id, selectedSeasonId],
    queryFn: async () => {
      if (!api || !user?.Id || !item.Id || !selectedSeasonId) {
        return [];
      }

      const res = await getTvShowsApi(api).getEpisodes({
        seriesId: item.Id,
        userId: user.Id,
        seasonId: selectedSeasonId,
        enableUserData: true,
        fields: ["MediaSources", "MediaStreams", "Overview"],
      });

      if (res.data.TotalRecordCount === 0)
        console.warn(
          "No episodes found for season with ID ~",
          selectedSeasonId
        );

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
      <View className="flex flex-row justify-start items-center px-4">
        <SeasonDropdown
          item={item}
          seasons={seasons}
          state={seasonIndexState}
          onSelect={(season) => {
            if (!item.Id) return;
            setSeasonIndexState((prev) => ({
              ...prev,
              [item.Id!]: season.IndexNumber ?? season.Name,
            }));
          }}
        />
        {episodes?.length || 0 > 0 ? (
          <DownloadItems
            title={t("item_card.download.download_season")}
            className="ml-2"
            items={episodes || []}
            MissingDownloadIconComponent={() => (
              <Ionicons name="download" size={20} color="white" />
            )}
            DownloadedIconComponent={() => (
              <Ionicons name="download" size={20} color="#9333ea" />
            )}
          />
        ) : null}
      </View>
      <View className="px-4 flex flex-col mt-4">
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
        {(episodes?.length || 0) === 0 ? (
          <View className="flex flex-col">
            <Text className="text-neutral-500">
              {t("item_card.no_episodes_for_this_season")}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
};

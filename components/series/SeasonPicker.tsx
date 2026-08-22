import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { getTvShowsApi } from "@jellyfin/sdk/lib/utils/api";
import { useQuery } from "@tanstack/react-query";
import { atom, useAtom } from "jotai";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { HeaderIcon } from "@/components/common/HeaderIcon";
import {
  SeasonDropdown,
  type SeasonIndexState,
} from "@/components/series/SeasonDropdown";
import { Colors } from "@/constants/Colors";
import { useDownload } from "@/providers/DownloadProvider";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { useOfflineMode } from "@/providers/OfflineModeProvider";
import {
  buildOfflineSeasons,
  getDownloadedEpisodesForSeason,
} from "@/utils/downloads/offline-series";
import { runtimeTicksToSeconds } from "@/utils/time";
import { buildItemCards, type CardData } from "../cards/CardData";
import { CardListRow } from "../cards/CardListRow";
import { useItemCardBehavior } from "../cards/useItemCardBehavior";
import { Text } from "../common/Text";
import { DownloadItems, DownloadSingleItem } from "../DownloadItem";
import { Loader } from "../Loader";
import { PlayedStatus } from "../PlayedStatus";

type Props = {
  item: BaseItemDto;
  initialSeasonIndex?: number;
};

export const seasonIndexAtom = atom<SeasonIndexState>({});

export const SeasonPicker: React.FC<Props> = ({ item }) => {
  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);
  const [seasonIndexState, setSeasonIndexState] = useAtom(seasonIndexAtom);
  const { t } = useTranslation();
  const isOffline = useOfflineMode();
  const { getDownloadedItems, downloadedItems } = useDownload();

  const seasonIndex = useMemo(
    () => seasonIndexState[item.Id ?? ""],
    [item, seasonIndexState],
  );

  const { data: seasons } = useQuery({
    queryKey: ["seasons", item.Id, isOffline, downloadedItems.length],
    queryFn: async () => {
      if (isOffline) {
        return buildOfflineSeasons(getDownloadedItems(), item.Id!);
      }

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
        },
      );

      return response.data.Items;
    },
    staleTime: isOffline ? Infinity : 60,
    enabled: isOffline || (!!api && !!user?.Id && !!item.Id),
  });

  const selectedSeasonId: string | null = useMemo(() => {
    const season: BaseItemDto = seasons?.find(
      (s: BaseItemDto) =>
        s.IndexNumber === seasonIndex || s.Name === seasonIndex,
    );

    if (!season?.Id) return null;

    return season.Id!;
  }, [seasons, seasonIndex]);

  // For offline mode, we use season index number instead of ID
  const selectedSeasonNumber = useMemo(() => {
    if (!isOffline) return null;
    const season = seasons?.find(
      (s: BaseItemDto) =>
        s.IndexNumber === seasonIndex || s.Name === seasonIndex,
    );
    return season?.IndexNumber ?? null;
  }, [isOffline, seasons, seasonIndex]);

  const { data: episodes, isPending } = useQuery({
    queryKey: [
      "episodes",
      item.Id,
      isOffline ? selectedSeasonNumber : selectedSeasonId,
      isOffline,
      downloadedItems.length,
    ],
    queryFn: async () => {
      if (isOffline) {
        return getDownloadedEpisodesForSeason(
          getDownloadedItems(),
          item.Id!,
          selectedSeasonNumber!,
        );
      }

      if (!api || !user?.Id || !item.Id || !selectedSeasonId) {
        return [];
      }

      const res = await getTvShowsApi(api).getEpisodes({
        seriesId: item.Id,
        userId: user.Id,
        seasonId: selectedSeasonId,
        enableUserData: true,
        fields: ["MediaSources", "MediaStreams", "Overview", "Trickplay"],
      });

      if (res.data.TotalRecordCount === 0)
        console.warn(
          "No episodes found for season with ID ~",
          selectedSeasonId,
        );

      return res.data.Items;
    },
    staleTime: isOffline ? Infinity : 0,
    enabled: isOffline
      ? !!item.Id && selectedSeasonNumber !== null
      : !!api && !!user?.Id && !!item.Id && !!selectedSeasonId,
  });

  // Used for height calculation
  const [nrOfEpisodes, setNrOfEpisodes] = useState(0);
  useEffect(() => {
    if (episodes && episodes.length > 0) {
      setNrOfEpisodes(episodes.length);
    }
  }, [episodes]);

  const episodeById = useMemo(
    () => new Map((episodes ?? []).map((e) => [e.Id, e])),
    [episodes],
  );

  // The shared card, plus the runtime line a season list wants. Episodes here
  // keep their own still rather than the series poster.
  const episodeCards = useMemo(() => {
    const base = buildItemCards(episodes ?? [], {
      api,
      kind: "rowWide",
      useEpisodePoster: true,
    });
    return base.map((card) => ({
      ...card,
      detail: runtimeTicksToSeconds(episodeById.get(card.id)?.RunTimeTicks),
    }));
  }, [episodes, api, episodeById]);

  const { cards, handlePress, handleLongPress, actionSheet } =
    useItemCardBehavior({
      items: episodes ?? [],
      cards: episodeCards,
      kind: "rowWide",
      // The rows this replaced were TouchableItemRouters, which carried it.
      enableActionSheet: true,
    });

  const slots = useMemo(
    () => ({
      trailing: (card: CardData) => {
        const episode = episodeById.get(card.id);
        if (isOffline || !episode) return null;
        return <DownloadSingleItem item={episode} />;
      },
      footer: (card: CardData) => {
        const overview = episodeById.get(card.id)?.Overview;
        if (!overview) return null;
        return (
          <Text numberOfLines={3} className='text-xs text-neutral-500 mt-2'>
            {overview}
          </Text>
        );
      },
    }),
    [episodeById, isOffline],
  );

  return (
    <View
      style={{
        minHeight: 144 * nrOfEpisodes,
      }}
    >
      <View className='flex flex-row justify-start items-center px-4'>
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
        {episodes?.length && !isOffline ? (
          <View className='flex flex-row items-center space-x-2'>
            <DownloadItems
              title={t("item_card.download.download_season")}
              className='ml-2'
              items={episodes || []}
              MissingDownloadIconComponent={() => (
                <HeaderIcon name='downloads' size={18} />
              )}
              DownloadedIconComponent={() => (
                <HeaderIcon
                  name='downloaded'
                  tintColor={Colors.primary}
                  size={18}
                />
              )}
            />
            <PlayedStatus items={episodes || []} />
          </View>
        ) : null}
      </View>
      <View className='px-4 flex flex-col mt-4'>
        {isPending ? (
          <View
            style={{
              minHeight: 144 * nrOfEpisodes,
            }}
            className='flex flex-col items-center justify-center'
          >
            <Loader />
          </View>
        ) : (
          cards.map((card) => (
            <View key={card.id} className='mb-4'>
              <CardListRow
                card={card}
                slots={slots}
                onPress={() => handlePress(card.id)}
                onLongPress={
                  handleLongPress ? () => handleLongPress(card.id) : undefined
                }
              />
            </View>
          ))
        )}
        {(episodes?.length || 0) === 0 ? (
          <View className='flex flex-col'>
            <Text className='text-neutral-500'>
              {t("item_card.no_episodes_for_this_season")}
            </Text>
          </View>
        ) : null}
      </View>
      {actionSheet}
    </View>
  );
};

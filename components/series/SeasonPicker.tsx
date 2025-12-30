import { Ionicons } from "@expo/vector-icons";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { useQuery } from "@tanstack/react-query";
import { atom, useAtom } from "jotai";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import {
  SeasonDropdown,
  type SeasonIndexState,
} from "@/components/series/SeasonDropdown";
import { MediaSource } from "@/models/common/types";
import type { Episode, Season } from "@/models/video/types";
import { useVideoApi } from "@/providers/MediaApiProvider";
import { useOfflineLibrary } from "@/providers/OfflineLibrary/OfflineLibraryProvider";
import { runtimeTicksToSeconds } from "@/utils/time";
import ContinueWatchingPoster from "../ContinueWatchingPoster";
import { Text } from "../common/Text";
import { TouchableItemRouter } from "../common/TouchableItemRouter";
import { DownloadItems, DownloadSingleItem } from "../DownloadItem";
import { Loader } from "../Loader";
import { PlayedStatus } from "../PlayedStatus";

type Props = {
  item: BaseItemDto;
  initialSeasonIndex?: number;
};

export const seasonIndexAtom = atom<SeasonIndexState>({});

/**
 * Season picker component for TV series
 * Uses unified Video API - automatically handles online/offline mode
 */
export const SeasonPicker: React.FC<Props> = ({ item }) => {
  const videoApi = useVideoApi();
  const { offlineMode } = useOfflineLibrary();
  const [seasonIndexState, setSeasonIndexState] = useAtom(seasonIndexAtom);
  const { t } = useTranslation();

  const seasonIndex = useMemo(
    () => seasonIndexState[item.Id ?? ""],
    [item, seasonIndexState],
  );

  // Fetch seasons using unified API
  const { data: seasons } = useQuery({
    queryKey: ["series-seasons", item.Id],
    queryFn: async (): Promise<Season[]> => {
      if (!item.Id) return [];
      return videoApi.getSeriesSeasons(item.Id);
    },
    staleTime: 60,
    enabled: !!item.Id,
  });

  // Convert Season domain models to BaseItemDto for SeasonDropdown compatibility
  const seasonsAsBaseItems = useMemo(
    () => seasons?.map((s) => s.jellyfinItem) ?? [],
    [seasons],
  );

  const selectedSeasonId: string | null = useMemo(() => {
    const season = seasons?.find(
      (s) => s.seasonNumber === seasonIndex || s.name === seasonIndex,
    );
    return season?.id ?? null;
  }, [seasons, seasonIndex]);

  // Fetch episodes using unified API
  const { data: episodes, isPending } = useQuery({
    queryKey: ["season-episodes", item.Id, selectedSeasonId],
    queryFn: async (): Promise<Episode[]> => {
      if (!item.Id || !selectedSeasonId) return [];
      return videoApi.getSeasonEpisodes(selectedSeasonId);
    },
    enabled: !!item.Id && !!selectedSeasonId,
  });

  // Convert Episode domain models to BaseItemDto for component compatibility
  const episodesAsBaseItems = useMemo(
    () => episodes?.map((e) => e.jellyfinItem) ?? [],
    [episodes],
  );

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
      <View className='flex flex-row justify-start items-center px-4'>
        <SeasonDropdown
          item={item}
          seasons={seasonsAsBaseItems}
          state={seasonIndexState}
          onSelect={(season) => {
            if (!item.Id) return;
            setSeasonIndexState((prev) => ({
              ...prev,
              [item.Id!]: season.IndexNumber ?? season.Name,
            }));
          }}
        />
        {episodes?.length ? (
          <View className='flex flex-row items-center space-x-2'>
            <DownloadItems
              title={t("item_card.download.download_season")}
              className='ml-2'
              items={episodesAsBaseItems}
              MissingDownloadIconComponent={() => (
                <Ionicons name='download' size={20} color='white' />
              )}
              DownloadedIconComponent={() => (
                <Ionicons name='download' size={20} color='#9333ea' />
              )}
            />
            <PlayedStatus items={episodesAsBaseItems} />
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
          episodes?.map((episode) => {
            const isDownloaded = episode.source === MediaSource.Offline;
            // Only grey out unavailable episodes in offline mode
            const shouldGreyOut = offlineMode && !isDownloaded;

            return (
              <TouchableItemRouter
                item={episode.jellyfinItem}
                key={episode.id}
                className={`flex flex-col mb-4 ${shouldGreyOut ? "opacity-50" : ""}`}
              >
                <View className='flex flex-row items-start mb-2'>
                  <View className='mr-2'>
                    <ContinueWatchingPoster
                      size='small'
                      item={episode.jellyfinItem}
                      useEpisodePoster
                    />
                  </View>
                  <View className='shrink'>
                    <Text numberOfLines={2} className=''>
                      {episode.name}
                    </Text>
                    <Text
                      numberOfLines={1}
                      className='text-xs text-neutral-500'
                    >
                      {`S${episode.seasonNumber?.toString()}:E${episode.episodeNumber?.toString()}`}
                    </Text>
                    <Text className='text-xs text-neutral-500'>
                      {runtimeTicksToSeconds(episode.jellyfinItem.RunTimeTicks)}
                    </Text>
                  </View>
                  <View className='self-start ml-auto -mt-0.5'>
                    <DownloadSingleItem item={episode.jellyfinItem} />
                  </View>
                </View>

                <Text
                  numberOfLines={3}
                  className='text-xs text-neutral-500 shrink'
                >
                  {episode.overview}
                </Text>
              </TouchableItemRouter>
            );
          })
        )}
        {(episodes?.length || 0) === 0 ? (
          <View className='flex flex-col'>
            <Text className='text-neutral-500'>
              {t("item_card.no_episodes_for_this_season")}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
};

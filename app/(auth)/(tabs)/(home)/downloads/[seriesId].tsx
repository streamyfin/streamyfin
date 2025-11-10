import { Ionicons } from "@expo/vector-icons";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { FlashList } from "@shopify/flash-list";
import { router, useLocalSearchParams, useNavigation } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Platform, TouchableOpacity, View } from "react-native";
import { Text } from "@/components/common/Text";
import { EpisodeCard } from "@/components/downloads/EpisodeCard";
import {
  SeasonDropdown,
  type SeasonIndexState,
} from "@/components/series/SeasonDropdown";
import { useDownload } from "@/providers/DownloadProvider";
import { storage } from "@/utils/mmkv";

export default function page() {
  const navigation = useNavigation();
  const local = useLocalSearchParams();
  const { seriesId, episodeSeasonIndex } = local as {
    seriesId: string;
    episodeSeasonIndex: number | string | undefined;
  };

  const [seasonIndexState, setSeasonIndexState] = useState<SeasonIndexState>(
    {},
  );
  const { downloadedItems, deleteItems } = useDownload();

  const series = useMemo(() => {
    try {
      return (
        downloadedItems
          ?.filter((f) => f.item.SeriesId === seriesId)
          ?.sort(
            (a, b) =>
              (a.item.ParentIndexNumber ?? 0) - (b.item.ParentIndexNumber ?? 0),
          ) || []
      );
    } catch {
      return [];
    }
  }, [downloadedItems, seriesId]);

  // Group episodes by season in a single pass
  const seasonGroups = useMemo(() => {
    const groups: Record<number, BaseItemDto[]> = {};

    series.forEach((episode) => {
      const seasonNumber = episode.item.ParentIndexNumber;
      if (seasonNumber !== undefined && seasonNumber !== null) {
        if (!groups[seasonNumber]) {
          groups[seasonNumber] = [];
        }
        groups[seasonNumber].push(episode.item);
      }
    });

    // Sort episodes within each season
    Object.values(groups).forEach((episodes) => {
      episodes.sort((a, b) => (a.IndexNumber || 0) - (b.IndexNumber || 0));
    });

    return groups;
  }, [series]);

  // Get unique seasons (just the season numbers, sorted)
  const uniqueSeasons = useMemo(() => {
    const seasonNumbers = Object.keys(seasonGroups)
      .map(Number)
      .sort((a, b) => a - b);
    return seasonNumbers.map((seasonNum) => seasonGroups[seasonNum][0]); // First episode of each season
  }, [seasonGroups]);

  const seasonIndex =
    seasonIndexState[series?.[0]?.item?.ParentId ?? ""] ||
    episodeSeasonIndex ||
    "";

  const groupBySeason = useMemo<BaseItemDto[]>(() => {
    return seasonGroups[Number(seasonIndex)] ?? [];
  }, [seasonGroups, seasonIndex]);

  const initialSeasonIndex = useMemo(
    () =>
      Object.values(groupBySeason)?.[0]?.ParentIndexNumber ??
      series?.[0]?.item?.ParentIndexNumber,
    [groupBySeason],
  );

  useEffect(() => {
    if (series.length > 0) {
      navigation.setOptions({
        title: series[0].item.SeriesName,
      });
    } else {
      storage.remove(seriesId);
      router.back();
    }
  }, [series]);

  const deleteSeries = useCallback(() => {
    Alert.alert(
      "Delete season",
      "Are you sure you want to delete the entire season?",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Delete",
          onPress: () =>
            deleteItems(
              groupBySeason
                .map((item) => item.Id)
                .filter((id) => id !== undefined),
            ),
          style: "destructive",
        },
      ],
    );
  }, [groupBySeason, deleteItems]);

  return (
    <View style={{ paddingTop: Platform.OS === "android" ? 10 : 0 }}>
      {series.length > 0 && (
        <View className='flex flex-row items-center justify-start px-4 pb-2'>
          <SeasonDropdown
            item={series[0].item}
            seasons={uniqueSeasons}
            state={seasonIndexState}
            initialSeasonIndex={initialSeasonIndex!}
            onSelect={(season) => {
              setSeasonIndexState((prev) => ({
                ...prev,
                [series[0].item.ParentId ?? ""]: season.ParentIndexNumber,
              }));
            }}
          />
          <View className='bg-purple-600 rounded-full h-6 w-6 flex items-center justify-center ml-2'>
            <Text className='text-xs font-bold'>{groupBySeason.length}</Text>
          </View>
          <View className='bg-neutral-800/80 rounded-full h-9 w-9 flex items-center justify-center ml-auto'>
            <TouchableOpacity onPress={deleteSeries}>
              <Ionicons name='trash' size={20} color='white' />
            </TouchableOpacity>
          </View>
        </View>
      )}
      <FlashList
        key={seasonIndex}
        data={groupBySeason}
        renderItem={({ item }) => <EpisodeCard item={item} />}
        keyExtractor={(item, index) => item.Id ?? `episode-${index}`}
        contentContainerStyle={{ paddingHorizontal: 16 }}
      />
    </View>
  );
}

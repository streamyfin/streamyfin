import { Text } from "@/components/common/Text";
import { EpisodeCard } from "@/components/downloads/EpisodeCard";
import {
  SeasonDropdown,
  type SeasonIndexState,
} from "@/components/series/SeasonDropdown";
import { useDownload } from "@/providers/DownloadProvider";
import { storage } from "@/utils/mmkv";
import { Ionicons } from "@expo/vector-icons";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { router, useLocalSearchParams, useNavigation } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, ScrollView, TouchableOpacity, View } from "react-native";

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
  const { downloadedFiles, deleteItems } = useDownload();

  const series = useMemo(() => {
    try {
      return (
        downloadedFiles
          ?.filter((f) => f.item.SeriesId == seriesId)
          ?.sort(
            (a, b) => a?.item.ParentIndexNumber! - b.item.ParentIndexNumber!,
          ) || []
      );
    } catch {
      return [];
    }
  }, [downloadedFiles]);

  const seasonIndex =
    seasonIndexState[series?.[0]?.item?.ParentId ?? ""] ||
    episodeSeasonIndex ||
    "";

  const groupBySeason = useMemo<BaseItemDto[]>(() => {
    const seasons: Record<string, BaseItemDto[]> = {};

    series?.forEach((episode) => {
      if (!seasons[episode.item.ParentIndexNumber!]) {
        seasons[episode.item.ParentIndexNumber!] = [];
      }

      seasons[episode.item.ParentIndexNumber!].push(episode.item);
    });
    return (
      seasons[seasonIndex]?.sort((a, b) => a.IndexNumber! - b.IndexNumber!) ??
      []
    );
  }, [series, seasonIndex]);

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
      storage.delete(seriesId);
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
          onPress: () => deleteItems(groupBySeason),
          style: "destructive",
        },
      ],
    );
  }, [groupBySeason]);

  return (
    <View className='flex-1'>
      {series.length > 0 && (
        <View className='flex flex-row items-center justify-start my-2 px-4'>
          <SeasonDropdown
            item={series[0].item}
            seasons={series.map((s) => s.item)}
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
      <ScrollView key={seasonIndex} className='px-4'>
        {groupBySeason.map((episode, index) => (
          <EpisodeCard key={index} item={episode} />
        ))}
      </ScrollView>
    </View>
  );
}

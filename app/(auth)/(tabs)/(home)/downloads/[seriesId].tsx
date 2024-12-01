import {Text} from "@/components/common/Text";
import {useDownload} from "@/providers/DownloadProvider";
import {router, useLocalSearchParams, useNavigation} from "expo-router";
import React, {useEffect, useMemo, useState} from "react";
import {ScrollView, View} from "react-native";
import {EpisodeCard} from "@/components/downloads/EpisodeCard";
import {BaseItemDto} from "@jellyfin/sdk/lib/generated-client/models";
import {SeasonDropdown, SeasonIndexState} from "@/components/series/SeasonDropdown";
import {storage} from "@/utils/mmkv";

export default function page() {
  const navigation = useNavigation();
  const local = useLocalSearchParams();
  const {seriesId, episodeSeasonIndex} = local as {
    seriesId: string,
    episodeSeasonIndex: number | string | undefined
  };

  const [seasonIndexState, setSeasonIndexState] = useState<SeasonIndexState>({});
  const {downloadedFiles} = useDownload();

  const series = useMemo(() => {
    try {
      return downloadedFiles
          ?.filter((f) => f.item.SeriesId == seriesId)
          ?.sort((a, b) => a?.item.ParentIndexNumber! - b.item.ParentIndexNumber!)
          || [];
    } catch {
      return [];
    }
  }, [downloadedFiles]);

  const seasonIndex = seasonIndexState[series?.[0]?.item?.ParentId ?? ""] || episodeSeasonIndex || "";

  const groupBySeason = useMemo<BaseItemDto[]>(() => {
    const seasons: Record<string, BaseItemDto[]> = {};

    series?.forEach((episode) => {
      if (!seasons[episode.item.ParentIndexNumber!]) {
        seasons[episode.item.ParentIndexNumber!] = [];
      }

      seasons[episode.item.ParentIndexNumber!].push(episode.item);
    });
    return seasons[seasonIndex]
      ?.sort((a, b) => a.IndexNumber! - b.IndexNumber!)
      ?? []
  }, [series, seasonIndex]);

  const initialSeasonIndex = useMemo(() =>
      Object.values(groupBySeason)?.[0]?.ParentIndexNumber ?? series?.[0]?.item?.ParentIndexNumber,
    [groupBySeason]
  );

  useEffect(() => {
    if (series.length > 0) {
      navigation.setOptions({
        title: series[0].item.SeriesName,
      });
    }
    else {
      storage.delete(seriesId);
      router.back();
    }
  }, [series]);

  return (
    <>
      {series.length > 0 && <View className="my-4 flex flex-row items-center justify-start">
        <SeasonDropdown
          item={series[0].item}
          seasons={series.map(s => s.item)}
          state={seasonIndexState}
          initialSeasonIndex={initialSeasonIndex!}
          onSelect={(season) => {
            setSeasonIndexState((prev) => ({
              ...prev,
              [series[0].item.ParentId ?? ""]: season.ParentIndexNumber,
            }));
          }}/>
        <View className="bg-purple-600 rounded-full h-6 w-6 flex items-center justify-center">
          <Text className="text-xs font-bold">{groupBySeason.length}</Text>
        </View>
      </View>}
      <ScrollView key={seasonIndex}>
        {groupBySeason.map((episode) => (
          <View className="px-4 flex flex-col my-4">
            <EpisodeCard item={episode}/>
          </View>
        ))}
      </ScrollView>
    </>
  );
}
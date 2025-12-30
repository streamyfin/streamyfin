import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { useLocalSearchParams, useNavigation } from "expo-router";
import { useAtom } from "jotai";
import type React from "react";
import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Platform, View } from "react-native";
import { AddToFavorites } from "@/components/AddToFavorites";
import { DownloadItems } from "@/components/DownloadItem";
import { ParallaxScrollView } from "@/components/ParallaxPage";
import { NextUp } from "@/components/series/NextUp";
import { SeasonPicker } from "@/components/series/SeasonPicker";
import { SeriesHeader } from "@/components/series/SeriesHeader";
import { apiAtom } from "@/providers/JellyfinProvider";
import { useVideoApi } from "@/providers/MediaApiProvider";
import { getBackdropUrl } from "@/utils/jellyfin/image/getBackdropUrl";
import { getLogoImageUrlById } from "@/utils/jellyfin/image/getLogoImageUrlById";

const page: React.FC = () => {
  const navigation = useNavigation();
  const { t } = useTranslation();
  const params = useLocalSearchParams();
  const { id: seriesId, seasonIndex } = params as {
    id: string;
    seasonIndex: string;
  };

  const [api] = useAtom(apiAtom);
  const videoApi = useVideoApi();

  // Fetch series info using unified API (handles online/offline)
  const { data: series } = useQuery({
    queryKey: ["series", seriesId],
    queryFn: async () => videoApi.getSeriesById(seriesId),
    staleTime: 60 * 1000,
    enabled: !!seriesId,
  });

  // Get the underlying BaseItemDto for backward compatibility
  const item = series?.jellyfinItem;

  const backdropUrl = useMemo(
    () =>
      getBackdropUrl({
        api,
        item,
        quality: 90,
        width: 1000,
      }),
    [item],
  );

  const logoUrl = useMemo(
    () =>
      getLogoImageUrlById({
        api,
        item,
      }),
    [item],
  );

  // Fetch all episodes using unified API (handles online/offline)
  const { data: allEpisodes, isLoading } = useQuery({
    queryKey: ["AllEpisodes", seriesId],
    queryFn: async () => {
      if (!seriesId) return [];
      const episodes = await videoApi.getSeriesEpisodes(seriesId);
      // Return BaseItemDto array for DownloadItems compatibility
      return episodes.map((ep) => ep.jellyfinItem);
    },
    select: (data) =>
      // Sort by season and episode number for correct download order
      [...(data || [])].sort(
        (a, b) =>
          (a.ParentIndexNumber ?? 0) - (b.ParentIndexNumber ?? 0) ||
          (a.IndexNumber ?? 0) - (b.IndexNumber ?? 0),
      ),
    staleTime: 60,
    enabled: !!seriesId,
  });

  useEffect(() => {
    navigation.setOptions({
      headerRight: () =>
        !isLoading &&
        item &&
        allEpisodes &&
        allEpisodes.length > 0 && (
          <View className='flex flex-row items-center space-x-2'>
            <AddToFavorites item={item} />
            {!Platform.isTV && (
              <DownloadItems
                size='large'
                title={t("item_card.download.download_series")}
                items={allEpisodes || []}
                MissingDownloadIconComponent={() => (
                  <Ionicons name='download' size={22} color='white' />
                )}
                DownloadedIconComponent={() => (
                  <Ionicons
                    name='checkmark-done-outline'
                    size={24}
                    color='#9333ea'
                  />
                )}
              />
            )}
          </View>
        ),
    });
  }, [allEpisodes, isLoading, item]);

  if (!item || !backdropUrl) return null;

  return (
    <ParallaxScrollView
      headerHeight={400}
      headerImage={
        <Image
          source={{
            uri: backdropUrl,
          }}
          style={{
            width: "100%",
            height: "100%",
          }}
        />
      }
      logo={
        logoUrl ? (
          <Image
            source={{
              uri: logoUrl,
            }}
            style={{
              height: 130,
              width: "100%",
            }}
            contentFit='contain'
          />
        ) : undefined
      }
    >
      <View className='flex flex-col pt-4'>
        <SeriesHeader item={item} />
        <View className='mb-4'>
          <NextUp seriesId={seriesId} />
        </View>
        <SeasonPicker item={item} initialSeasonIndex={Number(seasonIndex)} />
      </View>
    </ParallaxScrollView>
  );
};

export default page;

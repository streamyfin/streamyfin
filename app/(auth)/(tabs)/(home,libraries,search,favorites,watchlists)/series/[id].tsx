import { Ionicons } from "@expo/vector-icons";
import { getTvShowsApi } from "@jellyfin/sdk/lib/utils/api";
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
import { TVSeriesPage } from "@/components/series/TVSeriesPage";
import { useDownload } from "@/providers/DownloadProvider";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { OfflineModeProvider } from "@/providers/OfflineModeProvider";
import {
  buildOfflineSeriesFromEpisodes,
  getDownloadedEpisodesForSeries,
} from "@/utils/downloads/offline-series";
import { getBackdropUrl } from "@/utils/jellyfin/image/getBackdropUrl";
import { getLogoImageUrlById } from "@/utils/jellyfin/image/getLogoImageUrlById";
import { getUserItemData } from "@/utils/jellyfin/user-library/getUserItemData";
import { storage } from "@/utils/mmkv";

const page: React.FC = () => {
  const navigation = useNavigation();
  const { t } = useTranslation();
  const params = useLocalSearchParams();
  const {
    id: seriesId,
    seasonIndex,
    offline: offlineParam,
  } = params as {
    id: string;
    seasonIndex: string;
    offline?: string;
  };

  const isOffline = offlineParam === "true";

  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);
  const { getDownloadedItems, downloadedItems } = useDownload();

  // For offline mode, construct series data from downloaded episodes
  // Include downloadedItems.length so query refetches when items are deleted
  const { data: item } = useQuery({
    queryKey: ["series", seriesId, isOffline, downloadedItems.length],
    queryFn: async () => {
      if (isOffline) {
        return buildOfflineSeriesFromEpisodes(getDownloadedItems(), seriesId);
      }
      return await getUserItemData({
        api,
        userId: user?.Id,
        itemId: seriesId,
      });
    },
    staleTime: isOffline ? Infinity : 60 * 1000,
    enabled: isOffline || (!!api && !!user?.Id),
  });

  // For offline mode, use stored base64 image
  const base64Image = useMemo(() => {
    if (isOffline) {
      return storage.getString(seriesId);
    }
    return null;
  }, [isOffline, seriesId]);

  const backdropUrl = useMemo(() => {
    if (isOffline && base64Image) {
      return `data:image/jpeg;base64,${base64Image}`;
    }
    return getBackdropUrl({
      api,
      item,
      quality: 90,
      width: 1000,
    });
  }, [isOffline, base64Image, api, item]);

  const logoUrl = useMemo(() => {
    if (isOffline) {
      return null; // No logo in offline mode
    }
    return getLogoImageUrlById({
      api,
      item,
    });
  }, [isOffline, api, item]);

  const { data: allEpisodes, isLoading } = useQuery({
    queryKey: ["AllEpisodes", seriesId, isOffline, downloadedItems.length],
    queryFn: async () => {
      if (isOffline) {
        return getDownloadedEpisodesForSeries(getDownloadedItems(), seriesId);
      }
      if (!api || !user?.Id) return [];

      const res = await getTvShowsApi(api).getEpisodes({
        seriesId: seriesId,
        userId: user.Id,
        enableUserData: true,
        fields: ["MediaSources", "MediaStreams", "Overview", "Trickplay"],
      });
      return res?.data.Items || [];
    },
    select: (data) =>
      [...(data || [])].sort(
        (a, b) =>
          (a.ParentIndexNumber ?? 0) - (b.ParentIndexNumber ?? 0) ||
          (a.IndexNumber ?? 0) - (b.IndexNumber ?? 0),
      ),
    staleTime: isOffline ? Infinity : 60,
    enabled: isOffline || (!!api && !!user?.Id),
  });

  useEffect(() => {
    // Don't show header buttons in offline mode
    if (isOffline) {
      navigation.setOptions({
        headerRight: () => null,
      });
      return;
    }

    navigation.setOptions({
      headerRight: () =>
        !isLoading && item && allEpisodes && allEpisodes.length > 0 ? (
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
        ) : null,
    });
  }, [allEpisodes, isLoading, item, isOffline]);

  // For offline mode, we can show the page even without backdropUrl
  if (!item || (!isOffline && !backdropUrl)) return null;

  // TV version
  if (Platform.isTV) {
    return (
      <OfflineModeProvider isOffline={isOffline}>
        <TVSeriesPage
          item={item}
          allEpisodes={allEpisodes}
          isLoading={isLoading}
        />
      </OfflineModeProvider>
    );
  }

  return (
    <OfflineModeProvider isOffline={isOffline}>
      <ParallaxScrollView
        headerHeight={400}
        headerImage={
          backdropUrl ? (
            <Image
              source={{
                uri: backdropUrl,
              }}
              style={{
                width: "100%",
                height: "100%",
              }}
            />
          ) : (
            <View
              style={{
                width: "100%",
                height: "100%",
                backgroundColor: "#1a1a1a",
              }}
            />
          )
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
          {!isOffline && (
            <View className='mb-4'>
              <NextUp seriesId={seriesId} />
            </View>
          )}
          <SeasonPicker item={item} initialSeasonIndex={Number(seasonIndex)} />
        </View>
      </ParallaxScrollView>
    </OfflineModeProvider>
  );
};

export default page;

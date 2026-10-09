import { getTvShowsApi } from "@jellyfin/sdk/lib/utils/api";
import { useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useNavigation } from "expo-router";
import { useAtom } from "jotai";
import type React from "react";
import { useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Platform, useWindowDimensions, View } from "react-native";
import { AddToFavorites } from "@/components/AddToFavorites";
import {
  HeaderButton,
  HeaderButtonGroup,
} from "@/components/common/HeaderButton";
import { HeaderIcon } from "@/components/common/HeaderIcon";
import { Image } from "@/components/common/ServerImage";
import { DownloadItems } from "@/components/DownloadItem";
import { ParallaxScrollView } from "@/components/ParallaxPage";
import { SimilarItems } from "@/components/SimilarItems";
import { NextUp } from "@/components/series/NextUp";
import {
  SeasonPicker,
  seasonIndexAtom,
} from "@/components/series/SeasonPicker";
import { SeriesHeader } from "@/components/series/SeriesHeader";
import { TVSeriesPage } from "@/components/series/TVSeriesPage";
import { SyncPlayButton } from "@/components/syncplay/SyncPlayButton";
import { Colors } from "@/constants/Colors";
import { LOGO_HEIGHT } from "@/constants/Images";
import { useLeaveWhenGone } from "@/hooks/useLeaveWhenGone";
import { useShuffleQueue } from "@/hooks/useShuffleQueue";
import { useDownload } from "@/providers/DownloadProvider";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { OfflineModeProvider } from "@/providers/OfflineModeProvider";
import {
  buildOfflineSeriesFromEpisodes,
  getDownloadedEpisodesForSeries,
} from "@/utils/downloads/offline-series";
import { getBackdropUrl } from "@/utils/jellyfin/image/getBackdropUrl";
import { getLogoImageUrlById } from "@/utils/jellyfin/image/getLogoImageUrlById";
import { toImagePixels } from "@/utils/jellyfin/image/imagePixels";
import { getUserItemData } from "@/utils/jellyfin/user-library/getUserItemData";
import { storage } from "@/utils/mmkv";
import { getSeriesPlaybackTarget } from "@/utils/seriesPlaybackTarget";

// Height of the backdrop header, in layout points.
const HEADER_HEIGHT = 400;

const page: React.FC = () => {
  const navigation = useNavigation();
  const { t } = useTranslation();
  const { width: windowWidth } = useWindowDimensions();
  const params = useLocalSearchParams();
  const {
    id: seriesId,
    seasonIndex,
    offline: offlineParam,
  } = params as {
    id: string;
    seasonIndex?: string;
    offline?: string;
  };

  const isOffline = offlineParam === "true";
  const [, setSeasonIndexState] = useAtom(seasonIndexAtom);
  const processedSeasonRequest = useRef<string | null>(null);
  const requestedSeasonIndex = useMemo(() => {
    if (seasonIndex === undefined) return undefined;
    const requested = Number(seasonIndex);
    return Number.isFinite(requested) ? requested : undefined;
  }, [seasonIndex]);

  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);
  const { getDownloadedItems, downloadedItems } = useDownload();
  const { startShuffle } = useShuffleQueue();

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
    refetchInterval: !isOffline && Platform.isTV ? 60 * 1000 : undefined,
    enabled: isOffline || (!!api && !!user?.Id),
  });

  // Offline, the series is nothing but its downloaded episodes, so the query
  // above answers null once the last one is deleted. There is nothing left to
  // show here: go back to the downloads instead of leaving an empty screen.
  useLeaveWhenGone(isOffline && item === null);

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
      width: toImagePixels(windowWidth),
      height: toImagePixels(HEADER_HEIGHT),
    });
  }, [isOffline, base64Image, api, item, windowWidth]);

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
    staleTime: isOffline ? Infinity : 60 * 1000,
    refetchInterval: !isOffline && Platform.isTV ? 60 * 1000 : undefined,
    enabled: isOffline || (!!api && !!user?.Id),
  });

  useEffect(() => {
    if (requestedSeasonIndex === undefined) {
      processedSeasonRequest.current = null;
      return;
    }
    if (allEpisodes === undefined) return;

    const requestKey = `${seriesId}:${requestedSeasonIndex}`;
    if (processedSeasonRequest.current === requestKey) return;
    processedSeasonRequest.current = requestKey;

    const seasonExists = allEpisodes.some(
      (episode) => episode.ParentIndexNumber === requestedSeasonIndex,
    );
    if (!seasonExists) return;

    setSeasonIndexState((state) => {
      if (state[seriesId] === requestedSeasonIndex) return state;
      return { ...state, [seriesId]: requestedSeasonIndex };
    });
  }, [allEpisodes, requestedSeasonIndex, seriesId, setSeasonIndexState]);

  const initialSeasonIndex = useMemo(() => {
    if (requestedSeasonIndex !== undefined) return requestedSeasonIndex;
    return (
      getSeriesPlaybackTarget(allEpisodes ?? [])?.ParentIndexNumber ?? undefined
    );
  }, [allEpisodes, requestedSeasonIndex]);

  useEffect(() => {
    // The TV page has its own Shuffle button, with a choice of season.
    // startShuffle is covered by hooks/useLibraryPlayQueue.test.tsx.
    const shuffleButton =
      !Platform.isTV && allEpisodes && allEpisodes.length > 1 ? (
        <HeaderButton
          onPress={() => startShuffle(allEpisodes, { isOffline })}
          accessibilityRole='button'
          accessibilityLabel={t("player.shuffle")}
        >
          <HeaderIcon name='shuffle' />
        </HeaderButton>
      ) : null;

    // The other header buttons need the server; shuffling downloads does not.
    if (isOffline) {
      navigation.setOptions({
        headerRight: () => shuffleButton,
      });
      return;
    }

    navigation.setOptions({
      headerRight: () =>
        !isLoading && item && allEpisodes && allEpisodes.length > 0 ? (
          <HeaderButtonGroup>
            {shuffleButton}
            {!Platform.isTV && !isOffline && (
              <SyncPlayButton items={allEpisodes} title={item.Name} />
            )}
            <AddToFavorites item={item} />
            {!Platform.isTV && (
              <DownloadItems
                size='large'
                title={t("item_card.download.download_series")}
                items={allEpisodes}
                MissingDownloadIconComponent={() => (
                  <HeaderIcon name='downloads' />
                )}
                DownloadedIconComponent={() => (
                  <HeaderIcon name='downloaded' tintColor={Colors.primary} />
                )}
              />
            )}
          </HeaderButtonGroup>
        ) : null,
    });
  }, [allEpisodes, isLoading, item, isOffline, startShuffle]);

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
          initialSeasonIndex={initialSeasonIndex}
        />
      </OfflineModeProvider>
    );
  }

  return (
    <OfflineModeProvider isOffline={isOffline}>
      <ParallaxScrollView
        headerHeight={HEADER_HEIGHT}
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
                height: LOGO_HEIGHT,
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
          {allEpisodes !== undefined && (
            <SeasonPicker item={item} initialSeasonIndex={initialSeasonIndex} />
          )}
          {!isOffline && <SimilarItems item={item} className='mt-4' />}
        </View>
      </ParallaxScrollView>
    </OfflineModeProvider>
  );
};

export default page;

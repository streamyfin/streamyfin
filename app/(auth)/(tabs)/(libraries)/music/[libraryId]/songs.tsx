import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { getItemsApi } from "@jellyfin/sdk/lib/utils/api";
import { FlashList } from "@shopify/flash-list";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { useRoute } from "expo-router/react-navigation";
import { useAtom } from "jotai";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { RefreshControl, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/components/common/Text";
import { Loader } from "@/components/Loader";
import { MusicPlayAllHeader } from "@/components/music/MusicPlayAllHeader";
import { MusicTrackItem } from "@/components/music/MusicTrackItem";
import { TrackOptionsSheets } from "@/components/music/TrackOptionsSheets";
import { useMusicPlayQueue } from "@/hooks/useMusicPlayQueue";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { buildSongsPageQuery } from "@/utils/music/musicQueries";

const ITEMS_PER_PAGE = 100;

export default function SongsScreen() {
  const localParams = useLocalSearchParams<{ libraryId?: string | string[] }>();
  const route = useRoute<any>();
  const libraryId =
    (Array.isArray(localParams.libraryId)
      ? localParams.libraryId[0]
      : localParams.libraryId) ?? route?.params?.libraryId;
  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const [selectedTrack, setSelectedTrack] = useState<BaseItemDto | null>(null);
  const [trackOptionsOpen, setTrackOptionsOpen] = useState(false);

  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
  } = useInfiniteQuery({
    queryKey: ["music-songs", libraryId, user?.Id],
    queryFn: async ({ pageParam = 0 }) => {
      const response = await getItemsApi(api!).getItems(
        buildSongsPageQuery(user!.Id!, libraryId!, {
          startIndex: pageParam,
          limit: ITEMS_PER_PAGE,
        }),
      );
      return {
        items: response.data.Items || [],
        totalCount: response.data.TotalRecordCount || 0,
        startIndex: pageParam,
      };
    },
    getNextPageParam: (lastPage) => {
      const nextStart = lastPage.startIndex + ITEMS_PER_PAGE;
      return nextStart < lastPage.totalCount ? nextStart : undefined;
    },
    initialPageParam: 0,
    enabled: !!api && !!user?.Id && !!libraryId,
  });

  const songs = useMemo(
    () => data?.pages.flatMap((page) => page.items) || [],
    [data],
  );
  const totalCount = data?.pages[0]?.totalCount ?? 0;

  const source = useMemo(
    () =>
      user?.Id && libraryId
        ? { userId: user.Id, parentId: libraryId, recursive: true }
        : null,
    [user?.Id, libraryId],
  );
  const { playAll, shuffle, isStarting } = useMusicPlayQueue(source);

  const handleTrackOptionsPress = useCallback((track: BaseItemDto) => {
    setSelectedTrack(track);
    setTrackOptionsOpen(true);
  }, []);

  const handleEndReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (isLoading) {
    return (
      <View className='flex-1 justify-center items-center bg-black'>
        <Loader />
      </View>
    );
  }

  if (songs.length === 0) {
    return (
      <View className='flex-1 justify-center items-center bg-black'>
        <Text className='text-neutral-500'>{t("music.no_songs")}</Text>
      </View>
    );
  }

  return (
    <View className='flex-1 bg-black'>
      <FlashList
        data={songs}
        contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
        refreshControl={
          <RefreshControl
            refreshing={false}
            onRefresh={refetch}
            tintColor='#9334E9'
          />
        }
        ListHeaderComponent={
          <MusicPlayAllHeader
            onPlayAll={playAll}
            onShuffle={shuffle}
            isStarting={isStarting}
            subtitle={t("music.song_count", { count: totalCount })}
          />
        }
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.5}
        renderItem={({ item }) => (
          <MusicTrackItem
            track={item}
            queue={songs}
            onOptionsPress={handleTrackOptionsPress}
          />
        )}
        keyExtractor={(item) => item.Id!}
        ListFooterComponent={
          <>
            {isFetchingNextPage && (
              <View className='py-4'>
                <Loader />
              </View>
            )}
            <TrackOptionsSheets
              track={selectedTrack}
              open={trackOptionsOpen}
              setOpen={setTrackOptionsOpen}
            />
          </>
        }
      />
    </View>
  );
}

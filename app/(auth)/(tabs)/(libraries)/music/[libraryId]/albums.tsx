import { getItemsApi } from "@jellyfin/sdk/lib/utils/api";
import { useRoute } from "@react-navigation/native";
import { FlashList } from "@shopify/flash-list";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { useAtom } from "jotai";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Dimensions, RefreshControl, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/components/common/Text";
import { Loader } from "@/components/Loader";
import { MusicAlbumCard } from "@/components/music/MusicAlbumCard";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";

const ITEMS_PER_PAGE = 40;

export default function AlbumsScreen() {
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

  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
  } = useInfiniteQuery({
    queryKey: ["music-albums", libraryId, user?.Id],
    queryFn: async ({ pageParam = 0 }) => {
      const response = await getItemsApi(api!).getItems({
        userId: user?.Id,
        parentId: libraryId,
        includeItemTypes: ["MusicAlbum"],
        sortBy: ["SortName"],
        sortOrder: ["Ascending"],
        limit: ITEMS_PER_PAGE,
        startIndex: pageParam,
        recursive: true,
      });
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

  const albums = useMemo(() => {
    return data?.pages.flatMap((page) => page.items) || [];
  }, [data]);

  const numColumns = 2;
  const screenWidth = Dimensions.get("window").width;
  const gap = 12;
  const padding = 16;
  const itemWidth =
    (screenWidth - padding * 2 - gap * (numColumns - 1)) / numColumns;

  const handleEndReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (isLoading) {
    return (
      <View className='flex-1 justify-center items-center bg-black'>
        <Loader />
      </View>
    );
  }

  if (albums.length === 0) {
    return (
      <View className='flex-1 justify-center items-center bg-black'>
        <Text className='text-neutral-500'>{t("music.no_albums")}</Text>
      </View>
    );
  }

  return (
    <FlashList
      data={albums}
      numColumns={numColumns}
      contentContainerStyle={{
        paddingBottom: insets.bottom + 100,
        paddingTop: 16,
        paddingHorizontal: padding,
      }}
      refreshControl={
        <RefreshControl
          refreshing={false}
          onRefresh={refetch}
          tintColor='#9334E9'
        />
      }
      onEndReached={handleEndReached}
      onEndReachedThreshold={0.5}
      renderItem={({ item, index }) => (
        <View
          style={{
            width: itemWidth,
            marginRight: index % numColumns === 0 ? gap : 0,
            marginBottom: gap,
          }}
        >
          <MusicAlbumCard album={item} width={itemWidth} />
        </View>
      )}
      keyExtractor={(item) => item.Id!}
      ListFooterComponent={
        isFetchingNextPage ? (
          <View className='py-4'>
            <Loader />
          </View>
        ) : null
      }
    />
  );
}

import { getArtistsApi } from "@jellyfin/sdk/lib/utils/api";
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
import { MusicArtistCard } from "@/components/music/MusicArtistCard";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";

// Web uses Limit=100
const ITEMS_PER_PAGE = 100;

export default function ArtistsScreen() {
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

  const isReady = Boolean(api && user?.Id && libraryId);

  const {
    data,
    isLoading,
    isError,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
  } = useInfiniteQuery({
    queryKey: ["music-artists", libraryId, user?.Id],
    queryFn: async ({ pageParam = 0 }) => {
      const response = await getArtistsApi(api!).getArtists({
        userId: user?.Id,
        parentId: libraryId,
        sortBy: ["SortName"],
        sortOrder: ["Ascending"],
        fields: ["PrimaryImageAspectRatio", "SortName"],
        imageTypeLimit: 1,
        enableImageTypes: ["Primary", "Backdrop", "Banner", "Thumb"],
        limit: ITEMS_PER_PAGE,
        startIndex: pageParam,
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
    enabled: isReady,
  });

  const artists = useMemo(() => {
    return data?.pages.flatMap((page) => page.items) || [];
  }, [data]);

  const numColumns = 3;
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

  if (!api || !user?.Id) {
    return (
      <View className='flex-1 justify-center items-center bg-black'>
        <Loader />
      </View>
    );
  }

  if (!libraryId) {
    return (
      <View className='flex-1 justify-center items-center bg-black px-6'>
        <Text className='text-neutral-500 text-center'>
          Missing music library id.
        </Text>
      </View>
    );
  }

  // Only show loading if we have no cached data to display
  if (isLoading && artists.length === 0) {
    return (
      <View className='flex-1 justify-center items-center bg-black'>
        <Loader />
      </View>
    );
  }

  // Only show error if we have no cached data to display
  // This allows offline access to previously cached artists
  if (isError && artists.length === 0) {
    return (
      <View className='flex-1 justify-center items-center bg-black px-6'>
        <Text className='text-neutral-500 text-center'>
          Failed to load artists: {(error as Error)?.message || "Unknown error"}
        </Text>
      </View>
    );
  }

  if (artists.length === 0) {
    return (
      <View className='flex-1 justify-center items-center bg-black'>
        <Text className='text-neutral-500'>{t("music.no_artists")}</Text>
      </View>
    );
  }

  return (
    <View className='flex-1 bg-black'>
      <FlashList
        data={artists}
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
              marginRight: index % numColumns !== numColumns - 1 ? gap : 0,
              marginBottom: gap,
            }}
          >
            <MusicArtistCard artist={item} size={itemWidth} />
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
    </View>
  );
}

import type { Api } from "@jellyfin/sdk";
import type {
  BaseItemDto,
  BaseItemKind,
  ItemFilter,
} from "@jellyfin/sdk/lib/generated-client";
import { getItemsApi } from "@jellyfin/sdk/lib/utils/api";
import { FlashList } from "@shopify/flash-list";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Stack, useLocalSearchParams } from "expo-router";
import { t } from "i18next";
import { useAtom } from "jotai";
import { useCallback, useMemo } from "react";
import { Platform, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useCardGrid } from "@/components/cards/useCardGrid";
import { QueryErrorState } from "@/components/common/QueryErrorState";
import { Text } from "@/components/common/Text";
import { Loader } from "@/components/Loader";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";

type FavoriteTypes =
  | "Series"
  | "Season"
  | "Movie"
  | "Episode"
  | "Video"
  | "BoxSet"
  | "Playlist";

const favoriteTypes: readonly FavoriteTypes[] = [
  "Series",
  "Season",
  "Movie",
  "Episode",
  "Video",
  "BoxSet",
  "Playlist",
] as const;

function isFavoriteType(value: unknown): value is FavoriteTypes {
  return (
    typeof value === "string" &&
    (favoriteTypes as readonly string[]).includes(value)
  );
}

/**
 * Shared "See all" grid for the favorites / KefinTweaks-watchlist rows. Reads
 * `type` / `title` / `filter` route params, so it renders identically whether
 * mounted under the (favorites) or (watchlists) tab.
 */
export default function FavoritesSeeAll() {
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);

  const searchParams = useLocalSearchParams<{
    type?: string;
    title?: string;
    filter?: string;
  }>();
  const typeParam = searchParams.type;
  const titleParam = searchParams.title;
  // The KefinTweaks watchlist reuses this screen with the "Likes" filter.
  const filter: ItemFilter =
    searchParams.filter === "Likes" ? "Likes" : "IsFavorite";

  const itemType = useMemo(() => {
    if (!isFavoriteType(typeParam)) return null;
    return typeParam as BaseItemKind;
  }, [typeParam]);

  const headerTitle = useMemo(() => {
    if (typeof titleParam === "string" && titleParam.trim().length > 0)
      return titleParam;
    return "";
  }, [titleParam]);

  const pageSize = 50;

  const fetchItems = useCallback(
    async ({ pageParam }: { pageParam: number }): Promise<BaseItemDto[]> => {
      if (!api || !user?.Id || !itemType) return [];

      const response = await getItemsApi(api as Api).getItems({
        userId: user.Id,
        sortBy: ["SeriesSortName", "SortName"],
        sortOrder: ["Ascending"],
        filters: [filter],
        recursive: true,
        fields: ["PrimaryImageAspectRatio"],
        collapseBoxSetItems: false,
        excludeLocationTypes: ["Virtual"],
        enableTotalRecordCount: true,
        startIndex: pageParam,
        limit: pageSize,
        includeItemTypes: [itemType],
      });

      return response.data.Items || [];
    },
    [api, itemType, user?.Id, filter],
  );

  const {
    data,
    isFetching,
    fetchNextPage,
    hasNextPage,
    isLoading,
    isError,
    refetch,
  } = useInfiniteQuery({
    // Keyed by account: the cache outlives a user switch, and without the id
    // the grid would open on the previous account's list.
    queryKey: ["favorites", "see-all", user?.Id, itemType, filter],
    queryFn: ({ pageParam = 0 }) => fetchItems({ pageParam }),
    getNextPageParam: (lastPage, pages) => {
      if (!lastPage || lastPage.length < pageSize) return undefined;
      return pages.reduce((acc, page) => acc + page.length, 0);
    },
    initialPageParam: 0,
    enabled: !!api && !!user?.Id && !!itemType,
  });

  const flatData = useMemo(() => data?.pages.flat() ?? [], [data]);

  const nrOfCols = useMemo(() => {
    if (screenWidth < 350) return 2;
    if (screenWidth < 600) return 3;
    if (screenWidth < 900) return 5;
    return 6;
  }, [screenWidth]);

  const grid = useCardGrid({
    items: flatData,
    columns: nrOfCols,
    enableActionSheet: true,
    // "Season 2" alone says nothing in a grid of seasons from many shows.
    showParentTitle: itemType === "Season",
  });

  // FlashList fires this again while the next page is still loading, before
  // any render could reflect it; reuse that request instead of restarting it.
  const handleEndReached = useCallback(() => {
    if (hasNextPage) {
      fetchNextPage({ cancelRefetch: false });
    }
  }, [fetchNextPage, hasNextPage]);

  return (
    <>
      <Stack.Screen
        options={{
          headerTitle: headerTitle,
          headerBlurEffect: "none",
          // Only iOS lays the list out under a transparent header
          // (contentInsetAdjustmentBehavior); on Android the first row of
          // posters would sit beneath it.
          headerTransparent: Platform.OS === "ios",
          headerShadowVisible: false,
        }}
      />
      {!itemType ? (
        <View className='flex-1 items-center justify-center px-6'>
          <Text className='text-neutral-500'>{t("favorites.noData")}</Text>
        </View>
      ) : isLoading ? (
        <View className='justify-center items-center h-full'>
          <Loader />
        </View>
      ) : isError && flatData.length === 0 ? (
        <QueryErrorState onRetry={refetch} retrying={isFetching} />
      ) : (
        <FlashList
          data={grid.data}
          renderItem={grid.renderItem}
          keyExtractor={grid.keyExtractor}
          numColumns={nrOfCols}
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.8}
          contentInsetAdjustmentBehavior='automatic'
          contentContainerStyle={{
            paddingBottom: 24,
            paddingLeft: insets.left,
            paddingRight: insets.right,
          }}
          ItemSeparatorComponent={() => (
            <View style={{ height: grid.rowGap }} />
          )}
          ListEmptyComponent={
            <View className='flex flex-col items-center justify-center h-full py-12'>
              <Text className='font-bold text-xl text-neutral-500'>
                {t("home.no_items")}
              </Text>
            </View>
          }
          ListFooterComponent={
            isFetching ? (
              <View style={{ paddingVertical: 16 }}>
                <Loader />
              </View>
            ) : null
          }
        />
      )}
      {grid.actionSheet}
    </>
  );
}

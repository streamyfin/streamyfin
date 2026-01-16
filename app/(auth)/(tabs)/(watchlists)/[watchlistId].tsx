import { Ionicons } from "@expo/vector-icons";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { FlashList } from "@shopify/flash-list";
import { useLocalSearchParams, useNavigation } from "expo-router";
import { useAtomValue } from "jotai";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Alert,
  Platform,
  RefreshControl,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { HeaderBackButton } from "@/components/common/HeaderBackButton";
import { Text } from "@/components/common/Text";
import {
  getItemNavigation,
  TouchableItemRouter,
} from "@/components/common/TouchableItemRouter";
import { ItemCardText } from "@/components/ItemCardText";
import { ItemPoster } from "@/components/posters/ItemPoster";
import MoviePoster, {
  TV_POSTER_WIDTH,
} from "@/components/posters/MoviePoster.tv";
import SeriesPoster from "@/components/posters/SeriesPoster.tv";
import { TVFocusablePoster } from "@/components/tv/TVFocusablePoster";
import useRouter from "@/hooks/useAppRouter";
import { useOrientation } from "@/hooks/useOrientation";
import {
  useDeleteWatchlist,
  useRemoveFromWatchlist,
} from "@/hooks/useWatchlistMutations";
import {
  useWatchlistDetailQuery,
  useWatchlistItemsQuery,
} from "@/hooks/useWatchlists";
import * as ScreenOrientation from "@/packages/expo-screen-orientation";
import { userAtom } from "@/providers/JellyfinProvider";

const TV_ITEM_GAP = 16;
const TV_SCALE_PADDING = 20;

const TVItemCardText: React.FC<{ item: BaseItemDto }> = ({ item }) => (
  <View style={{ marginTop: 12 }}>
    <Text numberOfLines={1} style={{ fontSize: 16, color: "#FFFFFF" }}>
      {item.Name}
    </Text>
    <Text style={{ fontSize: 14, color: "#9CA3AF", marginTop: 2 }}>
      {item.ProductionYear}
    </Text>
  </View>
);

export default function WatchlistDetailScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { watchlistId } = useLocalSearchParams<{ watchlistId: string }>();
  const user = useAtomValue(userAtom);
  const { width: screenWidth } = useWindowDimensions();
  const { orientation } = useOrientation();

  const watchlistIdNum = watchlistId
    ? Number.parseInt(watchlistId, 10)
    : undefined;

  const nrOfCols = useMemo(() => {
    if (Platform.isTV) {
      // Calculate columns based on TV poster width + gap
      const itemWidth = TV_POSTER_WIDTH + TV_ITEM_GAP;
      return Math.max(
        1,
        Math.floor((screenWidth - TV_SCALE_PADDING * 2) / itemWidth),
      );
    }
    if (screenWidth < 300) return 2;
    if (screenWidth < 500) return 3;
    if (screenWidth < 800) return 5;
    if (screenWidth < 1000) return 6;
    if (screenWidth < 1500) return 7;
    return 6;
  }, [screenWidth]);

  const {
    data: watchlist,
    isLoading: watchlistLoading,
    refetch: refetchWatchlist,
  } = useWatchlistDetailQuery(watchlistIdNum);

  const {
    data: items,
    isLoading: itemsLoading,
    refetch: refetchItems,
  } = useWatchlistItemsQuery(watchlistIdNum);

  const deleteWatchlist = useDeleteWatchlist();
  const removeFromWatchlist = useRemoveFromWatchlist();
  const [refreshing, setRefreshing] = useState(false);

  const isOwner = useMemo(
    () => watchlist?.userId === user?.Id,
    [watchlist?.userId, user?.Id],
  );

  // Set up header
  useEffect(() => {
    navigation.setOptions({
      headerTitle: watchlist?.name || "",
      headerLeft: () => <HeaderBackButton />,
      headerRight: isOwner
        ? () => (
            <View className='flex-row gap-2'>
              <TouchableOpacity
                onPress={() =>
                  router.push(`/(auth)/(tabs)/(watchlists)/edit/${watchlistId}`)
                }
                className='p-2'
              >
                <Ionicons name='pencil' size={20} color='white' />
              </TouchableOpacity>
              <TouchableOpacity onPress={handleDelete} className='p-2'>
                <Ionicons name='trash-outline' size={20} color='#ef4444' />
              </TouchableOpacity>
            </View>
          )
        : undefined,
    });
  }, [navigation, watchlist?.name, isOwner, watchlistId]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetchWatchlist(), refetchItems()]);
    setRefreshing(false);
  }, [refetchWatchlist, refetchItems]);

  const handleDelete = useCallback(() => {
    Alert.alert(
      t("watchlists.delete_confirm_title"),
      t("watchlists.delete_confirm_message", { name: watchlist?.name }),
      [
        { text: t("watchlists.cancel_button"), style: "cancel" },
        {
          text: t("watchlists.delete_button"),
          style: "destructive",
          onPress: async () => {
            if (watchlistIdNum) {
              await deleteWatchlist.mutateAsync(watchlistIdNum);
              router.back();
            }
          },
        },
      ],
    );
  }, [deleteWatchlist, watchlistIdNum, watchlist?.name, router, t]);

  const handleRemoveItem = useCallback(
    (item: BaseItemDto) => {
      if (!watchlistIdNum || !item.Id) return;

      Alert.alert(
        t("watchlists.remove_item_title"),
        t("watchlists.remove_item_message", { name: item.Name }),
        [
          { text: t("watchlists.cancel_button"), style: "cancel" },
          {
            text: t("watchlists.remove_button"),
            style: "destructive",
            onPress: async () => {
              await removeFromWatchlist.mutateAsync({
                watchlistId: watchlistIdNum,
                itemId: item.Id!,
                watchlistName: watchlist?.name,
              });
            },
          },
        ],
      );
    },
    [removeFromWatchlist, watchlistIdNum, watchlist?.name, t],
  );

  const renderTVItem = useCallback(
    ({ item, index }: { item: BaseItemDto; index: number }) => {
      const handlePress = () => {
        const navigation = getItemNavigation(item, "(watchlists)");
        router.push(navigation as any);
      };

      return (
        <View
          style={{
            marginRight: TV_ITEM_GAP,
            marginBottom: TV_ITEM_GAP,
            width: TV_POSTER_WIDTH,
          }}
        >
          <TVFocusablePoster
            onPress={handlePress}
            hasTVPreferredFocus={index === 0}
          >
            {item.Type === "Movie" && <MoviePoster item={item} />}
            {(item.Type === "Series" || item.Type === "Episode") && (
              <SeriesPoster item={item} />
            )}
          </TVFocusablePoster>
          <TVItemCardText item={item} />
        </View>
      );
    },
    [router],
  );

  const renderItem = useCallback(
    ({ item, index }: { item: BaseItemDto; index: number }) => (
      <TouchableItemRouter
        key={item.Id}
        style={{
          width: "100%",
          marginBottom: 4,
        }}
        item={item}
        onLongPress={isOwner ? () => handleRemoveItem(item) : undefined}
      >
        <View
          style={{
            alignSelf:
              orientation === ScreenOrientation.OrientationLock.PORTRAIT_UP
                ? index % nrOfCols === 0
                  ? "flex-end"
                  : (index + 1) % nrOfCols === 0
                    ? "flex-start"
                    : "center"
                : "center",
            width: "89%",
          }}
        >
          <ItemPoster item={item} />
          <ItemCardText item={item} />
        </View>
      </TouchableItemRouter>
    ),
    [isOwner, handleRemoveItem, orientation, nrOfCols],
  );

  const ListHeader = useMemo(
    () =>
      watchlist ? (
        <View className='px-4 pt-4 pb-6 mb-4 border-b border-neutral-800'>
          {watchlist.description && (
            <Text className='text-neutral-400 mb-2'>
              {watchlist.description}
            </Text>
          )}
          <View className='flex-row items-center gap-4'>
            <View className='flex-row items-center gap-1'>
              <Ionicons name='film-outline' size={14} color='#9ca3af' />
              <Text className='text-neutral-400 text-sm'>
                {items?.length ?? 0}{" "}
                {(items?.length ?? 0) === 1
                  ? t("watchlists.item")
                  : t("watchlists.items")}
              </Text>
            </View>
            <View className='flex-row items-center gap-1'>
              <Ionicons
                name={
                  watchlist.isPublic ? "globe-outline" : "lock-closed-outline"
                }
                size={14}
                color='#9ca3af'
              />
              <Text className='text-neutral-400 text-sm'>
                {watchlist.isPublic
                  ? t("watchlists.public")
                  : t("watchlists.private")}
              </Text>
            </View>
            {!isOwner && (
              <Text className='text-neutral-500 text-sm'>
                {t("watchlists.by_owner")}
              </Text>
            )}
          </View>
        </View>
      ) : null,
    [watchlist, items?.length, isOwner, t],
  );

  const EmptyComponent = useMemo(
    () => (
      <View className='flex-1 items-center justify-center px-8 py-16'>
        <Ionicons name='film-outline' size={48} color='#4b5563' />
        <Text className='text-neutral-400 text-center mt-4'>
          {t("watchlists.empty_watchlist")}
        </Text>
        {isOwner && (
          <Text className='text-neutral-500 text-center mt-2 text-sm'>
            {t("watchlists.empty_watchlist_hint")}
          </Text>
        )}
      </View>
    ),
    [isOwner, t],
  );

  const keyExtractor = useCallback((item: BaseItemDto) => item.Id || "", []);

  if (watchlistLoading || itemsLoading) {
    return (
      <View className='flex-1 items-center justify-center'>
        <ActivityIndicator size='large' />
      </View>
    );
  }

  if (!watchlist) {
    return (
      <View className='flex-1 items-center justify-center px-8'>
        <Text className='text-lg text-neutral-400'>
          {t("watchlists.not_found")}
        </Text>
      </View>
    );
  }

  return (
    <FlashList
      key={orientation}
      data={items ?? []}
      numColumns={nrOfCols}
      contentInsetAdjustmentBehavior='automatic'
      ListHeaderComponent={ListHeader}
      ListEmptyComponent={EmptyComponent}
      extraData={[orientation, nrOfCols]}
      keyExtractor={keyExtractor}
      contentContainerStyle={{
        paddingBottom: 24,
        paddingLeft: Platform.isTV ? TV_SCALE_PADDING : insets.left,
        paddingRight: Platform.isTV ? TV_SCALE_PADDING : insets.right,
        paddingTop: Platform.isTV ? TV_SCALE_PADDING : 0,
      }}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
      }
      renderItem={Platform.isTV ? renderTVItem : renderItem}
      ItemSeparatorComponent={() => (
        <View
          style={{
            width: 10,
            height: 10,
          }}
        />
      )}
    />
  );
}

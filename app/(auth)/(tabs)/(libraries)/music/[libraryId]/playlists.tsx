import { Ionicons } from "@expo/vector-icons";
import { getItemsApi } from "@jellyfin/sdk/lib/utils/api";
import { useNavigation, useRoute } from "@react-navigation/native";
import { FlashList } from "@shopify/flash-list";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { useAtom } from "jotai";
import { useCallback, useLayoutEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { RefreshControl, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/components/common/Text";
import { Loader } from "@/components/Loader";
import { CreatePlaylistModal } from "@/components/music/CreatePlaylistModal";
import { MusicPlaylistCard } from "@/components/music/MusicPlaylistCard";
import {
  type PlaylistSortOption,
  type PlaylistSortOrder,
  PlaylistSortSheet,
} from "@/components/music/PlaylistSortSheet";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";

const ITEMS_PER_PAGE = 40;

export default function PlaylistsScreen() {
  const localParams = useLocalSearchParams<{ libraryId?: string | string[] }>();
  const route = useRoute<any>();
  const navigation = useNavigation();
  const libraryId =
    (Array.isArray(localParams.libraryId)
      ? localParams.libraryId[0]
      : localParams.libraryId) ?? route?.params?.libraryId;
  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [sortSheetOpen, setSortSheetOpen] = useState(false);
  const [sortBy, setSortBy] = useState<PlaylistSortOption>("SortName");
  const [sortOrder, setSortOrder] = useState<PlaylistSortOrder>("Ascending");

  const isReady = Boolean(api && user?.Id && libraryId);

  const handleSortChange = useCallback(
    (newSortBy: PlaylistSortOption, newSortOrder: PlaylistSortOrder) => {
      setSortBy(newSortBy);
      setSortOrder(newSortOrder);
    },
    [],
  );

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          onPress={() => setCreateModalOpen(true)}
          className='mr-4'
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name='add' size={28} color='white' />
        </TouchableOpacity>
      ),
    });
  }, [navigation]);

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
    queryKey: ["music-playlists", libraryId, user?.Id, sortBy, sortOrder],
    queryFn: async ({ pageParam = 0 }) => {
      const response = await getItemsApi(api!).getItems({
        userId: user?.Id,
        includeItemTypes: ["Playlist"],
        sortBy: [sortBy],
        sortOrder: [sortOrder],
        limit: ITEMS_PER_PAGE,
        startIndex: pageParam,
        recursive: true,
        mediaTypes: ["Audio"],
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

  const playlists = useMemo(() => {
    return data?.pages.flatMap((page) => page.items) || [];
  }, [data]);

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
  if (isLoading && playlists.length === 0) {
    return (
      <View className='flex-1 justify-center items-center bg-black'>
        <Loader />
      </View>
    );
  }

  // Only show error if we have no cached data to display
  // This allows offline access to previously cached playlists
  if (isError && playlists.length === 0) {
    return (
      <View className='flex-1 justify-center items-center bg-black px-6'>
        <Text className='text-neutral-500 text-center'>
          Failed to load playlists:{" "}
          {(error as Error)?.message || "Unknown error"}
        </Text>
      </View>
    );
  }

  if (playlists.length === 0) {
    return (
      <View className='flex-1 justify-center items-center bg-black'>
        <Text className='text-neutral-500 mb-4'>{t("music.no_playlists")}</Text>
        <TouchableOpacity
          onPress={() => setCreateModalOpen(true)}
          className='flex-row items-center bg-purple-600 px-6 py-3 rounded-full'
        >
          <Ionicons name='add' size={20} color='white' />
          <Text className='text-white font-semibold ml-2'>
            {t("music.playlists.create_playlist")}
          </Text>
        </TouchableOpacity>
        <CreatePlaylistModal
          open={createModalOpen}
          setOpen={setCreateModalOpen}
        />
      </View>
    );
  }

  return (
    <View className='flex-1 bg-black'>
      <FlashList
        data={playlists}
        contentContainerStyle={{
          paddingBottom: insets.bottom + 100,
          paddingTop: 8,
          paddingHorizontal: 16,
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
        ListHeaderComponent={
          <TouchableOpacity
            onPress={() => setSortSheetOpen(true)}
            className='flex-row items-center mb-2 py-1'
          >
            <Ionicons name='swap-vertical' size={18} color='#9334E9' />
            <Text className='text-purple-500 text-sm ml-1.5'>
              {t(
                `music.sort.${sortBy === "SortName" ? "alphabetical" : "date_created"}`,
              )}
            </Text>
            <Ionicons
              name={sortOrder === "Ascending" ? "arrow-up" : "arrow-down"}
              size={14}
              color='#9334E9'
              style={{ marginLeft: 4 }}
            />
          </TouchableOpacity>
        }
        renderItem={({ item }) => <MusicPlaylistCard playlist={item} />}
        keyExtractor={(item) => item.Id!}
        ListFooterComponent={
          isFetchingNextPage ? (
            <View className='py-4'>
              <Loader />
            </View>
          ) : null
        }
      />
      <CreatePlaylistModal
        open={createModalOpen}
        setOpen={setCreateModalOpen}
      />
      <PlaylistSortSheet
        open={sortSheetOpen}
        setOpen={setSortSheetOpen}
        sortBy={sortBy}
        sortOrder={sortOrder}
        onSortChange={handleSortChange}
      />
    </View>
  );
}

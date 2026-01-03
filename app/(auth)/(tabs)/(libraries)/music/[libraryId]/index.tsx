import { Ionicons } from "@expo/vector-icons";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { getArtistsApi, getItemsApi } from "@jellyfin/sdk/lib/utils/api";
import { FlashList } from "@shopify/flash-list";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { useAtom } from "jotai";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Dimensions,
  RefreshControl,
  ScrollView,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { HorizontalScroll } from "@/components/common/HorizontalScroll";
import { Text } from "@/components/common/Text";
import { Loader } from "@/components/Loader";
import { MusicAlbumCard } from "@/components/music/MusicAlbumCard";
import { MusicArtistCard } from "@/components/music/MusicArtistCard";
import { MusicPlaylistCard } from "@/components/music/MusicPlaylistCard";
import { MusicTrackItem } from "@/components/music/MusicTrackItem";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";

type FilterType = "all" | "albums" | "artists" | "playlists";

const ITEMS_PER_PAGE = 40;

export default function MusicLibraryScreen() {
  const { libraryId } = useLocalSearchParams<{ libraryId: string }>();
  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const [activeFilter, setActiveFilter] = useState<FilterType>("all");

  const isReady = Boolean(api && user?.Id && libraryId);

  const screenWidth = Dimensions.get("window").width;
  const gap = 12;
  const padding = 16;

  // Latest albums for "All" view
  const {
    data: latestAlbums,
    isLoading: loadingLatest,
    refetch: refetchLatest,
  } = useQuery({
    queryKey: ["music-latest", libraryId, user?.Id],
    queryFn: async () => {
      const res = await api!.get<BaseItemDto[]>(
        `/Users/${user!.Id}/Items/Latest`,
        {
          params: {
            IncludeItemTypes: "Audio",
            Limit: 20,
            Fields: "PrimaryImageAspectRatio",
            ParentId: libraryId,
            ImageTypeLimit: 1,
            EnableImageTypes: "Primary,Backdrop,Banner,Thumb",
            EnableTotalRecordCount: false,
          },
        },
      );

      if (Array.isArray(res.data) && res.data.length > 0) {
        return res.data;
      }

      const fallback = await getItemsApi(api!).getItems({
        userId: user!.Id,
        parentId: libraryId,
        includeItemTypes: ["MusicAlbum"],
        sortBy: ["DateCreated"],
        sortOrder: ["Descending"],
        limit: 20,
        recursive: true,
        fields: ["PrimaryImageAspectRatio", "SortName"],
        imageTypeLimit: 1,
        enableImageTypes: ["Primary", "Backdrop", "Banner", "Thumb"],
        enableTotalRecordCount: false,
      });
      return fallback.data.Items || [];
    },
    enabled: isReady && activeFilter === "all",
  });

  // Recently played tracks for "All" view
  const {
    data: recentlyPlayed,
    isLoading: loadingRecentlyPlayed,
    refetch: refetchRecentlyPlayed,
  } = useQuery({
    queryKey: ["music-recently-played", libraryId, user?.Id],
    queryFn: async () => {
      const response = await getItemsApi(api!).getItems({
        userId: user?.Id,
        parentId: libraryId,
        includeItemTypes: ["Audio"],
        sortBy: ["DatePlayed"],
        sortOrder: ["Descending"],
        limit: 10,
        recursive: true,
        fields: ["PrimaryImageAspectRatio", "SortName"],
        filters: ["IsPlayed"],
        imageTypeLimit: 1,
        enableImageTypes: ["Primary", "Backdrop", "Banner", "Thumb"],
        enableTotalRecordCount: false,
      });
      return response.data.Items || [];
    },
    enabled: isReady && activeFilter === "all",
  });

  // Frequently played tracks for "All" view
  const {
    data: frequentlyPlayed,
    isLoading: loadingFrequent,
    refetch: refetchFrequent,
  } = useQuery({
    queryKey: ["music-frequently-played", libraryId, user?.Id],
    queryFn: async () => {
      const response = await getItemsApi(api!).getItems({
        userId: user?.Id,
        parentId: libraryId,
        includeItemTypes: ["Audio"],
        sortBy: ["PlayCount"],
        sortOrder: ["Descending"],
        limit: 10,
        recursive: true,
        fields: ["PrimaryImageAspectRatio", "SortName"],
        filters: ["IsPlayed"],
        imageTypeLimit: 1,
        enableImageTypes: ["Primary", "Backdrop", "Banner", "Thumb"],
        enableTotalRecordCount: false,
      });
      return response.data.Items || [];
    },
    enabled: isReady && activeFilter === "all",
  });

  // Albums query for "Albums" filter
  const {
    data: albumsData,
    isLoading: loadingAlbums,
    fetchNextPage: fetchNextAlbums,
    hasNextPage: hasNextAlbums,
    isFetchingNextPage: isFetchingNextAlbums,
    refetch: refetchAlbums,
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
    enabled: isReady && activeFilter === "albums",
  });

  // Artists query for "Artists" filter
  const {
    data: artistsData,
    isLoading: loadingArtists,
    fetchNextPage: fetchNextArtists,
    hasNextPage: hasNextArtists,
    isFetchingNextPage: isFetchingNextArtists,
    refetch: refetchArtists,
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
        limit: 100,
        startIndex: pageParam,
      });
      return {
        items: response.data.Items || [],
        totalCount: response.data.TotalRecordCount || 0,
        startIndex: pageParam,
      };
    },
    getNextPageParam: (lastPage) => {
      const nextStart = lastPage.startIndex + 100;
      return nextStart < lastPage.totalCount ? nextStart : undefined;
    },
    initialPageParam: 0,
    enabled: isReady && activeFilter === "artists",
  });

  // Playlists query for "Playlists" filter
  const {
    data: playlistsData,
    isLoading: loadingPlaylists,
    fetchNextPage: fetchNextPlaylists,
    hasNextPage: hasNextPlaylists,
    isFetchingNextPage: isFetchingNextPlaylists,
    refetch: refetchPlaylists,
  } = useInfiniteQuery({
    queryKey: ["music-playlists", libraryId, user?.Id],
    queryFn: async ({ pageParam = 0 }) => {
      const response = await getItemsApi(api!).getItems({
        userId: user?.Id,
        parentId: libraryId,
        includeItemTypes: ["Playlist"],
        sortBy: ["SortName"],
        sortOrder: ["Ascending"],
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
    enabled: isReady && activeFilter === "playlists",
  });

  const albums = useMemo(
    () => albumsData?.pages.flatMap((page) => page.items) || [],
    [albumsData],
  );

  const artists = useMemo(
    () => artistsData?.pages.flatMap((page) => page.items) || [],
    [artistsData],
  );

  const playlists = useMemo(
    () => playlistsData?.pages.flatMap((page) => page.items) || [],
    [playlistsData],
  );

  const handleRefresh = useCallback(() => {
    switch (activeFilter) {
      case "all":
        refetchLatest();
        refetchRecentlyPlayed();
        refetchFrequent();
        break;
      case "albums":
        refetchAlbums();
        break;
      case "artists":
        refetchArtists();
        break;
      case "playlists":
        refetchPlaylists();
        break;
    }
  }, [
    activeFilter,
    refetchLatest,
    refetchRecentlyPlayed,
    refetchFrequent,
    refetchAlbums,
    refetchArtists,
    refetchPlaylists,
  ]);

  const isLoading =
    (activeFilter === "all" &&
      (loadingLatest || loadingRecentlyPlayed || loadingFrequent)) ||
    (activeFilter === "albums" && loadingAlbums) ||
    (activeFilter === "artists" && loadingArtists) ||
    (activeFilter === "playlists" && loadingPlaylists);

  const filters: { key: FilterType; label: string }[] = [
    { key: "all", label: t("music.filters.all") },
    { key: "albums", label: t("music.tabs.albums") },
    { key: "artists", label: t("music.tabs.artists") },
    { key: "playlists", label: t("music.tabs.playlists") },
  ];

  const FilterBadge = ({
    filter,
    isActive,
    onPress,
  }: {
    filter: { key: FilterType; label: string };
    isActive: boolean;
    onPress: () => void;
  }) => (
    <TouchableOpacity
      onPress={onPress}
      className={`px-4 py-2 rounded-full mr-2 ${
        isActive ? "bg-purple-600" : "bg-neutral-800"
      }`}
    >
      <Text
        className={`text-sm font-medium ${
          isActive ? "text-white" : "text-neutral-300"
        }`}
      >
        {filter.label}
      </Text>
    </TouchableOpacity>
  );

  const FilterBadges = () => (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12 }}
    >
      {filters.map((filter) => (
        <FilterBadge
          key={filter.key}
          filter={filter}
          isActive={activeFilter === filter.key}
          onPress={() => setActiveFilter(filter.key)}
        />
      ))}
    </ScrollView>
  );

  if (!api || !user?.Id || !libraryId) {
    return (
      <View className='flex-1 justify-center items-center bg-black'>
        <Loader />
      </View>
    );
  }

  // "All" view - suggestions style
  if (activeFilter === "all") {
    const sections: {
      title: string;
      data: BaseItemDto[];
      type: "albums" | "tracks";
    }[] = [];

    if (latestAlbums && latestAlbums.length > 0) {
      sections.push({
        title: t("music.recently_added"),
        data: latestAlbums,
        type: "albums",
      });
    }

    if (recentlyPlayed && recentlyPlayed.length > 0) {
      sections.push({
        title: t("music.recently_played"),
        data: recentlyPlayed,
        type: "tracks",
      });
    }

    if (frequentlyPlayed && frequentlyPlayed.length > 0) {
      sections.push({
        title: t("music.frequently_played"),
        data: frequentlyPlayed,
        type: "tracks",
      });
    }

    if (isLoading) {
      return (
        <View className='flex-1 bg-black'>
          <View style={{ paddingTop: insets.top }} />
          <FilterBadges />
          <View className='flex-1 justify-center items-center'>
            <Loader />
          </View>
        </View>
      );
    }

    return (
      <FlashList
        data={sections}
        ListHeaderComponent={
          <>
            <View style={{ paddingTop: insets.top }} />
            <FilterBadges />
          </>
        }
        contentContainerStyle={{
          paddingBottom: insets.bottom + 100,
        }}
        refreshControl={
          <RefreshControl
            refreshing={false}
            onRefresh={handleRefresh}
            tintColor='#9334E9'
          />
        }
        renderItem={({ item: section }) => (
          <View className='mb-6'>
            <Text className='text-lg font-bold px-4 mb-3'>{section.title}</Text>
            {section.type === "albums" ? (
              <HorizontalScroll
                data={section.data}
                height={200}
                keyExtractor={(item) => item.Id!}
                renderItem={(item) => <MusicAlbumCard album={item} />}
              />
            ) : (
              <View className='px-4'>
                {section.data.slice(0, 5).map((track, index) => (
                  <MusicTrackItem
                    key={track.Id}
                    track={track}
                    index={index + 1}
                    queue={section.data}
                  />
                ))}
              </View>
            )}
          </View>
        )}
        keyExtractor={(item) => item.title}
        ListEmptyComponent={
          <View className='flex-1 justify-center items-center py-20'>
            <Ionicons name='musical-notes' size={48} color='#525252' />
            <Text className='text-neutral-500 mt-4'>
              {t("music.no_suggestions")}
            </Text>
          </View>
        }
      />
    );
  }

  // Grid view for Albums, Artists, Playlists
  const getGridData = () => {
    switch (activeFilter) {
      case "albums":
        return albums;
      case "artists":
        return artists;
      case "playlists":
        return playlists;
      default:
        return [];
    }
  };

  const getNumColumns = () => {
    switch (activeFilter) {
      case "artists":
        return 3;
      default:
        return 2;
    }
  };

  const numColumns = getNumColumns();
  const itemWidth =
    (screenWidth - padding * 2 - gap * (numColumns - 1)) / numColumns;

  const handleEndReached = () => {
    switch (activeFilter) {
      case "albums":
        if (hasNextAlbums && !isFetchingNextAlbums) fetchNextAlbums();
        break;
      case "artists":
        if (hasNextArtists && !isFetchingNextArtists) fetchNextArtists();
        break;
      case "playlists":
        if (hasNextPlaylists && !isFetchingNextPlaylists) fetchNextPlaylists();
        break;
    }
  };

  const isFetchingNext =
    isFetchingNextAlbums || isFetchingNextArtists || isFetchingNextPlaylists;

  const gridData = getGridData();

  if (isLoading) {
    return (
      <View className='flex-1 bg-black'>
        <View style={{ paddingTop: insets.top }} />
        <FilterBadges />
        <View className='flex-1 justify-center items-center'>
          <Loader />
        </View>
      </View>
    );
  }

  const getEmptyText = () => {
    switch (activeFilter) {
      case "albums":
        return t("music.no_albums");
      case "artists":
        return t("music.no_artists");
      case "playlists":
        return t("music.no_playlists");
      default:
        return "";
    }
  };

  const getEmptyIcon = () => {
    switch (activeFilter) {
      case "albums":
        return "disc";
      case "artists":
        return "people";
      case "playlists":
        return "list";
      default:
        return "musical-notes";
    }
  };

  return (
    <FlashList
      key={activeFilter}
      data={gridData}
      numColumns={numColumns}
      ListHeaderComponent={
        <>
          <View style={{ paddingTop: insets.top }} />
          <FilterBadges />
        </>
      }
      contentContainerStyle={{
        paddingBottom: insets.bottom + 100,
        paddingHorizontal: padding,
      }}
      refreshControl={
        <RefreshControl
          refreshing={false}
          onRefresh={handleRefresh}
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
          {activeFilter === "albums" && (
            <MusicAlbumCard album={item} width={itemWidth} />
          )}
          {activeFilter === "artists" && (
            <MusicArtistCard artist={item} size={itemWidth} />
          )}
          {activeFilter === "playlists" && (
            <MusicPlaylistCard playlist={item} width={itemWidth} />
          )}
        </View>
      )}
      keyExtractor={(item) => item.Id!}
      ListFooterComponent={
        isFetchingNext ? (
          <View className='py-4'>
            <Loader />
          </View>
        ) : null
      }
      ListEmptyComponent={
        <View className='flex-1 justify-center items-center py-20'>
          <Ionicons name={getEmptyIcon() as any} size={48} color='#525252' />
          <Text className='text-neutral-500 mt-4'>{getEmptyText()}</Text>
        </View>
      }
    />
  );
}

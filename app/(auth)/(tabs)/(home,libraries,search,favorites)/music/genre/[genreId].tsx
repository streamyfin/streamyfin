import { FlashList } from "@shopify/flash-list";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Stack, useLocalSearchParams } from "expo-router";
import { useCallback } from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/components/common/Text";
import { Loader } from "@/components/Loader";
import { AlbumCard } from "@/components/music/AlbumCard";
import type { Album } from "@/models/music/types";
import { useMusicApi } from "@/providers/MediaApiProvider";

const PAGE_SIZE = 36;

export default function GenreDetailScreen() {
  const { genreId, libraryId } = useLocalSearchParams<{
    genreId: string;
    libraryId?: string;
  }>();
  const insets = useSafeAreaInsets();
  const musicApi = useMusicApi();

  const decodedGenreName = decodeURIComponent(genreId || "");

  const {
    data: albumsData,
    isLoading,
    fetchNextPage,
    hasNextPage,
  } = useInfiniteQuery({
    queryKey: ["genre-albums", genreId, libraryId],
    queryFn: async ({ pageParam = 0 }) => {
      if (!genreId) return { items: [], totalCount: 0, startIndex: 0 };

      return musicApi.getAlbums({
        libraryId,
        genres: [decodedGenreName],
        startIndex: pageParam,
        limit: PAGE_SIZE,
        sortBy: ["SortName"],
        sortOrder: "Ascending",
      });
    },
    getNextPageParam: (lastPage) => {
      const nextIndex = lastPage.startIndex + lastPage.items.length;
      if (nextIndex < lastPage.totalCount) {
        return nextIndex;
      }
      return undefined;
    },
    initialPageParam: 0,
    enabled: !!genreId,
    staleTime: 30000,
  });

  const albums = albumsData?.pages.flatMap((p) => p.items) || [];
  const totalCount = albumsData?.pages[0]?.totalCount || 0;

  const renderAlbumItem = useCallback(
    ({ item }: { item: Album }) => <AlbumCard album={item} size='medium' />,
    [],
  );

  if (isLoading) {
    return (
      <View style={styles.container}>
        <Stack.Screen
          options={{
            headerShown: true,
            title: decodedGenreName,
            headerTransparent: false,
            headerStyle: { backgroundColor: "#121212" },
            headerTintColor: "white",
          }}
        />
        <View style={styles.loaderContainer}>
          <Loader />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: decodedGenreName,
          headerTransparent: false,
          headerStyle: { backgroundColor: "#121212" },
          headerTintColor: "white",
        }}
      />

      <View style={styles.header}>
        <Text style={styles.albumCount}>
          {totalCount} {totalCount === 1 ? "album" : "albums"}
        </Text>
      </View>

      <FlashList
        data={albums}
        renderItem={renderAlbumItem}
        keyExtractor={(item) => item.id}
        numColumns={2}
        contentContainerStyle={[
          styles.gridContent,
          { paddingBottom: insets.bottom + 100 },
        ]}
        onEndReached={() => hasNextPage && fetchNextPage()}
        onEndReachedThreshold={0.5}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0a0a0a",
  },
  loaderContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  header: {
    paddingHorizontal: 24,
    paddingVertical: 16,
  },
  albumCount: {
    fontSize: 14,
    color: "#9ca3af",
  },
  gridContent: {
    padding: 16,
  },
});

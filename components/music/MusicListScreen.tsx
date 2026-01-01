import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { FlashList, type FlashListRef } from "@shopify/flash-list";
import {
  type InfiniteData,
  type QueryKey,
  useInfiniteQuery,
} from "@tanstack/react-query";
import { Stack } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";
import { useDebounce } from "use-debounce";
import { Loader } from "@/components/Loader";
import { useGridColumns } from "@/hooks/useGridColumns";
import { AlphabetScrollBar, findIndexForLetter } from "./AlphabetScrollBar";

const PAGE_SIZE = 50;
const ALPHABET_SCROLL_BAR_WIDTH = 24;

/**
 * Paginated response from music API
 */
export interface PaginatedResponse<T> {
  items: T[];
  totalCount: number;
  startIndex: number;
}

/**
 * Fetch parameters for the query function
 */
export interface FetchParams {
  libraryId: string | undefined;
  searchTerm?: string;
  startIndex: number;
  limit?: number;
}

/**
 * Configuration for MusicListScreen
 */
export interface MusicListScreenConfig<T> {
  /** Screen title shown in header */
  title: string;
  /** Base query key (libraryId and search will be appended) */
  queryKeyPrefix: string;
  /** Library ID from route params */
  libraryId: string | undefined;
  /** Function to fetch items */
  fetchFn: (params: FetchParams) => Promise<PaginatedResponse<T>>;
  /** Render function for each item */
  renderItem: (item: T, itemSize: number) => React.ReactElement;
  /** Extract unique key from item */
  keyExtractor: (item: T) => string;
  /** Enable search functionality */
  searchEnabled?: boolean;
  /** Search placeholder text */
  searchPlaceholder?: string;
  /** Enable alphabet scroll bar */
  alphabetScrollEnabled?: boolean;
  /** Extract jellyfinItem for alphabet scroll (required if alphabetScrollEnabled) */
  getJellyfinItem?: (item: T) => BaseItemDto;
  /** Always paginate (vs only when searching) */
  alwaysPaginate?: boolean;
  /** Minimum physical size in cm for grid items (default 1.5) */
  minPhysicalSizeCm?: number;
}

/**
 * Generic music list screen with search, alphabet scroll, and infinite loading
 */
export function MusicListScreen<T>({
  title,
  queryKeyPrefix,
  libraryId,
  fetchFn,
  renderItem,
  keyExtractor,
  searchEnabled = false,
  searchPlaceholder = "Search...",
  alphabetScrollEnabled = false,
  getJellyfinItem,
  alwaysPaginate = false,
  minPhysicalSizeCm = 1.5,
}: MusicListScreenConfig<T>) {
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery] = useDebounce(searchQuery, 300);

  const listRef = useRef<FlashListRef<T>>(null);

  // Show alphabet scroll only when enabled and not searching
  const showAlphabetScroll = alphabetScrollEnabled && !debouncedSearchQuery;

  // Calculate grid columns based on physical size
  const { columns, itemSize } = useGridColumns({
    minPhysicalSizeCm,
    horizontalPadding: 32, // 16px on each side
    gap: 8,
    extraPadding: showAlphabetScroll ? ALPHABET_SCROLL_BAR_WIDTH : 0,
  });

  const queryKey: QueryKey = useMemo(
    () =>
      searchEnabled
        ? [queryKeyPrefix, libraryId, debouncedSearchQuery]
        : [queryKeyPrefix, libraryId],
    [queryKeyPrefix, libraryId, debouncedSearchQuery, searchEnabled],
  );

  const { data, isLoading, fetchNextPage, hasNextPage } = useInfiniteQuery<
    PaginatedResponse<T>,
    Error,
    InfiniteData<PaginatedResponse<T>>,
    QueryKey,
    number
  >({
    queryKey,
    queryFn: async ({ pageParam = 0 }) => {
      // Determine pagination strategy:
      // - If alwaysPaginate: always use PAGE_SIZE
      // - If searching: use PAGE_SIZE
      // - Otherwise: fetch all (no limit) for alphabet scroll
      const shouldPaginate = alwaysPaginate || debouncedSearchQuery;

      const result = await fetchFn({
        libraryId,
        searchTerm: debouncedSearchQuery || undefined,
        startIndex: pageParam,
        limit: shouldPaginate ? PAGE_SIZE : undefined,
      });

      return result;
    },
    getNextPageParam: (lastPage) => {
      // Don't paginate in browse mode (when not searching and not alwaysPaginate)
      if (!alwaysPaginate && !debouncedSearchQuery) return undefined;

      const nextIndex = lastPage.startIndex + lastPage.items.length;
      if (nextIndex < lastPage.totalCount) {
        return nextIndex;
      }
      return undefined;
    },
    initialPageParam: 0,
    enabled: !!libraryId,
    staleTime: 30000,
  });

  const items = useMemo(
    () => data?.pages.flatMap((p) => p.items) || [],
    [data],
  );

  const renderItemCallback = useCallback(
    ({ item }: { item: T }) => renderItem(item, itemSize),
    [renderItem, itemSize],
  );

  const handleLetterPress = useCallback(
    (letter: string) => {
      if (!items.length || !getJellyfinItem) return;

      const index = findIndexForLetter(items.map(getJellyfinItem), letter);
      listRef.current?.scrollToIndex({ index, animated: true });
    },
    [items, getJellyfinItem],
  );

  const handleEndReached = useCallback(() => {
    if (hasNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, fetchNextPage]);

  // Common header options
  const headerOptions = useMemo(
    () => ({
      headerShown: true,
      title,
      headerTransparent: false,
      headerStyle: { backgroundColor: "#121212" },
      headerTintColor: "white",
    }),
    [title],
  );

  return (
    <View style={styles.container}>
      <Stack.Screen options={headerOptions} />

      {searchEnabled && (
        <View style={styles.searchContainer}>
          <TextInput
            style={styles.searchInput}
            placeholder={searchPlaceholder}
            placeholderTextColor='#6b7280'
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize='none'
            autoCorrect={false}
            clearButtonMode='while-editing'
            blurOnSubmit={false}
            returnKeyType='search'
          />
        </View>
      )}

      {isLoading ? (
        <View style={styles.loaderContainer}>
          <Loader />
        </View>
      ) : (
        <>
          <FlashList
            ref={listRef}
            data={items}
            renderItem={renderItemCallback}
            keyExtractor={keyExtractor}
            numColumns={columns}
            contentContainerStyle={[
              styles.gridContent,
              showAlphabetScroll && styles.gridContentWithScrollBar,
            ]}
            onEndReached={handleEndReached}
            onEndReachedThreshold={0.5}
            showsVerticalScrollIndicator={!showAlphabetScroll}
          />

          {showAlphabetScroll && (
            <AlphabetScrollBar onLetterPress={handleLetterPress} />
          )}
        </>
      )}
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
  searchContainer: {
    padding: 16,
    paddingBottom: 8,
  },
  searchInput: {
    backgroundColor: "#1c1c1e",
    color: "white",
    fontSize: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
  },
  gridContent: {
    padding: 16,
    paddingBottom: 150, // Account for miniplayer + tab bar
  },
  gridContentWithScrollBar: {
    paddingRight: 40,
  },
});

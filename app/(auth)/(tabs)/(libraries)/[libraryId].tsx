import type {
  BaseItemDto,
  BaseItemDtoQueryResult,
  BaseItemKind,
} from "@jellyfin/sdk/lib/generated-client/models";
import {
  getFilterApi,
  getItemsApi,
  getUserLibraryApi,
} from "@jellyfin/sdk/lib/utils/api";
import { FlashList } from "@shopify/flash-list";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useLocalSearchParams, useNavigation } from "expo-router";
import { useAtom } from "jotai";
import React, { useCallback, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { FlatList, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/components/common/Text";
import { TouchableItemRouter } from "@/components/common/TouchableItemRouter";
import { FilterButton } from "@/components/filters/FilterButton";
import { ResetFiltersButton } from "@/components/filters/ResetFiltersButton";
import { ItemCardText } from "@/components/ItemCardText";
import { Loader } from "@/components/Loader";
import { ItemPoster } from "@/components/posters/ItemPoster";
import { useOrientation } from "@/hooks/useOrientation";
import * as ScreenOrientation from "@/packages/expo-screen-orientation";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { useVideoApi } from "@/providers/MediaApiProvider";
import { useOfflineLibrary } from "@/providers/OfflineLibrary/OfflineLibraryProvider";
import { OfflineVideoApi } from "@/services/api/offline/OfflineVideoApi";
import {
  genreFilterAtom,
  getSortByPreference,
  getSortOrderPreference,
  SortByOption,
  SortOrderOption,
  sortByAtom,
  sortByPreferenceAtom,
  sortOptions,
  sortOrderAtom,
  sortOrderOptions,
  sortOrderPreferenceAtom,
  tagsFilterAtom,
  yearFilterAtom,
} from "@/utils/atoms/filters";

const Page = () => {
  const searchParams = useLocalSearchParams();
  const { libraryId } = searchParams as { libraryId: string };

  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);
  const { offlineMode } = useOfflineLibrary();
  const videoApi = useVideoApi();
  const { width: screenWidth } = useWindowDimensions();

  const [selectedGenres, setSelectedGenres] = useAtom(genreFilterAtom);
  const [selectedYears, setSelectedYears] = useAtom(yearFilterAtom);
  const [selectedTags, setSelectedTags] = useAtom(tagsFilterAtom);
  const [sortBy, _setSortBy] = useAtom(sortByAtom);
  const [sortOrder, _setSortOrder] = useAtom(sortOrderAtom);
  const [sortByPreference, setSortByPreference] = useAtom(sortByPreferenceAtom);
  const [sortOrderPreference, setOderByPreference] = useAtom(
    sortOrderPreferenceAtom,
  );

  const { orientation } = useOrientation();

  const { t } = useTranslation();

  useEffect(() => {
    const sop = getSortOrderPreference(libraryId, sortOrderPreference);
    if (sop) {
      _setSortOrder([sop]);
    } else {
      _setSortOrder([SortOrderOption.Ascending]);
    }
    const obp = getSortByPreference(libraryId, sortByPreference);
    if (obp) {
      _setSortBy([obp]);
    } else {
      _setSortBy([SortByOption.SortName]);
    }
  }, [
    libraryId,
    sortOrderPreference,
    sortByPreference,
    _setSortOrder,
    _setSortBy,
  ]);

  const setSortBy = useCallback(
    (sortBy: SortByOption[]) => {
      const sop = getSortByPreference(libraryId, sortByPreference);
      if (sortBy[0] !== sop) {
        setSortByPreference({ ...sortByPreference, [libraryId]: sortBy[0] });
      }
      _setSortBy(sortBy);
    },
    [libraryId, sortByPreference, setSortByPreference, _setSortBy],
  );

  const setSortOrder = useCallback(
    (sortOrder: SortOrderOption[]) => {
      const sop = getSortOrderPreference(libraryId, sortOrderPreference);
      if (sortOrder[0] !== sop) {
        setOderByPreference({
          ...sortOrderPreference,
          [libraryId]: sortOrder[0],
        });
      }
      _setSortOrder(sortOrder);
    },
    [libraryId, sortOrderPreference, setOderByPreference, _setSortOrder],
  );

  const nrOfCols = useMemo(() => {
    if (screenWidth < 300) return 2;
    if (screenWidth < 500) return 3;
    if (screenWidth < 800) return 5;
    if (screenWidth < 1000) return 6;
    if (screenWidth < 1500) return 7;
    return 6;
  }, [screenWidth, orientation]);

  // Virtual library info for offline mode
  const virtualLibrary = useMemo((): BaseItemDto | null => {
    if (libraryId === "offline-movies") {
      return {
        Id: "offline-movies",
        Name: "Movies (Offline)",
        CollectionType: "movies",
        Type: "CollectionFolder",
      } as BaseItemDto;
    }
    if (libraryId === "offline-tvshows") {
      return {
        Id: "offline-tvshows",
        Name: "TV Shows (Offline)",
        CollectionType: "tvshows",
        Type: "CollectionFolder",
      } as BaseItemDto;
    }
    return null;
  }, [libraryId]);

  const { data: serverLibrary, isLoading: isLibraryLoading } = useQuery({
    queryKey: ["library", libraryId],
    queryFn: async () => {
      if (!api) return null;
      const response = await getUserLibraryApi(api).getItem({
        itemId: libraryId,
        userId: user?.Id,
      });
      return response.data;
    },
    // Skip server query for virtual offline libraries
    enabled: !!api && !!user?.Id && !!libraryId && !virtualLibrary,
    staleTime: 60 * 1000,
  });

  // Use virtual library info for offline mode, otherwise use server library
  const library = virtualLibrary || serverLibrary;

  const navigation = useNavigation();
  useEffect(() => {
    navigation.setOptions({
      title: library?.Name || "",
    });
  }, [library]);

  const fetchItems = useCallback(
    async ({
      pageParam,
    }: {
      pageParam: number;
    }): Promise<BaseItemDtoQueryResult | null> => {
      if (!library) return null;

      const limit = 36;

      // For virtual offline libraries, always use OfflineVideoApi directly
      // This ensures offline content is shown even when network is connected
      const isVirtualOfflineLibrary = !!virtualLibrary;
      const effectiveApi = isVirtualOfflineLibrary
        ? new OfflineVideoApi()
        : videoApi;

      // Use unified Video API for movies and TV shows
      if (library.CollectionType === "movies") {
        const result = await effectiveApi.getMovies({
          libraryId: isVirtualOfflineLibrary ? undefined : libraryId, // Don't filter by libraryId for offline content
          searchTerm: selectedGenres.length > 0 ? undefined : undefined,
          sortBy: sortBy[0] ? [sortBy[0]] : undefined,
          sortOrder: sortOrder[0],
          startIndex: pageParam,
          limit,
        });

        return {
          Items: result.items.map((movie) => movie.jellyfinItem),
          TotalRecordCount: result.totalCount,
          StartIndex: result.startIndex,
        };
      }

      if (library.CollectionType === "tvshows") {
        const result = await effectiveApi.getSeries({
          libraryId: isVirtualOfflineLibrary ? undefined : libraryId,
          searchTerm: selectedGenres.length > 0 ? undefined : undefined,
          sortBy: sortBy[0] ? [sortBy[0]] : undefined,
          sortOrder: sortOrder[0],
          startIndex: pageParam,
          limit,
        });

        return {
          Items: result.items.map((series) => series.jellyfinItem),
          TotalRecordCount: result.totalCount,
          StartIndex: result.startIndex,
        };
      }

      // For non-video libraries (music, boxsets), use direct Jellyfin API
      // These only work in online mode
      if (!api) return null;

      let itemType: BaseItemKind | undefined;
      if (library.CollectionType === "boxsets") {
        itemType = "BoxSet";
      } else if (library.CollectionType === "music") {
        itemType = "MusicAlbum";
      }

      const response = await getItemsApi(api).getItems({
        userId: user?.Id,
        parentId: libraryId,
        limit,
        startIndex: pageParam,
        sortBy: [sortBy[0], "SortName", "ProductionYear"],
        sortOrder: [sortOrder[0]],
        enableImageTypes: ["Primary", "Backdrop", "Banner", "Thumb"],
        recursive: true,
        imageTypeLimit: 1,
        fields: ["PrimaryImageAspectRatio", "SortName"],
        genres: selectedGenres,
        tags: selectedTags,
        years: selectedYears.map((year) => Number.parseInt(year, 10)),
        includeItemTypes: itemType ? [itemType] : undefined,
      });

      return response.data || null;
    },
    [
      api,
      user?.Id,
      libraryId,
      library,
      virtualLibrary,
      videoApi,
      selectedGenres,
      selectedYears,
      selectedTags,
      sortBy,
      sortOrder,
    ],
  );

  const { data, isFetching, fetchNextPage, hasNextPage, isLoading } =
    useInfiniteQuery({
      queryKey: [
        "library-items",
        libraryId,
        offlineMode, // Refetch when switching between online/offline
        selectedGenres,
        selectedYears,
        selectedTags,
        sortBy,
        sortOrder,
      ],
      queryFn: fetchItems,
      getNextPageParam: (lastPage, pages) => {
        if (
          !lastPage?.Items ||
          !lastPage?.TotalRecordCount ||
          lastPage?.TotalRecordCount === 0
        )
          return undefined;

        const totalItems = lastPage.TotalRecordCount;
        const accumulatedItems = pages.reduce(
          (acc, curr) => acc + (curr?.Items?.length || 0),
          0,
        );

        if (accumulatedItems < totalItems) {
          return lastPage?.Items?.length * pages.length;
        }
        return undefined;
      },
      initialPageParam: 0,
      // For virtual offline libraries, we don't need api/user - just need library info
      enabled: !!library && (!!virtualLibrary || (!!api && !!user?.Id)),
    });

  const flatData = useMemo(() => {
    return (
      (data?.pages.flatMap((p) => p?.Items).filter(Boolean) as BaseItemDto[]) ||
      []
    );
  }, [data]);

  const renderItem = useCallback(
    ({ item, index }: { item: BaseItemDto; index: number }) => (
      <TouchableItemRouter
        key={item.Id}
        style={{
          width: "100%",
          marginBottom: 4,
        }}
        item={item}
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
          {/* <MoviePoster item={item} /> */}
          <ItemPoster item={item} />
          <ItemCardText item={item} />
        </View>
      </TouchableItemRouter>
    ),
    [orientation, nrOfCols],
  );

  const keyExtractor = useCallback((item: BaseItemDto) => item.Id || "", []);

  const ListHeaderComponent = useCallback(
    () => (
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          display: "flex",
          paddingHorizontal: 15,
          paddingVertical: 16,
          flexDirection: "row",
        }}
        data={[
          {
            key: "reset",
            component: <ResetFiltersButton />,
          },
          {
            key: "genre",
            component: (
              <FilterButton
                className='mr-1'
                id={libraryId}
                queryKey='genreFilter'
                queryFn={async () => {
                  if (!api) return null;
                  const response = await getFilterApi(
                    api,
                  ).getQueryFiltersLegacy({
                    userId: user?.Id,
                    parentId: libraryId,
                  });
                  return response.data.Genres || [];
                }}
                set={setSelectedGenres}
                values={selectedGenres}
                title={t("library.filters.genres")}
                renderItemLabel={(item) => item.toString()}
                searchFilter={(item, search) =>
                  item.toLowerCase().includes(search.toLowerCase())
                }
              />
            ),
          },
          {
            key: "year",
            component: (
              <FilterButton
                className='mr-1'
                id={libraryId}
                queryKey='yearFilter'
                queryFn={async () => {
                  if (!api) return null;
                  const response = await getFilterApi(
                    api,
                  ).getQueryFiltersLegacy({
                    userId: user?.Id,
                    parentId: libraryId,
                  });
                  return response.data.Years || [];
                }}
                set={setSelectedYears}
                values={selectedYears}
                title={t("library.filters.years")}
                renderItemLabel={(item) => item.toString()}
                searchFilter={(item, search) => item.includes(search)}
              />
            ),
          },
          {
            key: "tags",
            component: (
              <FilterButton
                className='mr-1'
                id={libraryId}
                queryKey='tagsFilter'
                queryFn={async () => {
                  if (!api) return null;
                  const response = await getFilterApi(
                    api,
                  ).getQueryFiltersLegacy({
                    userId: user?.Id,
                    parentId: libraryId,
                  });
                  return response.data.Tags || [];
                }}
                set={setSelectedTags}
                values={selectedTags}
                title={t("library.filters.tags")}
                renderItemLabel={(item) => item.toString()}
                searchFilter={(item, search) =>
                  item.toLowerCase().includes(search.toLowerCase())
                }
              />
            ),
          },
          {
            key: "sortBy",
            component: (
              <FilterButton
                className='mr-1'
                id={libraryId}
                queryKey='sortBy'
                queryFn={async () => sortOptions.map((s) => s.key)}
                set={setSortBy}
                values={sortBy}
                title={t("library.filters.sort_by")}
                renderItemLabel={(item) =>
                  sortOptions.find((i) => i.key === item)?.value || ""
                }
                searchFilter={(item, search) =>
                  item.toLowerCase().includes(search.toLowerCase())
                }
              />
            ),
          },
          {
            key: "sortOrder",
            component: (
              <FilterButton
                className='mr-1'
                id={libraryId}
                queryKey='sortOrder'
                queryFn={async () => sortOrderOptions.map((s) => s.key)}
                set={setSortOrder}
                values={sortOrder}
                title={t("library.filters.sort_order")}
                renderItemLabel={(item) =>
                  sortOrderOptions.find((i) => i.key === item)?.value || ""
                }
                searchFilter={(item, search) =>
                  item.toLowerCase().includes(search.toLowerCase())
                }
              />
            ),
          },
        ]}
        renderItem={({ item }) => item.component}
        keyExtractor={(item) => item.key}
      />
    ),
    [
      libraryId,
      api,
      user?.Id,
      selectedGenres,
      setSelectedGenres,
      selectedYears,
      setSelectedYears,
      selectedTags,
      setSelectedTags,
      sortBy,
      setSortBy,
      sortOrder,
      setSortOrder,
      isFetching,
    ],
  );

  const insets = useSafeAreaInsets();

  if (isLoading || isLibraryLoading)
    return (
      <View className='w-full h-full flex items-center justify-center'>
        <Loader />
      </View>
    );

  return (
    <FlashList
      key={orientation}
      ListEmptyComponent={
        <View className='flex flex-col items-center justify-center h-full'>
          <Text className='font-bold text-xl text-neutral-500'>
            {t("library.no_results")}
          </Text>
        </View>
      }
      contentInsetAdjustmentBehavior='automatic'
      data={flatData}
      renderItem={renderItem}
      extraData={[orientation, nrOfCols]}
      keyExtractor={keyExtractor}
      numColumns={nrOfCols}
      onEndReached={() => {
        if (hasNextPage) {
          fetchNextPage();
        }
      }}
      onEndReachedThreshold={1}
      ListHeaderComponent={ListHeaderComponent}
      contentContainerStyle={{
        paddingBottom: 24,
        paddingLeft: insets.left,
        paddingRight: insets.right,
      }}
    />
  );
};

export default React.memo(Page);

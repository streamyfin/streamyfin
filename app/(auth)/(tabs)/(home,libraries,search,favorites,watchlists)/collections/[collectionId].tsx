import type {
  BaseItemDto,
  BaseItemDtoQueryResult,
  ItemSortBy,
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
import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { FlatList, Platform, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/components/common/Text";
import {
  getItemNavigation,
  TouchableItemRouter,
} from "@/components/common/TouchableItemRouter";
import { FilterButton } from "@/components/filters/FilterButton";
import { ResetFiltersButton } from "@/components/filters/ResetFiltersButton";
import { ItemCardText } from "@/components/ItemCardText";
import { Loader } from "@/components/Loader";
import { ItemPoster } from "@/components/posters/ItemPoster";
import MoviePoster from "@/components/posters/MoviePoster.tv";
import SeriesPoster from "@/components/posters/SeriesPoster.tv";
import {
  TVFilterButton,
  TVFocusablePoster,
  TVItemCardText,
} from "@/components/tv";
import { useScaledTVPosterSizes } from "@/constants/TVPosterSizes";
import useRouter from "@/hooks/useAppRouter";
import { useTVOptionModal } from "@/hooks/useTVOptionModal";
import * as ScreenOrientation from "@/packages/expo-screen-orientation";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import {
  genreFilterAtom,
  SortByOption,
  SortOrderOption,
  sortByAtom,
  sortOptions,
  sortOrderAtom,
  sortOrderOptions,
  tagsFilterAtom,
  yearFilterAtom,
} from "@/utils/atoms/filters";
import type { TVOptionItem } from "@/utils/atoms/tvOptionModal";

const TV_ITEM_GAP = 16;
const TV_SCALE_PADDING = 20;

const page: React.FC = () => {
  const searchParams = useLocalSearchParams();
  const { collectionId } = searchParams as { collectionId: string };

  const posterSizes = useScaledTVPosterSizes();
  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);
  const navigation = useNavigation();
  const router = useRouter();
  const { showOptions } = useTVOptionModal();
  const { width: screenWidth } = useWindowDimensions();
  const [orientation, _setOrientation] = useState(
    ScreenOrientation.Orientation.PORTRAIT_UP,
  );

  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  const [selectedGenres, setSelectedGenres] = useAtom(genreFilterAtom);
  const [selectedYears, setSelectedYears] = useAtom(yearFilterAtom);
  const [selectedTags, setSelectedTags] = useAtom(tagsFilterAtom);
  const [sortBy, setSortBy] = useAtom(sortByAtom);
  const [sortOrder, setSortOrder] = useAtom(sortOrderAtom);

  const { data: collection, isLoading: isCollectionLoading } = useQuery({
    queryKey: ["collection", collectionId],
    queryFn: async () => {
      if (!api) return null;
      const response = await getUserLibraryApi(api).getItem({
        itemId: collectionId,
        userId: user?.Id,
      });
      const data = response.data;
      return data;
    },
    enabled: !!api && !!user?.Id && !!collectionId,
    staleTime: 60 * 1000,
  });

  // TV Filter queries
  const { data: tvGenreOptions } = useQuery({
    queryKey: ["filters", "Genres", "tvGenreFilter", collectionId],
    queryFn: async () => {
      if (!api) return [];
      const response = await getFilterApi(api).getQueryFiltersLegacy({
        userId: user?.Id,
        parentId: collectionId,
      });
      return response.data.Genres || [];
    },
    enabled: Platform.isTV && !!api && !!user?.Id && !!collectionId,
  });

  const { data: tvYearOptions } = useQuery({
    queryKey: ["filters", "Years", "tvYearFilter", collectionId],
    queryFn: async () => {
      if (!api) return [];
      const response = await getFilterApi(api).getQueryFiltersLegacy({
        userId: user?.Id,
        parentId: collectionId,
      });
      return response.data.Years || [];
    },
    enabled: Platform.isTV && !!api && !!user?.Id && !!collectionId,
  });

  const { data: tvTagOptions } = useQuery({
    queryKey: ["filters", "Tags", "tvTagFilter", collectionId],
    queryFn: async () => {
      if (!api) return [];
      const response = await getFilterApi(api).getQueryFiltersLegacy({
        userId: user?.Id,
        parentId: collectionId,
      });
      return response.data.Tags || [];
    },
    enabled: Platform.isTV && !!api && !!user?.Id && !!collectionId,
  });

  useEffect(() => {
    navigation.setOptions({ title: collection?.Name || "" });
    setSortOrder([SortOrderOption.Ascending]);

    if (!collection) return;

    // Convert the DisplayOrder to SortByOption
    const displayOrder = collection.DisplayOrder as ItemSortBy;
    const sortByOption = displayOrder
      ? SortByOption[displayOrder as keyof typeof SortByOption] ||
        SortByOption.PremiereDate
      : SortByOption.PremiereDate;

    setSortBy([sortByOption]);
  }, [navigation, collection]);

  // Calculate columns for TV grid
  const nrOfCols = useMemo(() => {
    if (Platform.isTV) {
      const itemWidth = posterSizes.poster + TV_ITEM_GAP;
      return Math.max(
        1,
        Math.floor((screenWidth - TV_SCALE_PADDING * 2) / itemWidth),
      );
    }
    return orientation === ScreenOrientation.Orientation.PORTRAIT_UP ? 3 : 5;
  }, [screenWidth, orientation]);

  const fetchItems = useCallback(
    async ({
      pageParam,
    }: {
      pageParam: number;
    }): Promise<BaseItemDtoQueryResult | null> => {
      if (!api || !collection) return null;

      const response = await getItemsApi(api).getItems({
        userId: user?.Id,
        parentId: collectionId,
        limit: Platform.isTV ? 36 : 18,
        startIndex: pageParam,
        // Set one ordering at a time. As collections do not work with correctly with multiple.
        sortBy: [sortBy[0]],
        sortOrder: [sortOrder[0]],
        fields: [
          "ItemCounts",
          "PrimaryImageAspectRatio",
          "CanDelete",
          "MediaSourceCount",
        ],
        // true is needed for merged versions
        recursive: true,
        genres: selectedGenres,
        tags: selectedTags,
        years: selectedYears.map((year) => Number.parseInt(year, 10)),
        includeItemTypes: ["Movie", "Series"],
      });

      return response.data || null;
    },
    [
      api,
      user?.Id,
      collection,
      collectionId,
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
        "collection-items",
        collectionId,
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
      enabled: !!api && !!user?.Id && !!collection,
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
          marginBottom:
            orientation === ScreenOrientation.Orientation.PORTRAIT_UP ? 4 : 16,
        }}
        item={item}
      >
        <View
          style={{
            alignSelf:
              index % 3 === 0
                ? "flex-end"
                : (index + 1) % 3 === 0
                  ? "flex-start"
                  : "center",
            width: "89%",
          }}
        >
          <ItemPoster item={item} />
          <ItemCardText item={item} />
        </View>
      </TouchableItemRouter>
    ),
    [orientation],
  );

  const renderTVItem = useCallback(
    ({ item }: { item: BaseItemDto }) => {
      const handlePress = () => {
        const navTarget = getItemNavigation(item, "(home)");
        router.push(navTarget as any);
      };

      return (
        <View
          style={{
            marginRight: TV_ITEM_GAP,
            marginBottom: TV_ITEM_GAP,
            width: posterSizes.poster,
          }}
        >
          <TVFocusablePoster onPress={handlePress}>
            {item.Type === "Movie" && <MoviePoster item={item} />}
            {(item.Type === "Series" || item.Type === "Episode") && (
              <SeriesPoster item={item} />
            )}
            {item.Type !== "Movie" &&
              item.Type !== "Series" &&
              item.Type !== "Episode" && <MoviePoster item={item} />}
          </TVFocusablePoster>
          <TVItemCardText item={item} />
        </View>
      );
    },
    [router],
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
        extraData={[
          selectedGenres,
          selectedYears,
          selectedTags,
          sortBy,
          sortOrder,
        ]}
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
                id={collectionId}
                queryKey='genreFilter'
                queryFn={async () => {
                  if (!api) return null;
                  const response = await getFilterApi(
                    api,
                  ).getQueryFiltersLegacy({
                    userId: user?.Id,
                    parentId: collectionId,
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
                id={collectionId}
                queryKey='yearFilter'
                queryFn={async () => {
                  if (!api) return null;
                  const response = await getFilterApi(
                    api,
                  ).getQueryFiltersLegacy({
                    userId: user?.Id,
                    parentId: collectionId,
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
                id={collectionId}
                queryKey='tagsFilter'
                queryFn={async () => {
                  if (!api) return null;
                  const response = await getFilterApi(
                    api,
                  ).getQueryFiltersLegacy({
                    userId: user?.Id,
                    parentId: collectionId,
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
                id={collectionId}
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
                id={collectionId}
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
      collectionId,
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

  // TV Filter options - with "All" option for clearable filters
  const tvGenreFilterOptions = useMemo(
    (): TVOptionItem<string>[] => [
      {
        label: t("library.filters.all"),
        value: "__all__",
        selected: selectedGenres.length === 0,
      },
      ...(tvGenreOptions || []).map((genre) => ({
        label: genre,
        value: genre,
        selected: selectedGenres.includes(genre),
      })),
    ],
    [tvGenreOptions, selectedGenres, t],
  );

  const tvYearFilterOptions = useMemo(
    (): TVOptionItem<string>[] => [
      {
        label: t("library.filters.all"),
        value: "__all__",
        selected: selectedYears.length === 0,
      },
      ...(tvYearOptions || []).map((year) => ({
        label: String(year),
        value: String(year),
        selected: selectedYears.includes(String(year)),
      })),
    ],
    [tvYearOptions, selectedYears, t],
  );

  const tvTagFilterOptions = useMemo(
    (): TVOptionItem<string>[] => [
      {
        label: t("library.filters.all"),
        value: "__all__",
        selected: selectedTags.length === 0,
      },
      ...(tvTagOptions || []).map((tag) => ({
        label: tag,
        value: tag,
        selected: selectedTags.includes(tag),
      })),
    ],
    [tvTagOptions, selectedTags, t],
  );

  const tvSortByOptions = useMemo(
    (): TVOptionItem<SortByOption>[] =>
      sortOptions.map((option) => ({
        label: option.value,
        value: option.key,
        selected: sortBy[0] === option.key,
      })),
    [sortBy],
  );

  const tvSortOrderOptions = useMemo(
    (): TVOptionItem<SortOrderOption>[] =>
      sortOrderOptions.map((option) => ({
        label: option.value,
        value: option.key,
        selected: sortOrder[0] === option.key,
      })),
    [sortOrder],
  );

  // TV Filter handlers using navigation-based modal
  const handleShowGenreFilter = useCallback(() => {
    showOptions({
      title: t("library.filters.genres"),
      options: tvGenreFilterOptions,
      onSelect: (value: string) => {
        if (value === "__all__") {
          setSelectedGenres([]);
        } else if (selectedGenres.includes(value)) {
          setSelectedGenres(selectedGenres.filter((g) => g !== value));
        } else {
          setSelectedGenres([...selectedGenres, value]);
        }
      },
    });
  }, [showOptions, t, tvGenreFilterOptions, selectedGenres, setSelectedGenres]);

  const handleShowYearFilter = useCallback(() => {
    showOptions({
      title: t("library.filters.years"),
      options: tvYearFilterOptions,
      onSelect: (value: string) => {
        if (value === "__all__") {
          setSelectedYears([]);
        } else if (selectedYears.includes(value)) {
          setSelectedYears(selectedYears.filter((y) => y !== value));
        } else {
          setSelectedYears([...selectedYears, value]);
        }
      },
    });
  }, [showOptions, t, tvYearFilterOptions, selectedYears, setSelectedYears]);

  const handleShowTagFilter = useCallback(() => {
    showOptions({
      title: t("library.filters.tags"),
      options: tvTagFilterOptions,
      onSelect: (value: string) => {
        if (value === "__all__") {
          setSelectedTags([]);
        } else if (selectedTags.includes(value)) {
          setSelectedTags(selectedTags.filter((tag) => tag !== value));
        } else {
          setSelectedTags([...selectedTags, value]);
        }
      },
    });
  }, [showOptions, t, tvTagFilterOptions, selectedTags, setSelectedTags]);

  const handleShowSortByFilter = useCallback(() => {
    showOptions({
      title: t("library.filters.sort_by"),
      options: tvSortByOptions,
      onSelect: (value: SortByOption) => {
        setSortBy([value]);
      },
    });
  }, [showOptions, t, tvSortByOptions, setSortBy]);

  const handleShowSortOrderFilter = useCallback(() => {
    showOptions({
      title: t("library.filters.sort_order"),
      options: tvSortOrderOptions,
      onSelect: (value: SortOrderOption) => {
        setSortOrder([value]);
      },
    });
  }, [showOptions, t, tvSortOrderOptions, setSortOrder]);

  // TV filter bar state
  const hasActiveFilters =
    selectedGenres.length > 0 ||
    selectedYears.length > 0 ||
    selectedTags.length > 0;

  const resetAllFilters = useCallback(() => {
    setSelectedGenres([]);
    setSelectedYears([]);
    setSelectedTags([]);
  }, [setSelectedGenres, setSelectedYears, setSelectedTags]);

  if (isLoading || isCollectionLoading) {
    return (
      <View className='w-full h-full flex items-center justify-center'>
        <Loader />
      </View>
    );
  }

  if (!collection) return null;

  // Mobile return
  if (!Platform.isTV) {
    return (
      <FlashList
        ListEmptyComponent={
          <View className='flex flex-col items-center justify-center h-full'>
            <Text className='font-bold text-xl text-neutral-500'>
              {t("search.no_results")}
            </Text>
          </View>
        }
        extraData={[
          selectedGenres,
          selectedYears,
          selectedTags,
          sortBy,
          sortOrder,
        ]}
        contentInsetAdjustmentBehavior='automatic'
        data={flatData}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        numColumns={nrOfCols}
        onEndReached={() => {
          if (hasNextPage) {
            fetchNextPage();
          }
        }}
        onEndReachedThreshold={0.5}
        ListHeaderComponent={ListHeaderComponent}
        contentContainerStyle={{ paddingBottom: 24 }}
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

  // TV return with filter bar
  return (
    <View style={{ flex: 1 }}>
      {/* Filter bar */}
      <View
        style={{
          flexDirection: "row",
          flexWrap: "nowrap",
          marginTop: insets.top + 100,
          paddingBottom: 8,
          paddingHorizontal: TV_SCALE_PADDING,
          gap: 12,
        }}
      >
        {hasActiveFilters && (
          <TVFilterButton
            label=''
            value={t("library.filters.reset")}
            onPress={resetAllFilters}
            hasActiveFilter
          />
        )}
        <TVFilterButton
          label={t("library.filters.genres")}
          value={
            selectedGenres.length > 0
              ? `${selectedGenres.length} selected`
              : t("library.filters.all")
          }
          onPress={handleShowGenreFilter}
          hasTVPreferredFocus={!hasActiveFilters}
          hasActiveFilter={selectedGenres.length > 0}
        />
        <TVFilterButton
          label={t("library.filters.years")}
          value={
            selectedYears.length > 0
              ? `${selectedYears.length} selected`
              : t("library.filters.all")
          }
          onPress={handleShowYearFilter}
          hasActiveFilter={selectedYears.length > 0}
        />
        <TVFilterButton
          label={t("library.filters.tags")}
          value={
            selectedTags.length > 0
              ? `${selectedTags.length} selected`
              : t("library.filters.all")
          }
          onPress={handleShowTagFilter}
          hasActiveFilter={selectedTags.length > 0}
        />
        <TVFilterButton
          label={t("library.filters.sort_by")}
          value={sortOptions.find((o) => o.key === sortBy[0])?.value || ""}
          onPress={handleShowSortByFilter}
        />
        <TVFilterButton
          label={t("library.filters.sort_order")}
          value={
            sortOrderOptions.find((o) => o.key === sortOrder[0])?.value || ""
          }
          onPress={handleShowSortOrderFilter}
        />
      </View>

      {/* Grid */}
      <FlatList
        key={`${orientation}-${nrOfCols}`}
        ListEmptyComponent={
          <View className='flex flex-col items-center justify-center h-full'>
            <Text className='font-bold text-xl text-neutral-500'>
              {t("search.no_results")}
            </Text>
          </View>
        }
        contentInsetAdjustmentBehavior='automatic'
        data={flatData}
        renderItem={renderTVItem}
        extraData={[orientation, nrOfCols]}
        keyExtractor={keyExtractor}
        numColumns={nrOfCols}
        removeClippedSubviews={false}
        onEndReached={() => {
          if (hasNextPage) {
            fetchNextPage();
          }
        }}
        onEndReachedThreshold={1}
        contentContainerStyle={{
          paddingBottom: 24,
          paddingLeft: TV_SCALE_PADDING,
          paddingRight: TV_SCALE_PADDING,
          paddingTop: 20,
        }}
        ItemSeparatorComponent={() => (
          <View
            style={{
              width: 10,
              height: 10,
            }}
          />
        )}
      />
    </View>
  );
};

export default page;

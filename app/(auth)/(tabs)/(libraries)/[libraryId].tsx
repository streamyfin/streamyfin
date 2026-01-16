import { Ionicons } from "@expo/vector-icons";
import type {
  BaseItemDto,
  BaseItemDtoQueryResult,
  BaseItemKind,
  ItemFilter,
} from "@jellyfin/sdk/lib/generated-client/models";
import {
  getFilterApi,
  getItemsApi,
  getUserLibraryApi,
} from "@jellyfin/sdk/lib/utils/api";
import { FlashList } from "@shopify/flash-list";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { BlurView } from "expo-blur";
import { useLocalSearchParams, useNavigation } from "expo-router";
import { useAtom } from "jotai";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import {
  Animated,
  Easing,
  FlatList,
  Platform,
  Pressable,
  ScrollView,
  useWindowDimensions,
  View,
} from "react-native";
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
import MoviePoster, {
  TV_POSTER_WIDTH,
} from "@/components/posters/MoviePoster.tv";
import SeriesPoster from "@/components/posters/SeriesPoster.tv";
import { TVFocusablePoster } from "@/components/tv/TVFocusablePoster";
import useRouter from "@/hooks/useAppRouter";
import { useOrientation } from "@/hooks/useOrientation";
import * as ScreenOrientation from "@/packages/expo-screen-orientation";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import {
  FilterByOption,
  FilterByPreferenceAtom,
  filterByAtom,
  genreFilterAtom,
  getFilterByPreference,
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
  useFilterOptions,
  yearFilterAtom,
} from "@/utils/atoms/filters";
import { useSettings } from "@/utils/atoms/settings";

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

// TV Filter Types and Components
type TVFilterModalType =
  | "genre"
  | "year"
  | "tags"
  | "sortBy"
  | "sortOrder"
  | "filterBy"
  | null;

interface TVFilterOption<T> {
  label: string;
  value: T;
  selected: boolean;
}

const TVFilterOptionCard: React.FC<{
  label: string;
  selected: boolean;
  hasTVPreferredFocus?: boolean;
  onPress: () => void;
}> = ({ label, selected, hasTVPreferredFocus, onPress }) => {
  const [focused, setFocused] = useState(false);
  const scale = useRef(new Animated.Value(1)).current;

  const animateTo = (v: number) =>
    Animated.timing(scale, {
      toValue: v,
      duration: 150,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();

  return (
    <Pressable
      onPress={onPress}
      onFocus={() => {
        setFocused(true);
        animateTo(1.05);
      }}
      onBlur={() => {
        setFocused(false);
        animateTo(1);
      }}
      hasTVPreferredFocus={hasTVPreferredFocus}
    >
      <Animated.View
        style={{
          transform: [{ scale }],
          width: 160,
          height: 75,
          backgroundColor: focused
            ? "#fff"
            : selected
              ? "rgba(255,255,255,0.2)"
              : "rgba(255,255,255,0.08)",
          borderRadius: 14,
          justifyContent: "center",
          alignItems: "center",
          paddingHorizontal: 12,
        }}
      >
        <Text
          style={{
            fontSize: 16,
            color: focused ? "#000" : "#fff",
            fontWeight: focused || selected ? "600" : "400",
            textAlign: "center",
          }}
          numberOfLines={2}
        >
          {label}
        </Text>
        {selected && !focused && (
          <View style={{ position: "absolute", top: 8, right: 8 }}>
            <Ionicons
              name='checkmark'
              size={16}
              color='rgba(255,255,255,0.8)'
            />
          </View>
        )}
      </Animated.View>
    </Pressable>
  );
};

const TVFilterButton: React.FC<{
  label: string;
  value: string;
  onPress: () => void;
  hasTVPreferredFocus?: boolean;
  disabled?: boolean;
  hasActiveFilter?: boolean;
}> = ({
  label,
  value,
  onPress,
  hasTVPreferredFocus,
  disabled,
  hasActiveFilter,
}) => {
  const [focused, setFocused] = useState(false);
  const scale = useRef(new Animated.Value(1)).current;

  const animateTo = (v: number) =>
    Animated.timing(scale, {
      toValue: v,
      duration: 120,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();

  return (
    <Pressable
      onPress={onPress}
      onFocus={() => {
        setFocused(true);
        animateTo(1.04);
      }}
      onBlur={() => {
        setFocused(false);
        animateTo(1);
      }}
      hasTVPreferredFocus={hasTVPreferredFocus && !disabled}
      disabled={disabled}
      focusable={!disabled}
    >
      <Animated.View style={{ transform: [{ scale }] }}>
        <View
          style={{
            backgroundColor: focused
              ? "#fff"
              : hasActiveFilter
                ? "rgba(255, 255, 255, 0.25)"
                : "rgba(255,255,255,0.1)",
            borderRadius: 10,
            paddingVertical: 10,
            paddingHorizontal: 16,
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            borderWidth: hasActiveFilter && !focused ? 1 : 0,
            borderColor: "rgba(255, 255, 255, 0.4)",
          }}
        >
          {label ? (
            <Text style={{ fontSize: 14, color: focused ? "#444" : "#bbb" }}>
              {label}
            </Text>
          ) : null}
          <Text
            style={{
              fontSize: 14,
              color: focused ? "#000" : "#FFFFFF",
              fontWeight: "500",
            }}
            numberOfLines={1}
          >
            {value}
          </Text>
        </View>
      </Animated.View>
    </Pressable>
  );
};

const TVFilterSelector = <T,>({
  visible,
  title,
  options,
  onSelect,
  onClose,
}: {
  visible: boolean;
  title: string;
  options: TVFilterOption<T>[];
  onSelect: (value: T) => void;
  onClose: () => void;
}) => {
  // Track initial focus index - only set once when modal opens
  const initialFocusIndexRef = useRef<number | null>(null);

  // Calculate initial focus index only once when visible becomes true
  if (visible && initialFocusIndexRef.current === null) {
    const idx = options.findIndex((o) => o.selected);
    initialFocusIndexRef.current = idx >= 0 ? idx : 0;
  }

  // Reset when modal closes
  if (!visible) {
    initialFocusIndexRef.current = null;
    return null;
  }

  const initialFocusIndex = initialFocusIndexRef.current ?? 0;

  return (
    <View
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        justifyContent: "flex-end",
        zIndex: 1000,
      }}
    >
      <BlurView
        intensity={80}
        tint='dark'
        style={{
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          overflow: "hidden",
        }}
      >
        <View style={{ paddingVertical: 24 }}>
          <Text
            style={{
              fontSize: 20,
              fontWeight: "600",
              color: "#fff",
              paddingHorizontal: 48,
              marginBottom: 16,
            }}
          >
            {title}
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ overflow: "visible" }}
            contentContainerStyle={{
              paddingHorizontal: 48,
              paddingVertical: 10,
              gap: 12,
            }}
          >
            {options.map((option, index) => (
              <TVFilterOptionCard
                key={String(option.value)}
                label={option.label}
                selected={option.selected}
                hasTVPreferredFocus={index === initialFocusIndex}
                onPress={() => {
                  onSelect(option.value);
                  onClose();
                }}
              />
            ))}
          </ScrollView>
        </View>
      </BlurView>
    </View>
  );
};

const Page = () => {
  const searchParams = useLocalSearchParams() as {
    libraryId: string;
    sortBy?: string;
    sortOrder?: string;
    filterBy?: string;
  };
  const { libraryId } = searchParams;

  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);
  const { width: screenWidth } = useWindowDimensions();

  const [selectedGenres, setSelectedGenres] = useAtom(genreFilterAtom);
  const [selectedYears, setSelectedYears] = useAtom(yearFilterAtom);
  const [selectedTags, setSelectedTags] = useAtom(tagsFilterAtom);
  const [sortBy, _setSortBy] = useAtom(sortByAtom);
  const [filterBy, _setFilterBy] = useAtom(filterByAtom);
  const [sortOrder, _setSortOrder] = useAtom(sortOrderAtom);
  const [sortByPreference, setSortByPreference] = useAtom(sortByPreferenceAtom);
  const [filterByPreference, setFilterByPreference] = useAtom(
    FilterByPreferenceAtom,
  );
  const [sortOrderPreference, setOrderByPreference] = useAtom(
    sortOrderPreferenceAtom,
  );

  const { orientation } = useOrientation();

  const { t } = useTranslation();
  const router = useRouter();

  // TV Filter modal state
  const [openFilterModal, setOpenFilterModal] =
    useState<TVFilterModalType>(null);
  const isFilterModalOpen = openFilterModal !== null;

  const isFiltersDisabled = isFilterModalOpen;

  // TV Filter queries
  const { data: tvGenreOptions } = useQuery({
    queryKey: ["filters", "Genres", "tvGenreFilter", libraryId],
    queryFn: async () => {
      if (!api) return [];
      const response = await getFilterApi(api).getQueryFiltersLegacy({
        userId: user?.Id,
        parentId: libraryId,
      });
      return response.data.Genres || [];
    },
    enabled: Platform.isTV && !!api && !!user?.Id && !!libraryId,
  });

  const { data: tvYearOptions } = useQuery({
    queryKey: ["filters", "Years", "tvYearFilter", libraryId],
    queryFn: async () => {
      if (!api) return [];
      const response = await getFilterApi(api).getQueryFiltersLegacy({
        userId: user?.Id,
        parentId: libraryId,
      });
      return response.data.Years || [];
    },
    enabled: Platform.isTV && !!api && !!user?.Id && !!libraryId,
  });

  const { data: tvTagOptions } = useQuery({
    queryKey: ["filters", "Tags", "tvTagFilter", libraryId],
    queryFn: async () => {
      if (!api) return [];
      const response = await getFilterApi(api).getQueryFiltersLegacy({
        userId: user?.Id,
        parentId: libraryId,
      });
      return response.data.Tags || [];
    },
    enabled: Platform.isTV && !!api && !!user?.Id && !!libraryId,
  });

  useEffect(() => {
    // Check for URL params first (from "See All" navigation)
    const urlSortBy = searchParams.sortBy as SortByOption | undefined;
    const urlSortOrder = searchParams.sortOrder as SortOrderOption | undefined;
    const urlFilterBy = searchParams.filterBy as FilterByOption | undefined;

    // Apply sortOrder: URL param > saved preference > default
    if (urlSortOrder && Object.values(SortOrderOption).includes(urlSortOrder)) {
      _setSortOrder([urlSortOrder]);
    } else {
      const sop = getSortOrderPreference(libraryId, sortOrderPreference);
      _setSortOrder([sop || SortOrderOption.Ascending]);
    }

    // Apply sortBy: URL param > saved preference > default
    if (urlSortBy && Object.values(SortByOption).includes(urlSortBy)) {
      _setSortBy([urlSortBy]);
    } else {
      const obp = getSortByPreference(libraryId, sortByPreference);
      _setSortBy([obp || SortByOption.SortName]);
    }

    // Apply filterBy: URL param > saved preference > default
    if (urlFilterBy && Object.values(FilterByOption).includes(urlFilterBy)) {
      _setFilterBy([urlFilterBy]);
    } else {
      const fp = getFilterByPreference(libraryId, filterByPreference);
      _setFilterBy(fp ? [fp] : []);
    }
  }, [
    libraryId,
    sortOrderPreference,
    sortByPreference,
    _setSortOrder,
    _setSortBy,
    filterByPreference,
    _setFilterBy,
    searchParams.sortBy,
    searchParams.sortOrder,
    searchParams.filterBy,
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
        setOrderByPreference({
          ...sortOrderPreference,
          [libraryId]: sortOrder[0],
        });
      }
      _setSortOrder(sortOrder);
    },
    [libraryId, sortOrderPreference, setOrderByPreference, _setSortOrder],
  );

  const setFilter = useCallback(
    (filterBy: FilterByOption[]) => {
      const fp = getFilterByPreference(libraryId, filterByPreference);
      if (filterBy[0] !== fp) {
        setFilterByPreference({
          ...filterByPreference,
          [libraryId]: filterBy[0],
        });
      }
      _setFilterBy(filterBy);
    },
    [libraryId, filterByPreference, setFilterByPreference, _setFilterBy],
  );

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
  }, [screenWidth, orientation]);

  const { data: library, isLoading: isLibraryLoading } = useQuery({
    queryKey: ["library", libraryId],
    queryFn: async () => {
      if (!api) return null;
      const response = await getUserLibraryApi(api).getItem({
        itemId: libraryId,
        userId: user?.Id,
      });
      return response.data;
    },
    enabled: !!api && !!user?.Id && !!libraryId,
    staleTime: 60 * 1000,
  });

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
      if (!api || !library) return null;

      let itemType: BaseItemKind | undefined;

      // This fix makes sure to only return 1 type of items, if defined.
      // This is because the underlying directory some times contains other types, and we don't want to show them.
      if (library.CollectionType === "movies") {
        itemType = "Movie";
      } else if (library.CollectionType === "tvshows") {
        itemType = "Series";
      } else if (library.CollectionType === "boxsets") {
        itemType = "BoxSet";
      } else if (library.CollectionType === "homevideos") {
        itemType = "Video";
      } else if (library.CollectionType === "musicvideos") {
        itemType = "MusicVideo";
      }

      const response = await getItemsApi(api).getItems({
        userId: user?.Id,
        parentId: libraryId,
        limit: 36,
        startIndex: pageParam,
        sortBy: [sortBy[0], "SortName", "ProductionYear"],
        sortOrder: [sortOrder[0]],
        enableImageTypes: ["Primary", "Backdrop", "Banner", "Thumb"],
        filters: filterBy as ItemFilter[],
        // true is needed for merged versions
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
      selectedGenres,
      selectedYears,
      selectedTags,
      sortBy,
      sortOrder,
      filterBy,
    ],
  );

  const { data, isFetching, fetchNextPage, hasNextPage, isLoading } =
    useInfiniteQuery({
      queryKey: [
        "library-items",
        libraryId,
        selectedGenres,
        selectedYears,
        selectedTags,
        sortBy,
        sortOrder,
        filterBy,
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
      enabled: !!api && !!user?.Id && !!library,
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

  const renderTVItem = useCallback(
    ({ item }: { item: BaseItemDto }) => {
      const handlePress = () => {
        const navTarget = getItemNavigation(item, "(libraries)");
        router.push(navTarget as any);
      };

      return (
        <View
          style={{
            marginRight: TV_ITEM_GAP,
            marginBottom: TV_ITEM_GAP,
            width: TV_POSTER_WIDTH,
          }}
        >
          <TVFocusablePoster onPress={handlePress} disabled={isFilterModalOpen}>
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
    [router, isFilterModalOpen],
  );

  const keyExtractor = useCallback((item: BaseItemDto) => item.Id || "", []);
  const generalFilters = useFilterOptions();
  const settings = useSettings();
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
          {
            key: "filterOptions",
            component: (
              <FilterButton
                className='mr-1'
                id={libraryId}
                queryKey='filters'
                queryFn={async () => generalFilters.map((s) => s.key)}
                set={setFilter}
                values={filterBy}
                title={t("library.filters.filter_by")}
                renderItemLabel={(item) =>
                  generalFilters.find((i) => i.key === item)?.value || ""
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
      filterBy,
      setFilter,
      settings,
    ],
  );

  // TV Filter bar header
  const hasActiveFilters =
    selectedGenres.length > 0 ||
    selectedYears.length > 0 ||
    selectedTags.length > 0 ||
    filterBy.length > 0;

  const resetAllFilters = useCallback(() => {
    setSelectedGenres([]);
    setSelectedYears([]);
    setSelectedTags([]);
    _setFilterBy([]);
  }, [setSelectedGenres, setSelectedYears, setSelectedTags, _setFilterBy]);

  // TV Filter options - with "All" option for clearable filters
  const tvGenreFilterOptions = useMemo(
    (): TVFilterOption<string>[] => [
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
    (): TVFilterOption<string>[] => [
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
    (): TVFilterOption<string>[] => [
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
    (): TVFilterOption<SortByOption>[] =>
      sortOptions.map((option) => ({
        label: option.value,
        value: option.key,
        selected: sortBy[0] === option.key,
      })),
    [sortBy],
  );

  const tvSortOrderOptions = useMemo(
    (): TVFilterOption<SortOrderOption>[] =>
      sortOrderOptions.map((option) => ({
        label: option.value,
        value: option.key,
        selected: sortOrder[0] === option.key,
      })),
    [sortOrder],
  );

  const tvFilterByOptions = useMemo(
    (): TVFilterOption<string>[] => [
      {
        label: t("library.filters.all"),
        value: "__all__",
        selected: filterBy.length === 0,
      },
      ...generalFilters.map((option) => ({
        label: option.value,
        value: option.key,
        selected: filterBy.includes(option.key),
      })),
    ],
    [filterBy, generalFilters, t],
  );

  // TV Filter handlers
  const handleGenreSelect = useCallback(
    (value: string) => {
      if (value === "__all__") {
        setSelectedGenres([]);
      } else if (selectedGenres.includes(value)) {
        setSelectedGenres(selectedGenres.filter((g) => g !== value));
      } else {
        setSelectedGenres([...selectedGenres, value]);
      }
    },
    [selectedGenres, setSelectedGenres],
  );

  const handleYearSelect = useCallback(
    (value: string) => {
      if (value === "__all__") {
        setSelectedYears([]);
      } else if (selectedYears.includes(value)) {
        setSelectedYears(selectedYears.filter((y) => y !== value));
      } else {
        setSelectedYears([...selectedYears, value]);
      }
    },
    [selectedYears, setSelectedYears],
  );

  const handleTagSelect = useCallback(
    (value: string) => {
      if (value === "__all__") {
        setSelectedTags([]);
      } else if (selectedTags.includes(value)) {
        setSelectedTags(selectedTags.filter((t) => t !== value));
      } else {
        setSelectedTags([...selectedTags, value]);
      }
    },
    [selectedTags, setSelectedTags],
  );

  const handleFilterBySelect = useCallback(
    (value: string) => {
      if (value === "__all__") {
        _setFilterBy([]);
      } else {
        setFilter([value as FilterByOption]);
      }
    },
    [setFilter, _setFilterBy],
  );

  const insets = useSafeAreaInsets();

  if (isLoading || isLibraryLoading)
    return (
      <View className='w-full h-full flex items-center justify-center'>
        <Loader />
      </View>
    );

  // Mobile return
  if (!Platform.isTV) {
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

  // TV return with filter overlays - filter bar outside FlatList to fix focus boundary issues
  return (
    <View style={{ flex: 1 }}>
      {/* Background content - disabled when modal is open */}
      <View
        style={{ flex: 1, opacity: isFilterModalOpen ? 0.3 : 1 }}
        focusable={!isFilterModalOpen}
        isTVSelectable={!isFilterModalOpen}
        pointerEvents={isFilterModalOpen ? "none" : "auto"}
        accessibilityElementsHidden={isFilterModalOpen}
        importantForAccessibility={
          isFilterModalOpen ? "no-hide-descendants" : "auto"
        }
      >
        {/* Filter bar - using View instead of ScrollView to avoid focus conflicts */}
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
              disabled={isFiltersDisabled}
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
            onPress={() => setOpenFilterModal("genre")}
            hasTVPreferredFocus={!hasActiveFilters}
            disabled={isFiltersDisabled}
            hasActiveFilter={selectedGenres.length > 0}
          />
          <TVFilterButton
            label={t("library.filters.years")}
            value={
              selectedYears.length > 0
                ? `${selectedYears.length} selected`
                : t("library.filters.all")
            }
            onPress={() => setOpenFilterModal("year")}
            disabled={isFiltersDisabled}
            hasActiveFilter={selectedYears.length > 0}
          />
          <TVFilterButton
            label={t("library.filters.tags")}
            value={
              selectedTags.length > 0
                ? `${selectedTags.length} selected`
                : t("library.filters.all")
            }
            onPress={() => setOpenFilterModal("tags")}
            disabled={isFiltersDisabled}
            hasActiveFilter={selectedTags.length > 0}
          />
          <TVFilterButton
            label={t("library.filters.sort_by")}
            value={sortOptions.find((o) => o.key === sortBy[0])?.value || ""}
            onPress={() => setOpenFilterModal("sortBy")}
            disabled={isFiltersDisabled}
          />
          <TVFilterButton
            label={t("library.filters.sort_order")}
            value={
              sortOrderOptions.find((o) => o.key === sortOrder[0])?.value || ""
            }
            onPress={() => setOpenFilterModal("sortOrder")}
            disabled={isFiltersDisabled}
          />
          <TVFilterButton
            label={t("library.filters.filter_by")}
            value={
              filterBy.length > 0
                ? generalFilters.find((o) => o.key === filterBy[0])?.value || ""
                : t("library.filters.all")
            }
            onPress={() => setOpenFilterModal("filterBy")}
            disabled={isFiltersDisabled}
            hasActiveFilter={filterBy.length > 0}
          />
        </View>

        {/* Grid - using FlatList instead of FlashList to fix focus issues */}
        <FlatList
          key={`${orientation}-${nrOfCols}`}
          ListEmptyComponent={
            <View className='flex flex-col items-center justify-center h-full'>
              <Text className='font-bold text-xl text-neutral-500'>
                {t("library.no_results")}
              </Text>
            </View>
          }
          contentInsetAdjustmentBehavior='automatic'
          data={flatData}
          renderItem={renderTVItem}
          extraData={[orientation, nrOfCols, isFilterModalOpen]}
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

      {/* TV Filter Overlays */}
      <TVFilterSelector
        visible={openFilterModal === "genre"}
        title={t("library.filters.genres")}
        options={tvGenreFilterOptions}
        onSelect={handleGenreSelect}
        onClose={() => setOpenFilterModal(null)}
      />
      <TVFilterSelector
        visible={openFilterModal === "year"}
        title={t("library.filters.years")}
        options={tvYearFilterOptions}
        onSelect={handleYearSelect}
        onClose={() => setOpenFilterModal(null)}
      />
      <TVFilterSelector
        visible={openFilterModal === "tags"}
        title={t("library.filters.tags")}
        options={tvTagFilterOptions}
        onSelect={handleTagSelect}
        onClose={() => setOpenFilterModal(null)}
      />
      <TVFilterSelector
        visible={openFilterModal === "sortBy"}
        title={t("library.filters.sort_by")}
        options={tvSortByOptions}
        onSelect={(value) => setSortBy([value])}
        onClose={() => setOpenFilterModal(null)}
      />
      <TVFilterSelector
        visible={openFilterModal === "sortOrder"}
        title={t("library.filters.sort_order")}
        options={tvSortOrderOptions}
        onSelect={(value) => setSortOrder([value])}
        onClose={() => setOpenFilterModal(null)}
      />
      <TVFilterSelector
        visible={openFilterModal === "filterBy"}
        title={t("library.filters.filter_by")}
        options={tvFilterByOptions}
        onSelect={handleFilterBySelect}
        onClose={() => setOpenFilterModal(null)}
      />
    </View>
  );
};

export default React.memo(Page);

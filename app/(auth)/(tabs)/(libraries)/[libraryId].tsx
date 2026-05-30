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
import { Image } from "expo-image";
import { useLocalSearchParams, useNavigation } from "expo-router";
import { useAtom } from "jotai";
import React, { useCallback, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  FlatList,
  Platform,
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
import { TVFilterButton, TVFocusablePoster } from "@/components/tv";
import { TVPosterCard } from "@/components/tv/TVPosterCard";
import { useScaledTVPosterSizes } from "@/constants/TVPosterSizes";
import { useScaledTVTypography } from "@/constants/TVTypography";
import useRouter from "@/hooks/useAppRouter";
import { useOrientation } from "@/hooks/useOrientation";
import { useRefreshLibraryOnFocus } from "@/hooks/useRefreshLibraryOnFocus";
import { useTVItemActionModal } from "@/hooks/useTVItemActionModal";
import { useTVOptionModal } from "@/hooks/useTVOptionModal";
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
import type { TVOptionItem } from "@/utils/atoms/tvOptionModal";
import { getPrimaryImageUrl } from "@/utils/jellyfin/image/getPrimaryImageUrl";

const TV_ITEM_GAP = 20;
const TV_HORIZONTAL_PADDING = 60;
const _TV_SCALE_PADDING = 20;
const TV_PLAYLIST_SQUARE_SIZE = 180;

const Page = () => {
  const searchParams = useLocalSearchParams() as {
    libraryId: string;
    sortBy?: string;
    sortOrder?: string;
    filterBy?: string;
  };
  const { libraryId } = searchParams;

  const typography = useScaledTVTypography();
  const posterSizes = useScaledTVPosterSizes();
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

  // Fallback refresh for newly added content when returning to the library
  // (primary path is the LibraryChanged WebSocket event).
  useRefreshLibraryOnFocus();

  const { t } = useTranslation();
  const router = useRouter();
  const { showOptions } = useTVOptionModal();
  const { showItemActions } = useTVItemActionModal();

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
      // TV uses flexWrap, so nrOfCols is just for mobile
      return 1;
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
      } else if (library.CollectionType === "playlists") {
        itemType = "Playlist";
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
        ...(Platform.isTV && library.CollectionType === "playlists"
          ? { mediaTypes: ["Video"] }
          : {}),
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
    (item: BaseItemDto) => {
      const handlePress = () => {
        if (item.Type === "Playlist") {
          router.push({
            pathname: "/(auth)/(tabs)/(libraries)/[libraryId]",
            params: { libraryId: item.Id! },
          });
          return;
        }
        const navTarget = getItemNavigation(item, "(libraries)");
        router.push(navTarget as any);
      };

      // Special rendering for Playlist items (square thumbnails)
      if (item.Type === "Playlist") {
        const playlistImageUrl = getPrimaryImageUrl({
          api,
          item,
          width: TV_PLAYLIST_SQUARE_SIZE * 2,
        });

        return (
          <View
            key={item.Id}
            style={{
              width: TV_PLAYLIST_SQUARE_SIZE,
              alignItems: "center",
            }}
          >
            <TVFocusablePoster
              onPress={handlePress}
              onLongPress={() => showItemActions(item)}
            >
              <View
                style={{
                  width: TV_PLAYLIST_SQUARE_SIZE,
                  aspectRatio: 1,
                  borderRadius: 16,
                  overflow: "hidden",
                  backgroundColor: "#1a1a1a",
                }}
              >
                <Image
                  source={playlistImageUrl ? { uri: playlistImageUrl } : null}
                  style={{ width: "100%", height: "100%" }}
                  contentFit='cover'
                  cachePolicy='memory-disk'
                />
              </View>
            </TVFocusablePoster>
            <View style={{ marginTop: 12, alignItems: "center" }}>
              <Text
                numberOfLines={1}
                style={{
                  fontSize: typography.callout,
                  color: "#FFFFFF",
                  textAlign: "center",
                }}
              >
                {item.Name}
              </Text>
            </View>
          </View>
        );
      }

      return (
        <TVPosterCard
          key={item.Id}
          item={item}
          orientation='vertical'
          onPress={handlePress}
          onLongPress={() => showItemActions(item)}
          width={posterSizes.poster}
        />
      );
    },
    [router, showItemActions, api, typography],
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

  const tvFilterByOptions = useMemo(
    (): TVOptionItem<string>[] => [
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

  const handleShowFilterByFilter = useCallback(() => {
    showOptions({
      title: t("library.filters.filter_by"),
      options: tvFilterByOptions,
      onSelect: (value: string) => {
        if (value === "__all__") {
          _setFilterBy([]);
        } else {
          setFilter([value as FilterByOption]);
        }
      },
    });
  }, [showOptions, t, tvFilterByOptions, setFilter, _setFilterBy]);

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

  // TV return with filter bar
  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{
        paddingTop: insets.top + 100,
        paddingBottom: insets.bottom + 60,
        paddingHorizontal: insets.left + TV_HORIZONTAL_PADDING,
      }}
      onScroll={({ nativeEvent }) => {
        // Load more when near bottom
        const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
        const isNearBottom =
          layoutMeasurement.height + contentOffset.y >=
          contentSize.height - 500;
        if (isNearBottom && hasNextPage && !isFetching) {
          fetchNextPage();
        }
      }}
      scrollEventThrottle={400}
    >
      {/* Filter bar */}
      <View
        style={{
          flexDirection: "row",
          flexWrap: "nowrap",
          justifyContent: "center",
          paddingBottom: 24,
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
        <TVFilterButton
          label={t("library.filters.filter_by")}
          value={
            filterBy.length > 0
              ? generalFilters.find((o) => o.key === filterBy[0])?.value || ""
              : t("library.filters.all")
          }
          onPress={handleShowFilterByFilter}
          hasActiveFilter={filterBy.length > 0}
        />
      </View>

      {/* Grid with flexWrap */}
      {flatData.length === 0 ? (
        <View
          style={{
            flex: 1,
            justifyContent: "center",
            alignItems: "center",
            paddingTop: 100,
          }}
        >
          <Text style={{ fontSize: typography.body, color: "#737373" }}>
            {t("library.no_results")}
          </Text>
        </View>
      ) : (
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            justifyContent: "center",
            gap: TV_ITEM_GAP,
          }}
        >
          {flatData.map((item) => renderTVItem(item))}
        </View>
      )}

      {/* Loading indicator */}
      {isFetching && (
        <View style={{ paddingVertical: 20 }}>
          <Loader />
        </View>
      )}
    </ScrollView>
  );
};

export default React.memo(Page);

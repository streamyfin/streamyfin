import {Text} from "@/components/common/Text";
import {TouchableItemRouter} from "@/components/common/TouchableItemRouter";
import ContinueWatchingPoster from "@/components/ContinueWatchingPoster";
import {Tag} from "@/components/GenreTags";
import {ItemCardText} from "@/components/ItemCardText";
import {JellyseerrSearchSort, JellyserrIndexPage} from "@/components/jellyseerr/JellyseerrIndexPage";
import MoviePoster from "@/components/posters/MoviePoster";
import SeriesPoster from "@/components/posters/SeriesPoster";
import {LoadingSkeleton} from "@/components/search/LoadingSkeleton";
import {SearchItemWrapper} from "@/components/search/SearchItemWrapper";
import {useJellyseerr} from "@/hooks/useJellyseerr";
import {apiAtom, userAtom} from "@/providers/JellyfinProvider";
import {useSettings} from "@/utils/atoms/settings";
import {BaseItemDto, BaseItemKind,} from "@jellyfin/sdk/lib/generated-client/models";
import {getItemsApi, getSearchApi} from "@jellyfin/sdk/lib/utils/api";
import {useQuery} from "@tanstack/react-query";
import axios from "axios";
import {router, useLocalSearchParams, useNavigation} from "expo-router";
import {useAtom} from "jotai";
import React, {useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState,} from "react";
import {Platform, ScrollView, TouchableOpacity, View} from "react-native";
import {useSafeAreaInsets} from "react-native-safe-area-context";
import {useDebounce} from "use-debounce";
import {useTranslation} from "react-i18next";
import {eventBus} from "@/utils/eventBus";
import {sortOrderOptions} from "@/utils/atoms/filters";
import {FilterButton} from "@/components/filters/FilterButton";

type SearchType = "Library" | "Discover";

const exampleSearches = [
  "Lord of the rings",
  "Avengers",
  "Game of Thrones",
  "Breaking Bad",
  "Stranger Things",
  "The Mandalorian",
];

export default function search() {
  const params = useLocalSearchParams();
  const insets = useSafeAreaInsets();

  const { t } = useTranslation();

  const { q } = params as { q: string };

  const [searchType, setSearchType] = useState<SearchType>("Library");
  const [search, setSearch] = useState<string>("");

  const [debouncedSearch] = useDebounce(search, 500);

  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);

  const [settings] = useSettings();
  const { jellyseerrApi } = useJellyseerr();
  const [jellyseerrOrderBy, setJellyseerrOrderBy] = useState<JellyseerrSearchSort>(JellyseerrSearchSort.DEFAULT)
  const [jellyseerrSortOrder, setJellyseerrSortOrder] = useState<"asc" | "desc">("desc")

  const searchEngine = useMemo(() => {
    return settings?.searchEngine || "Jellyfin";
  }, [settings]);

  useEffect(() => {
    if (q && q.length > 0) setSearch(q);
  }, [q]);

  const searchFn = useCallback(
    async ({
      types,
      query,
    }: {
      types: BaseItemKind[];
      query: string;
    }): Promise<BaseItemDto[]> => {
      if (!api || !query) return [];

      try {
        if (searchEngine === "Jellyfin") {
          const searchApi = await getSearchApi(api).getSearchHints({
            searchTerm: query,
            limit: 10,
            includeItemTypes: types,
          });

          return (searchApi.data.SearchHints as BaseItemDto[]) || [];
        } else {
          if (!settings?.marlinServerUrl) return [];

          const url = `${
            settings.marlinServerUrl
          }/search?q=${encodeURIComponent(query)}&includeItemTypes=${types
            .map((type) => encodeURIComponent(type))
            .join("&includeItemTypes=")}`;

          const response1 = await axios.get(url);

          const ids = response1.data.ids;

          if (!ids || !ids.length) return [];

          const response2 = await getItemsApi(api).getItems({
            ids,
            enableImageTypes: ["Primary", "Backdrop", "Thumb"],
          });

          return (response2.data.Items as BaseItemDto[]) || [];
        }
      } catch (error) {
        console.error("Error during search:", error);
        return []; // Ensure an empty array is returned in case of an error
      }
    },
    [api, searchEngine, settings]
  );

  type HeaderSearchBarRef = {
    focus: () => void;
    blur: () => void;
    setText: (text: string) => void;
    clearText: () => void;
    cancelSearch: () => void;
  };

  const searchBarRef = useRef<HeaderSearchBarRef>(null);
  const navigation = useNavigation();
  useLayoutEffect(() => {
    navigation.setOptions({
      headerSearchBarOptions: {
        ref: searchBarRef,
        placeholder: t("search.search"),
        onChangeText: (e: any) => {
          router.setParams({ q: "" });
          setSearch(e.nativeEvent.text);
        },
        hideWhenScrolling: false,
        autoFocus: false,
      },
    });
  }, [navigation]);

  useEffect(() => {
    const unsubscribe = eventBus.on("searchTabPressed", () => {
      // Screen not actuve
      if (!searchBarRef.current) return;
      // Screen is active, focus search bar
      searchBarRef.current?.focus();
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const { data: movies, isFetching: l1 } = useQuery({
    queryKey: ["search", "movies", debouncedSearch],
    queryFn: () =>
      searchFn({
        query: debouncedSearch,
        types: ["Movie"],
      }),
    enabled: searchType === "Library" && debouncedSearch.length > 0,
  });

  const { data: series, isFetching: l2 } = useQuery({
    queryKey: ["search", "series", debouncedSearch],
    queryFn: () =>
      searchFn({
        query: debouncedSearch,
        types: ["Series"],
      }),
    enabled: searchType === "Library" && debouncedSearch.length > 0,
  });

  const { data: episodes, isFetching: l3 } = useQuery({
    queryKey: ["search", "episodes", debouncedSearch],
    queryFn: () =>
      searchFn({
        query: debouncedSearch,
        types: ["Episode"],
      }),
    enabled: searchType === "Library" && debouncedSearch.length > 0,
  });

  const { data: collections, isFetching: l7 } = useQuery({
    queryKey: ["search", "collections", debouncedSearch],
    queryFn: () =>
      searchFn({
        query: debouncedSearch,
        types: ["BoxSet"],
      }),
    enabled: searchType === "Library" && debouncedSearch.length > 0,
  });

  const { data: actors, isFetching: l8 } = useQuery({
    queryKey: ["search", "actors", debouncedSearch],
    queryFn: () =>
      searchFn({
        query: debouncedSearch,
        types: ["Person"],
      }),
    enabled: searchType === "Library" && debouncedSearch.length > 0,
  });

  const noResults = useMemo(() => {
    return !(
      movies?.length ||
      episodes?.length ||
      series?.length ||
      collections?.length ||
      actors?.length
    );
  }, [episodes, movies, series, collections, actors]);

  const loading = useMemo(() => {
    return l1 || l2 || l3 || l7 || l8;
  }, [l1, l2, l3, l7, l8]);

  return (
    <>
      <ScrollView
        keyboardDismissMode="on-drag"
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{
          paddingLeft: insets.left,
          paddingRight: insets.right,
        }}
      >
        <View
          className="flex flex-col"
          style={{
            marginTop: Platform.OS === "android" ? 16 : 0,
          }}
        >
          {jellyseerrApi && (
            <>
              <ScrollView horizontal className="flex flex-row flex-wrap space-x-2 px-4 mb-2">
                <TouchableOpacity onPress={() => setSearchType("Library")}>
                  <Tag
                    text={t("search.library")}
                    textClass="p-1"
                    className={
                      searchType === "Library" ? "bg-purple-600" : undefined
                    }
                  />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setSearchType("Discover")}>
                  <Tag
                    text={t("search.discover")}
                    textClass="p-1"
                    className={
                      searchType === "Discover" ? "bg-purple-600" : undefined
                    }
                  />
                </TouchableOpacity>
                {!loading && noResults && debouncedSearch.length > 0 && (
                  <View className="flex flex-row justify-end items-center space-x-1">
                    <FilterButton
                      collectionId="search"
                      queryKey="jellyseerr_search"
                      queryFn={async () => Object.keys(JellyseerrSearchSort).filter(v => isNaN(Number(v)))}
                      set={value => setJellyseerrOrderBy(value[0])}
                      values={[jellyseerrOrderBy]}
                      title={t("library.filters.sort_by")}
                      renderItemLabel={(item) => t(`home.settings.plugins.jellyseerr.order_by.${item}`)}
                      showSearch={false}
                    />
                    <FilterButton
                      collectionId="order"
                      queryKey="jellysearr_search"
                      queryFn={async () => ["asc", "desc"]}
                      set={value => setJellyseerrSortOrder(value[0])}
                      values={[jellyseerrSortOrder]}
                      title={t("library.filters.sort_order")}
                      renderItemLabel={(item) => t(`library.filters.${item}`)}
                      showSearch={false}
                    />
                  </View>
                )}
              </ScrollView>
            </>
          )}

          <View className="mt-2">
            <LoadingSkeleton isLoading={loading} />
          </View>

          {searchType === "Library" ? (
            <View className={l1 || l2 ? "opacity-0" : "opacity-100"}>
              <SearchItemWrapper
                header={t("search.movies")}
                ids={movies?.map((m) => m.Id!)}
                renderItem={(item: BaseItemDto) => (
                  <TouchableItemRouter
                    key={item.Id}
                    className="flex flex-col w-28 mr-2"
                    item={item}
                  >
                    <MoviePoster item={item} key={item.Id} />
                    <Text numberOfLines={2} className="mt-2">
                      {item.Name}
                    </Text>
                    <Text className="opacity-50 text-xs">
                      {item.ProductionYear}
                    </Text>
                  </TouchableItemRouter>
                )}
              />
              <SearchItemWrapper
                ids={series?.map((m) => m.Id!)}
                header={t("search.series")}
                renderItem={(item: BaseItemDto) => (
                  <TouchableItemRouter
                    key={item.Id}
                    item={item}
                    className="flex flex-col w-28 mr-2"
                  >
                    <SeriesPoster item={item} key={item.Id} />
                    <Text numberOfLines={2} className="mt-2">
                      {item.Name}
                    </Text>
                    <Text className="opacity-50 text-xs">
                      {item.ProductionYear}
                    </Text>
                  </TouchableItemRouter>
                )}
              />
              <SearchItemWrapper
                ids={episodes?.map((m) => m.Id!)}
                header={t("search.episodes")}
                renderItem={(item: BaseItemDto) => (
                  <TouchableItemRouter
                    item={item}
                    key={item.Id}
                    className="flex flex-col w-44 mr-2"
                  >
                    <ContinueWatchingPoster item={item} />
                    <ItemCardText item={item} />
                  </TouchableItemRouter>
                )}
              />
              <SearchItemWrapper
                ids={collections?.map((m) => m.Id!)}
                header={t("search.collections")}
                renderItem={(item: BaseItemDto) => (
                  <TouchableItemRouter
                    key={item.Id}
                    item={item}
                    className="flex flex-col w-28 mr-2"
                  >
                    <MoviePoster item={item} key={item.Id} />
                    <Text numberOfLines={2} className="mt-2">
                      {item.Name}
                    </Text>
                  </TouchableItemRouter>
                )}
              />
              <SearchItemWrapper
                ids={actors?.map((m) => m.Id!)}
                header={t("search.actors")}
                renderItem={(item: BaseItemDto) => (
                  <TouchableItemRouter
                    item={item}
                    key={item.Id}
                    className="flex flex-col w-28 mr-2"
                  >
                    <MoviePoster item={item} />
                    <ItemCardText item={item} />
                  </TouchableItemRouter>
                )}
              />
            </View>
          ) : (
            <JellyserrIndexPage
              searchQuery={debouncedSearch}
              sortType={jellyseerrOrderBy}
              order={jellyseerrSortOrder}
            />
          )}

          {searchType === "Library" && (
            <>
              {!loading && noResults && debouncedSearch.length > 0 ? (
                <View>
                  <Text className="text-center text-lg font-bold mt-4">
                    {t("search.no_results_found_for")}
                  </Text>
                  <Text className="text-xs text-purple-600 text-center">
                    "{debouncedSearch}"
                  </Text>
                </View>
              ) : debouncedSearch.length === 0 ? (
                <View className="mt-4 flex flex-col items-center space-y-2">
                  {exampleSearches.map((e) => (
                    <TouchableOpacity
                      onPress={() => setSearch(e)}
                      key={e}
                      className="mb-2"
                    >
                      <Text className="text-purple-600">{e}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : null}
            </>
          )}
        </View>
      </ScrollView>
    </>
  );
}

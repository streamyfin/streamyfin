import type {
  BaseItemDto,
  BaseItemKind,
} from "@jellyfin/sdk/lib/generated-client/models";
import { getItemsApi } from "@jellyfin/sdk/lib/utils/api";
import { useAsyncDebouncer } from "@tanstack/react-pacer";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { Image } from "expo-image";
import { useLocalSearchParams, useNavigation } from "expo-router";
import { useAtom } from "jotai";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { Platform, ScrollView, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import ContinueWatchingPoster from "@/components/ContinueWatchingPoster";
import { Input } from "@/components/common/Input";
import { Text } from "@/components/common/Text";
import { TouchableItemRouter } from "@/components/common/TouchableItemRouter";
import { ItemCardText } from "@/components/ItemCardText";
import MoviePoster from "@/components/posters/MoviePoster";
import SeriesPoster from "@/components/posters/SeriesPoster";
import { DiscoverFilters } from "@/components/search/DiscoverFilters";
import { LoadingSkeleton } from "@/components/search/LoadingSkeleton";
import { SearchItemWrapper } from "@/components/search/SearchItemWrapper";
import { SearchTabButtons } from "@/components/search/SearchTabButtons";
import {
  SeerrIndexPage,
  SeerrSearchSort,
} from "@/components/seerr/SeerrIndexPage";
import useRouter from "@/hooks/useAppRouter";
import { useSeerr } from "@/hooks/useSeerr";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { useSettings } from "@/utils/atoms/settings";
import { eventBus } from "@/utils/eventBus";
import { getPrimaryImageUrl } from "@/utils/jellyfin/image/getPrimaryImageUrl";
import { createStreamystatsApi } from "@/utils/streamystats";

type SearchType = "Library" | "Discover";

const exampleSearches = [
  "Lord of the rings",
  "Avengers",
  "Game of Thrones",
  "Breaking Bad",
  "Stranger Things",
  "The Mandalorian",
];

export default function SearchPage() {
  const params = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [user] = useAtom(userAtom);

  const { t } = useTranslation();

  const searchFilterId = useId();
  const orderFilterId = useId();

  const { q } = params as { q: string };

  const [searchType, setSearchType] = useState<SearchType>("Library");
  const [search, setSearch] = useState<string>("");

  const [debouncedSearch, setDebouncedSearch] = useState("");
  const abortControllerRef = useRef<AbortController | null>(null);

  const searchDebouncer = useAsyncDebouncer(
    async (query: string) => {
      // Cancel previous in-flight requests
      abortControllerRef.current?.abort();
      abortControllerRef.current = new AbortController();
      setDebouncedSearch(query);
      return query;
    },
    { wait: 200 },
  );

  useEffect(() => {
    searchDebouncer.maybeExecute(search);
  }, [search]);

  const [api] = useAtom(apiAtom);

  const { settings } = useSettings();
  const { seerrApi } = useSeerr();
  const [seerrOrderBy, setSeerrOrderBy] = useState<SeerrSearchSort>(
    SeerrSearchSort[SeerrSearchSort.DEFAULT] as unknown as SeerrSearchSort,
  );
  const [seerrSortOrder, setSeerrSortOrder] = useState<"asc" | "desc">("desc");

  const searchEngine = useMemo(() => {
    return settings?.searchEngine || "Jellyfin";
  }, [settings]);

  useEffect(() => {
    if (q && q.length > 0) {
      setSearch(q);
    }
  }, [q]);

  const searchFn = useCallback(
    async ({
      types,
      query,
      signal,
    }: {
      types: BaseItemKind[];
      query: string;
      signal?: AbortSignal;
    }): Promise<BaseItemDto[]> => {
      if (!api || !query) {
        return [];
      }

      try {
        if (searchEngine === "Jellyfin") {
          const searchApi = await getItemsApi(api).getItems(
            {
              searchTerm: query,
              limit: 10,
              includeItemTypes: types,
              recursive: true,
              userId: user?.Id,
            },
            { signal },
          );

          return (searchApi.data.Items as BaseItemDto[]) || [];
        }

        if (searchEngine === "Streamystats") {
          if (!settings?.streamyStatsServerUrl || !api.accessToken) {
            return [];
          }

          const streamyStatsApi = createStreamystatsApi({
            serverUrl: settings.streamyStatsServerUrl,
            jellyfinToken: api.accessToken,
          });

          const typeMap: Record<BaseItemKind, string> = {
            Movie: "movies",
            Series: "series",
            Episode: "episodes",
            Person: "actors",
            BoxSet: "movies",
            Audio: "audio",
          } as Record<BaseItemKind, string>;

          const searchType = types.length === 1 ? typeMap[types[0]] : "media";
          const response = await streamyStatsApi.searchIds(
            query,
            searchType as "movies" | "series" | "episodes" | "actors" | "media",
            10,
            signal,
          );

          const allIds: string[] = [
            ...(response.data.movies || []),
            ...(response.data.series || []),
            ...(response.data.episodes || []),
            ...(response.data.actors || []),
            ...(response.data.audio || []),
          ];

          if (!allIds.length) {
            return [];
          }

          const itemsResponse = await getItemsApi(api).getItems(
            {
              ids: allIds,
              enableImageTypes: ["Primary", "Backdrop", "Thumb"],
            },
            { signal },
          );

          return (itemsResponse.data.Items as BaseItemDto[]) || [];
        }

        // Marlin search
        if (!settings?.marlinServerUrl) {
          return [];
        }

        const url = `${
          settings.marlinServerUrl
        }/search?q=${encodeURIComponent(query)}&includeItemTypes=${types
          .map((type) => encodeURIComponent(type))
          .join("&includeItemTypes=")}`;

        const response1 = await axios.get(url, { signal });

        const ids = response1.data.ids;

        if (!ids || !ids.length) {
          return [];
        }

        const response2 = await getItemsApi(api).getItems(
          {
            ids,
            enableImageTypes: ["Primary", "Backdrop", "Thumb"],
          },
          { signal },
        );

        return (response2.data.Items as BaseItemDto[]) || [];
      } catch (error) {
        // Silently handle aborted requests
        if (error instanceof Error && error.name === "AbortError") {
          return [];
        }
        return [];
      }
    },
    [api, searchEngine, settings, user?.Id],
  );

  // Separate search function for music types - always uses Jellyfin since Streamystats doesn't support music
  const jellyfinSearchFn = useCallback(
    async ({
      types,
      query,
      signal,
    }: {
      types: BaseItemKind[];
      query: string;
      signal?: AbortSignal;
    }): Promise<BaseItemDto[]> => {
      if (!api || !query) {
        return [];
      }

      try {
        const searchApi = await getItemsApi(api).getItems(
          {
            searchTerm: query,
            limit: 10,
            includeItemTypes: types,
            recursive: true,
            userId: user?.Id,
          },
          { signal },
        );

        return (searchApi.data.Items as BaseItemDto[]) || [];
      } catch (error) {
        // Silently handle aborted requests
        if (error instanceof Error && error.name === "AbortError") {
          return [];
        }
        return [];
      }
    },
    [api, user?.Id],
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
      // Screen not active
      if (!searchBarRef.current) {
        return;
      }
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
        signal: abortControllerRef.current?.signal,
      }),
    enabled: searchType === "Library" && debouncedSearch.length > 0,
  });

  const { data: series, isFetching: l2 } = useQuery({
    queryKey: ["search", "series", debouncedSearch],
    queryFn: () =>
      searchFn({
        query: debouncedSearch,
        types: ["Series"],
        signal: abortControllerRef.current?.signal,
      }),
    enabled: searchType === "Library" && debouncedSearch.length > 0,
  });

  const { data: episodes, isFetching: l3 } = useQuery({
    queryKey: ["search", "episodes", debouncedSearch],
    queryFn: () =>
      searchFn({
        query: debouncedSearch,
        types: ["Episode"],
        signal: abortControllerRef.current?.signal,
      }),
    enabled: searchType === "Library" && debouncedSearch.length > 0,
  });

  const { data: collections, isFetching: l7 } = useQuery({
    queryKey: ["search", "collections", debouncedSearch],
    queryFn: () =>
      searchFn({
        query: debouncedSearch,
        types: ["BoxSet"],
        signal: abortControllerRef.current?.signal,
      }),
    enabled: searchType === "Library" && debouncedSearch.length > 0,
  });

  const { data: actors, isFetching: l8 } = useQuery({
    queryKey: ["search", "actors", debouncedSearch],
    queryFn: () =>
      searchFn({
        query: debouncedSearch,
        types: ["Person"],
        signal: abortControllerRef.current?.signal,
      }),
    enabled: searchType === "Library" && debouncedSearch.length > 0,
  });

  // Music search queries - always use Jellyfin since Streamystats doesn't support music
  const { data: artists, isFetching: l9 } = useQuery({
    queryKey: ["search", "artists", debouncedSearch],
    queryFn: () =>
      jellyfinSearchFn({
        query: debouncedSearch,
        types: ["MusicArtist"],
        signal: abortControllerRef.current?.signal,
      }),
    enabled: searchType === "Library" && debouncedSearch.length > 0,
  });

  const { data: albums, isFetching: l10 } = useQuery({
    queryKey: ["search", "albums", debouncedSearch],
    queryFn: () =>
      jellyfinSearchFn({
        query: debouncedSearch,
        types: ["MusicAlbum"],
        signal: abortControllerRef.current?.signal,
      }),
    enabled: searchType === "Library" && debouncedSearch.length > 0,
  });

  const { data: songs, isFetching: l11 } = useQuery({
    queryKey: ["search", "songs", debouncedSearch],
    queryFn: () =>
      jellyfinSearchFn({
        query: debouncedSearch,
        types: ["Audio"],
        signal: abortControllerRef.current?.signal,
      }),
    enabled: searchType === "Library" && debouncedSearch.length > 0,
  });

  const { data: playlists, isFetching: l12 } = useQuery({
    queryKey: ["search", "playlists", debouncedSearch],
    queryFn: () =>
      jellyfinSearchFn({
        query: debouncedSearch,
        types: ["Playlist"],
        signal: abortControllerRef.current?.signal,
      }),
    enabled: searchType === "Library" && debouncedSearch.length > 0,
  });

  const noResults = useMemo(() => {
    return !(
      movies?.length ||
      episodes?.length ||
      series?.length ||
      collections?.length ||
      actors?.length ||
      artists?.length ||
      albums?.length ||
      songs?.length ||
      playlists?.length
    );
  }, [
    episodes,
    movies,
    series,
    collections,
    actors,
    artists,
    albums,
    songs,
    playlists,
  ]);

  const loading = useMemo(() => {
    return l1 || l2 || l3 || l7 || l8 || l9 || l10 || l11 || l12;
  }, [l1, l2, l3, l7, l8, l9, l10, l11, l12]);

  return (
    <ScrollView
      keyboardDismissMode='on-drag'
      contentInsetAdjustmentBehavior='automatic'
      contentContainerStyle={{
        paddingLeft: insets.left,
        paddingRight: insets.right,
        paddingBottom: 60,
      }}
    >
      {/* <View
        className='flex flex-col'
        style={{
          marginTop: Platform.OS === "android" ? 16 : 0,
        }}
      > */}
      {Platform.isTV && (
        <Input
          placeholder={t("search.search")}
          onChangeText={(text) => {
            router.setParams({ q: "" });
            setSearch(text);
          }}
          keyboardType='default'
          returnKeyType='done'
          autoCapitalize='none'
          clearButtonMode='while-editing'
          maxLength={500}
        />
      )}
      <View
        className='flex flex-col'
        style={{ paddingTop: Platform.OS === "android" ? 10 : 0 }}
      >
        {seerrApi && (
          <View className='pl-4 pr-4 flex flex-row'>
            <SearchTabButtons
              searchType={searchType}
              setSearchType={setSearchType}
              t={t}
            />
            {searchType === "Discover" &&
              !loading &&
              noResults &&
              debouncedSearch.length > 0 && (
                <DiscoverFilters
                  searchFilterId={searchFilterId}
                  orderFilterId={orderFilterId}
                  seerrOrderBy={seerrOrderBy}
                  setSeerrOrderBy={setSeerrOrderBy}
                  seerrSortOrder={seerrSortOrder}
                  setSeerrSortOrder={setSeerrSortOrder}
                  t={t}
                />
              )}
          </View>
        )}

        <View className='mt-2'>
          <LoadingSkeleton isLoading={loading} />
        </View>

        {searchType === "Library" ? (
          <View className={l1 || l2 ? "opacity-0" : "opacity-100"}>
            <SearchItemWrapper
              header={t("search.movies")}
              items={movies}
              renderItem={(item: BaseItemDto) => (
                <TouchableItemRouter
                  key={item.Id}
                  className='flex flex-col w-28 mr-2'
                  item={item}
                >
                  <MoviePoster item={item} key={item.Id} />
                  <Text numberOfLines={2} className='mt-2'>
                    {item.Name}
                  </Text>
                  <Text className='opacity-50 text-xs'>
                    {item.ProductionYear}
                  </Text>
                </TouchableItemRouter>
              )}
            />
            <SearchItemWrapper
              items={series}
              header={t("search.series")}
              renderItem={(item: BaseItemDto) => (
                <TouchableItemRouter
                  key={item.Id}
                  item={item}
                  className='flex flex-col w-28 mr-2'
                >
                  <SeriesPoster item={item} key={item.Id} />
                  <Text numberOfLines={2} className='mt-2'>
                    {item.Name}
                  </Text>
                  <Text className='opacity-50 text-xs'>
                    {item.ProductionYear}
                  </Text>
                </TouchableItemRouter>
              )}
            />
            <SearchItemWrapper
              items={episodes}
              header={t("search.episodes")}
              renderItem={(item: BaseItemDto) => (
                <TouchableItemRouter
                  item={item}
                  key={item.Id}
                  className='flex flex-col w-44 mr-2'
                >
                  <ContinueWatchingPoster item={item} />
                  <ItemCardText item={item} />
                </TouchableItemRouter>
              )}
            />
            <SearchItemWrapper
              items={collections}
              header={t("search.collections")}
              renderItem={(item: BaseItemDto) => (
                <TouchableItemRouter
                  key={item.Id}
                  item={item}
                  className='flex flex-col w-28 mr-2'
                >
                  <MoviePoster item={item} key={item.Id} />
                  <Text numberOfLines={2} className='mt-2'>
                    {item.Name}
                  </Text>
                </TouchableItemRouter>
              )}
            />
            <SearchItemWrapper
              items={actors}
              header={t("search.actors")}
              renderItem={(item: BaseItemDto) => (
                <TouchableItemRouter
                  item={item}
                  key={item.Id}
                  className='flex flex-col w-28 mr-2'
                >
                  <MoviePoster item={item} />
                  <ItemCardText item={item} />
                </TouchableItemRouter>
              )}
            />
            {/* Music search results */}
            <SearchItemWrapper
              items={artists}
              header={t("search.artists")}
              renderItem={(item: BaseItemDto) => {
                const imageUrl = getPrimaryImageUrl({ api, item });
                return (
                  <TouchableItemRouter
                    item={item}
                    key={item.Id}
                    className='flex flex-col w-24 mr-2 items-center'
                  >
                    <View
                      style={{
                        width: 80,
                        height: 80,
                        borderRadius: 40,
                        overflow: "hidden",
                        backgroundColor: "#1a1a1a",
                      }}
                    >
                      {imageUrl ? (
                        <Image
                          source={{ uri: imageUrl }}
                          style={{ width: "100%", height: "100%" }}
                          contentFit='cover'
                        />
                      ) : (
                        <View className='flex-1 items-center justify-center bg-neutral-800'>
                          <Text className='text-xl'>👤</Text>
                        </View>
                      )}
                    </View>
                    <Text numberOfLines={2} className='mt-2 text-center'>
                      {item.Name}
                    </Text>
                  </TouchableItemRouter>
                );
              }}
            />
            <SearchItemWrapper
              items={albums}
              header={t("search.albums")}
              renderItem={(item: BaseItemDto) => {
                const imageUrl = getPrimaryImageUrl({ api, item });
                return (
                  <TouchableItemRouter
                    item={item}
                    key={item.Id}
                    className='flex flex-col w-28 mr-2'
                  >
                    <View
                      style={{
                        width: 112,
                        height: 112,
                        borderRadius: 8,
                        overflow: "hidden",
                        backgroundColor: "#1a1a1a",
                      }}
                    >
                      {imageUrl ? (
                        <Image
                          source={{ uri: imageUrl }}
                          style={{ width: "100%", height: "100%" }}
                          contentFit='cover'
                        />
                      ) : (
                        <View className='flex-1 items-center justify-center bg-neutral-800'>
                          <Text className='text-4xl'>🎵</Text>
                        </View>
                      )}
                    </View>
                    <Text numberOfLines={2} className='mt-2'>
                      {item.Name}
                    </Text>
                    <Text className='opacity-50 text-xs' numberOfLines={1}>
                      {item.AlbumArtist || item.Artists?.join(", ")}
                    </Text>
                  </TouchableItemRouter>
                );
              }}
            />
            <SearchItemWrapper
              items={songs}
              header={t("search.songs")}
              renderItem={(item: BaseItemDto) => {
                const imageUrl = getPrimaryImageUrl({ api, item });
                return (
                  <TouchableItemRouter
                    item={item}
                    key={item.Id}
                    className='flex flex-col w-28 mr-2'
                  >
                    <View
                      style={{
                        width: 112,
                        height: 112,
                        borderRadius: 8,
                        overflow: "hidden",
                        backgroundColor: "#1a1a1a",
                      }}
                    >
                      {imageUrl ? (
                        <Image
                          source={{ uri: imageUrl }}
                          style={{ width: "100%", height: "100%" }}
                          contentFit='cover'
                        />
                      ) : (
                        <View className='flex-1 items-center justify-center bg-neutral-800'>
                          <Text className='text-4xl'>🎵</Text>
                        </View>
                      )}
                    </View>
                    <Text numberOfLines={2} className='mt-2'>
                      {item.Name}
                    </Text>
                    <Text className='opacity-50 text-xs' numberOfLines={1}>
                      {item.Artists?.join(", ") || item.AlbumArtist}
                    </Text>
                  </TouchableItemRouter>
                );
              }}
            />
            <SearchItemWrapper
              items={playlists}
              header={t("search.playlists")}
              renderItem={(item: BaseItemDto) => {
                const imageUrl = getPrimaryImageUrl({ api, item });
                return (
                  <TouchableItemRouter
                    item={item}
                    key={item.Id}
                    className='flex flex-col w-28 mr-2'
                  >
                    <View
                      style={{
                        width: 112,
                        height: 112,
                        borderRadius: 8,
                        overflow: "hidden",
                        backgroundColor: "#1a1a1a",
                      }}
                    >
                      {imageUrl ? (
                        <Image
                          source={{ uri: imageUrl }}
                          style={{ width: "100%", height: "100%" }}
                          contentFit='cover'
                        />
                      ) : (
                        <View className='flex-1 items-center justify-center bg-neutral-800'>
                          <Text className='text-4xl'>🎶</Text>
                        </View>
                      )}
                    </View>
                    <Text numberOfLines={2} className='mt-2'>
                      {item.Name}
                    </Text>
                    <Text className='opacity-50 text-xs'>
                      {item.ChildCount} tracks
                    </Text>
                  </TouchableItemRouter>
                );
              }}
            />
          </View>
        ) : (
          <SeerrIndexPage
            searchQuery={debouncedSearch}
            sortType={seerrOrderBy}
            order={seerrSortOrder}
          />
        )}

        {searchType === "Library" &&
          (!loading && noResults && debouncedSearch.length > 0 ? (
            <View>
              <Text className='text-center text-lg font-bold mt-4'>
                {t("search.no_results_found_for")}
              </Text>
              <Text className='text-xs text-purple-600 text-center'>
                "{debouncedSearch}"
              </Text>
            </View>
          ) : debouncedSearch.length === 0 ? (
            <View className='mt-4 flex flex-col items-center space-y-2'>
              {exampleSearches.map((e) => (
                <TouchableOpacity
                  onPress={() => {
                    setSearch(e);
                    searchBarRef.current?.setText(e);
                  }}
                  key={e}
                  className='mb-2'
                >
                  <Text className='text-purple-600'>{e}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : null)}
      </View>
    </ScrollView>
  );
}

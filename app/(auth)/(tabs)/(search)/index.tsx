import type {
  BaseItemDto,
  BaseItemKind,
} from "@jellyfin/sdk/lib/generated-client/models";
import { getItemsApi } from "@jellyfin/sdk/lib/utils/api";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { useLocalSearchParams, useNavigation, useSegments } from "expo-router";
import { useAtom } from "jotai";
import { orderBy, uniqBy } from "lodash";
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
import { CardRow } from "@/components/cards/CardRow";
import { Image } from "@/components/common/ServerImage";
import { Text } from "@/components/common/Text";
import {
  getItemNavigation,
  TouchableItemRouter,
} from "@/components/common/TouchableItemRouter";
import {
  JellyseerrSearchSort,
  JellyserrIndexPage,
} from "@/components/jellyseerr/JellyseerrIndexPage";
import { DiscoverFilters } from "@/components/search/DiscoverFilters";
import { LoadingSkeleton } from "@/components/search/LoadingSkeleton";
import { SearchItemWrapper } from "@/components/search/SearchItemWrapper";
import { SearchTabButtons } from "@/components/search/SearchTabButtons";
import { TVSearchPage } from "@/components/search/TVSearchPage";
import useRouter from "@/hooks/useAppRouter";
import { useJellyseerr } from "@/hooks/useJellyseerr";
import { useTVItemActionModal } from "@/hooks/useTVItemActionModal";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { useSettings } from "@/utils/atoms/settings";
import { getIntegrationHeaders } from "@/utils/customHeaders";
import { isAbortLikeError } from "@/utils/errors";
import { eventBus } from "@/utils/eventBus";
import { getPrimaryImageUrl } from "@/utils/jellyfin/image/getPrimaryImageUrl";
import { MediaType } from "@/utils/jellyseerr/server/constants/media";
import type {
  MovieResult,
  PersonResult,
  TvResult,
} from "@/utils/jellyseerr/server/models/Search";
import { logAndCaptureError } from "@/utils/log";
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
  const { showItemActions } = useTVItemActionModal();
  const segments = useSegments();
  const from = (segments as string[])[2] || "(search)";

  const [user] = useAtom(userAtom);

  const { t } = useTranslation();

  const searchFilterId = useId();
  const orderFilterId = useId();

  const { q } = params as { q: string };

  const [searchType, setSearchType] = useState<SearchType>("Library");
  const [search, setSearch] = useState<string>("");

  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedSearch(search), 200);
    return () => clearTimeout(timeout);
  }, [search]);

  const [api] = useAtom(apiAtom);

  const { settings } = useSettings();
  const { jellyseerrApi } = useJellyseerr();
  const [jellyseerrOrderBy, setJellyseerrOrderBy] =
    useState<JellyseerrSearchSort>(
      JellyseerrSearchSort[
        JellyseerrSearchSort.DEFAULT
      ] as unknown as JellyseerrSearchSort,
    );
  const [jellyseerrSortOrder, setJellyseerrSortOrder] = useState<
    "asc" | "desc"
  >("desc");

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

        const url = `${settings.marlinServerUrl}/search?q=${encodeURIComponent(query)}&includeItemTypes=${types
          .map((type) => encodeURIComponent(type))
          .join("&includeItemTypes=")}`;

        const response1 = await axios.get(url, {
          signal,
          headers: getIntegrationHeaders("marlin"),
        });

        const ids = response1.data.ids;

        if (!ids?.length) {
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
        // Aborted requests are routine; anything else used to render as
        // "no results" with no trace of the failure.
        if (!isAbortLikeError(error)) {
          logAndCaptureError("Search request failed", error);
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
        if (!isAbortLikeError(error)) {
          logAndCaptureError("Music search request failed", error);
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
        // Android: color of the user-typed text (was dark and unreadable on the dark header)
        textColor: "#fff",
        // Android: placeholder and icon color
        hintTextColor: "#fff",
        headerIconColor: "#fff",
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
    queryFn: ({ signal }) =>
      searchFn({
        query: debouncedSearch,
        types: ["Movie"],
        signal,
      }),
    enabled: searchType === "Library" && debouncedSearch.length > 0,
  });

  const { data: series, isFetching: l2 } = useQuery({
    queryKey: ["search", "series", debouncedSearch],
    queryFn: ({ signal }) =>
      searchFn({
        query: debouncedSearch,
        types: ["Series"],
        signal,
      }),
    enabled: searchType === "Library" && debouncedSearch.length > 0,
  });

  const { data: episodes, isFetching: l3 } = useQuery({
    queryKey: ["search", "episodes", debouncedSearch],
    queryFn: ({ signal }) =>
      searchFn({
        query: debouncedSearch,
        types: ["Episode"],
        signal,
      }),
    enabled: searchType === "Library" && debouncedSearch.length > 0,
  });

  const { data: collections, isFetching: l7 } = useQuery({
    queryKey: ["search", "collections", debouncedSearch],
    queryFn: ({ signal }) =>
      searchFn({
        query: debouncedSearch,
        types: ["BoxSet"],
        signal,
      }),
    enabled: searchType === "Library" && debouncedSearch.length > 0,
  });

  const { data: actors, isFetching: l8 } = useQuery({
    queryKey: ["search", "actors", debouncedSearch],
    queryFn: ({ signal }) =>
      searchFn({
        query: debouncedSearch,
        types: ["Person"],
        signal,
      }),
    enabled: searchType === "Library" && debouncedSearch.length > 0,
  });

  // Music search queries - always use Jellyfin since Streamystats doesn't support music
  const { data: artists, isFetching: l9 } = useQuery({
    queryKey: ["search", "artists", debouncedSearch],
    queryFn: ({ signal }) =>
      jellyfinSearchFn({
        query: debouncedSearch,
        types: ["MusicArtist"],
        signal,
      }),
    enabled: searchType === "Library" && debouncedSearch.length > 0,
  });

  const { data: albums, isFetching: l10 } = useQuery({
    queryKey: ["search", "albums", debouncedSearch],
    queryFn: ({ signal }) =>
      jellyfinSearchFn({
        query: debouncedSearch,
        types: ["MusicAlbum"],
        signal,
      }),
    enabled: searchType === "Library" && debouncedSearch.length > 0,
  });

  const { data: songs, isFetching: l11 } = useQuery({
    queryKey: ["search", "songs", debouncedSearch],
    queryFn: ({ signal }) =>
      jellyfinSearchFn({
        query: debouncedSearch,
        types: ["Audio"],
        signal,
      }),
    enabled: searchType === "Library" && debouncedSearch.length > 0,
  });

  const { data: playlists, isFetching: l12 } = useQuery({
    queryKey: ["search", "playlists", debouncedSearch],
    queryFn: ({ signal }) =>
      jellyfinSearchFn({
        query: debouncedSearch,
        types: ["Playlist"],
        signal,
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

  // TV item press handler
  const handleItemPress = useCallback(
    (item: BaseItemDto) => {
      const navigation = getItemNavigation(item, from);
      router.push(navigation as any);
    },
    [from, router],
  );

  // Jellyseerr search for TV
  const { data: jellyseerrTVResults, isFetching: jellyseerrTVLoading } =
    useQuery({
      queryKey: ["search", "jellyseerr", "tv", debouncedSearch],
      queryFn: async () => {
        const params = {
          query: new URLSearchParams(debouncedSearch || "").toString(),
        };
        return await Promise.all([
          jellyseerrApi?.search({ ...params, page: 1 }),
          jellyseerrApi?.search({ ...params, page: 2 }),
          jellyseerrApi?.search({ ...params, page: 3 }),
          jellyseerrApi?.search({ ...params, page: 4 }),
        ]).then((all) =>
          uniqBy(
            all.flatMap((v) => v?.results || []),
            "id",
          ),
        );
      },
      enabled:
        Platform.isTV &&
        !!jellyseerrApi &&
        searchType === "Discover" &&
        debouncedSearch.length > 0,
    });

  // Process Jellyseerr results for TV
  const jellyseerrMovieResults = useMemo(
    () =>
      orderBy(
        jellyseerrTVResults?.filter(
          (r) => r.mediaType === MediaType.MOVIE,
        ) as MovieResult[],
        [(m) => m?.title?.toLowerCase() === debouncedSearch.toLowerCase()],
        "desc",
      ),
    [jellyseerrTVResults, debouncedSearch],
  );

  const jellyseerrTvResults = useMemo(
    () =>
      orderBy(
        jellyseerrTVResults?.filter(
          (r) => r.mediaType === MediaType.TV,
        ) as TvResult[],
        [(t) => t?.name?.toLowerCase() === debouncedSearch.toLowerCase()],
        "desc",
      ),
    [jellyseerrTVResults, debouncedSearch],
  );

  const jellyseerrPersonResults = useMemo(
    () =>
      orderBy(
        jellyseerrTVResults?.filter(
          (r) => r.mediaType === "person",
        ) as PersonResult[],
        [(p) => p?.name?.toLowerCase() === debouncedSearch.toLowerCase()],
        "desc",
      ),
    [jellyseerrTVResults, debouncedSearch],
  );

  const jellyseerrTVNoResults = useMemo(() => {
    return (
      !jellyseerrMovieResults?.length &&
      !jellyseerrTvResults?.length &&
      !jellyseerrPersonResults?.length
    );
  }, [jellyseerrMovieResults, jellyseerrTvResults, jellyseerrPersonResults]);

  // Fetch discover settings for TV (when no search query in Discover mode)
  const { data: discoverSliders } = useQuery({
    queryKey: ["search", "jellyseerr", "discoverSettings", "tv"],
    queryFn: async () => jellyseerrApi?.discoverSettings(),
    enabled:
      Platform.isTV &&
      !!jellyseerrApi &&
      searchType === "Discover" &&
      debouncedSearch.length === 0,
  });

  // TV Jellyseerr press handlers
  const handleJellyseerrMoviePress = useCallback(
    (item: MovieResult) => {
      router.push({
        pathname: "/(auth)/(tabs)/(search)/jellyseerr/page",
        params: {
          mediaTitle: item.title,
          releaseYear: String(new Date(item.releaseDate || "").getFullYear()),
          canRequest: "true",
          posterSrc: jellyseerrApi?.imageProxy(item.posterPath) || "",
          mediaType: MediaType.MOVIE,
          id: String(item.id),
          backdropPath: item.backdropPath || "",
          overview: item.overview || "",
        },
      });
    },
    [router, jellyseerrApi],
  );

  const handleJellyseerrTvPress = useCallback(
    (item: TvResult) => {
      router.push({
        pathname: "/(auth)/(tabs)/(search)/jellyseerr/page",
        params: {
          mediaTitle: item.name,
          releaseYear: String(new Date(item.firstAirDate || "").getFullYear()),
          canRequest: "true",
          posterSrc: jellyseerrApi?.imageProxy(item.posterPath) || "",
          mediaType: MediaType.TV,
          id: String(item.id),
          backdropPath: item.backdropPath || "",
          overview: item.overview || "",
        },
      });
    },
    [router, jellyseerrApi],
  );

  const handleJellyseerrPersonPress = useCallback(
    (item: PersonResult) => {
      router.push(`/(auth)/jellyseerr/person/${item.id}` as any);
    },
    [router],
  );

  // Render TV search page
  if (Platform.isTV) {
    return (
      <TVSearchPage
        search={search}
        setSearch={setSearch}
        debouncedSearch={debouncedSearch}
        movies={movies}
        series={series}
        episodes={episodes}
        collections={collections}
        actors={actors}
        artists={artists}
        albums={albums}
        songs={songs}
        playlists={playlists}
        loading={loading}
        noResults={noResults}
        onItemPress={handleItemPress}
        onItemLongPress={showItemActions}
        searchType={searchType}
        setSearchType={setSearchType}
        showDiscover={!!jellyseerrApi}
        jellyseerrMovies={jellyseerrMovieResults}
        jellyseerrTv={jellyseerrTvResults}
        jellyseerrPersons={jellyseerrPersonResults}
        jellyseerrLoading={jellyseerrTVLoading}
        jellyseerrNoResults={jellyseerrTVNoResults}
        onJellyseerrMoviePress={handleJellyseerrMoviePress}
        onJellyseerrTvPress={handleJellyseerrTvPress}
        onJellyseerrPersonPress={handleJellyseerrPersonPress}
        discoverSliders={discoverSliders}
      />
    );
  }

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
      <View
        className='flex flex-col'
        style={{ paddingTop: Platform.OS === "android" ? 10 : 0 }}
      >
        {jellyseerrApi && (
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
                  jellyseerrOrderBy={jellyseerrOrderBy}
                  setJellyseerrOrderBy={setJellyseerrOrderBy}
                  jellyseerrSortOrder={jellyseerrSortOrder}
                  setJellyseerrSortOrder={setJellyseerrSortOrder}
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
            <CardRow
              enableActionSheet
              title={t("search.movies")}
              items={movies ?? []}
              kind='portrait'
              hideIfEmpty
            />
            <CardRow
              enableActionSheet
              title={t("search.series")}
              items={series ?? []}
              kind='portrait'
              hideIfEmpty
            />
            <CardRow
              enableActionSheet
              title={t("search.episodes")}
              items={episodes ?? []}
              kind='wide'
              hideIfEmpty
            />
            <CardRow
              enableActionSheet
              title={t("search.collections")}
              items={collections ?? []}
              kind='portrait'
              hideIfEmpty
            />
            <CardRow
              enableActionSheet
              title={t("search.actors")}
              items={actors ?? []}
              kind='portrait'
              hideIfEmpty
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
          <JellyserrIndexPage
            searchQuery={debouncedSearch}
            sortType={jellyseerrOrderBy}
            order={jellyseerrSortOrder}
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
            <View className='mt-2 flex flex-col items-center space-y-2'>
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

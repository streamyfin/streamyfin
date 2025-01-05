import { Input } from "@/components/common/Input";
import { Text } from "@/components/common/Text";
import { TouchableItemRouter } from "@/components/common/TouchableItemRouter";
import ContinueWatchingPoster from "@/components/ContinueWatchingPoster";
import { ItemCardText } from "@/components/ItemCardText";
import { Loader } from "@/components/Loader";
import AlbumCover from "@/components/posters/AlbumCover";
import MoviePoster from "@/components/posters/MoviePoster";
import SeriesPoster from "@/components/posters/SeriesPoster";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { useSettings } from "@/utils/atoms/settings";
import { getUserItemData } from "@/utils/jellyfin/user-library/getUserItemData";
import {
  BaseItemDto,
  BaseItemKind,
} from "@jellyfin/sdk/lib/generated-client/models";
import { getItemsApi, getSearchApi } from "@jellyfin/sdk/lib/utils/api";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { Href, router, useLocalSearchParams, useNavigation } from "expo-router";
import { useAtom } from "jotai";
import React, {
  PropsWithChildren,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";
import { Platform, ScrollView, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useDebounce } from "use-debounce";
import { useJellyseerr } from "@/hooks/useJellyseerr";
import {MovieResult, PersonResult, TvResult} from "@/utils/jellyseerr/server/models/Search";
import { MediaType } from "@/utils/jellyseerr/server/constants/media";
import JellyseerrPoster from "@/components/posters/JellyseerrPoster";
import { Tag } from "@/components/GenreTags";
import DiscoverSlide from "@/components/jellyseerr/DiscoverSlide";
import { sortBy } from "lodash";
import PersonPoster from "@/components/jellyseerr/PersonPoster";

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

  const { q, prev } = params as { q: string; prev: Href<string> };

  const [searchType, setSearchType] = useState<SearchType>("Library");
  const [search, setSearch] = useState<string>("");

  const [debouncedSearch] = useDebounce(search, 500);

  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);

  const [settings] = useSettings();
  const { jellyseerrApi } = useJellyseerr();

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

  const navigation = useNavigation();
  useLayoutEffect(() => {
    if (Platform.OS === "ios")
      navigation.setOptions({
        headerSearchBarOptions: {
          placeholder: "Search...",
          onChangeText: (e: any) => {
            router.setParams({ q: "" });
            setSearch(e.nativeEvent.text);
          },
          hideWhenScrolling: false,
          autoFocus: true,
        },
      });
  }, [navigation]);

  const { data: movies, isFetching: l1 } = useQuery({
    queryKey: ["search", "movies", debouncedSearch],
    queryFn: () =>
      searchFn({
        query: debouncedSearch,
        types: ["Movie"],
      }),
    enabled: searchType === "Library" && debouncedSearch.length > 0,
  });

  const { data: jellyseerrResults, isFetching: j1 } = useQuery({
    queryKey: ["search", "jellyseerrResults", debouncedSearch],
    queryFn: async () => {
      const response = await jellyseerrApi?.search({
        query: new URLSearchParams(debouncedSearch).toString(),
        page: 1, // todo: maybe rework page & page-size if first results are not enough...
        language: "en",
      });

      return response?.results;
    },
    enabled:
      !!jellyseerrApi &&
      searchType === "Discover" &&
      debouncedSearch.length > 0,
  });

  const { data: jellyseerrDiscoverSettings, isFetching: j2 } = useQuery({
    queryKey: ["search", "jellyseerrDiscoverSettings", debouncedSearch],
    queryFn: async () => jellyseerrApi?.discoverSettings(),
    enabled:
      !!jellyseerrApi &&
      searchType === "Discover" &&
      debouncedSearch.length == 0,
  });

  const jellyseerrMovieResults: MovieResult[] | undefined = useMemo(
    () =>
      jellyseerrResults?.filter(
        (r) => r.mediaType === MediaType.MOVIE
      ) as MovieResult[],
    [jellyseerrResults]
  );

  const jellyseerrTvResults: TvResult[] | undefined = useMemo(
    () =>
      jellyseerrResults?.filter(
        (r) => r.mediaType === MediaType.TV
      ) as TvResult[],
    [jellyseerrResults]
  );

  const jellyseerrPersonResults: PersonResult[] | undefined = useMemo(
    () =>
      jellyseerrResults?.filter(
        (r) => r.mediaType === "person"
      ) as PersonResult[],
    [jellyseerrResults]
  );

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

  const { data: artists, isFetching: l4 } = useQuery({
    queryKey: ["search", "artists", debouncedSearch],
    queryFn: () =>
      searchFn({
        query: debouncedSearch,
        types: ["MusicArtist"],
      }),
    enabled: searchType === "Library" && debouncedSearch.length > 0,
  });

  const { data: albums, isFetching: l5 } = useQuery({
    queryKey: ["search", "albums", debouncedSearch],
    queryFn: () =>
      searchFn({
        query: debouncedSearch,
        types: ["MusicAlbum"],
      }),
    enabled: searchType === "Library" && debouncedSearch.length > 0,
  });

  const { data: songs, isFetching: l6 } = useQuery({
    queryKey: ["search", "songs", debouncedSearch],
    queryFn: () =>
      searchFn({
        query: debouncedSearch,
        types: ["Audio"],
      }),
    enabled: searchType === "Library" && debouncedSearch.length > 0,
  });

  const noResults = useMemo(() => {
    return !(
      artists?.length ||
      albums?.length ||
      songs?.length ||
      movies?.length ||
      episodes?.length ||
      series?.length ||
      collections?.length ||
      actors?.length ||
      jellyseerrMovieResults?.length ||
      jellyseerrTvResults?.length
    );
  }, [
    artists,
    episodes,
    albums,
    songs,
    movies,
    series,
    collections,
    actors,
    jellyseerrResults,
  ]);

  const loading = useMemo(() => {
    return l1 || l2 || l3 || l4 || l5 || l6 || l7 || l8 || j1 || j2;
  }, [l1, l2, l3, l4, l5, l6, l7, l8, j1, j2]);

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
        <View className="flex flex-col pt-2">
          {Platform.OS === "android" && (
            <View className="mb-4 px-4">
              <Input
                autoCorrect={false}
                returnKeyType="done"
                keyboardType="web-search"
                placeholder="Search here..."
                value={search}
                onChangeText={(text) => setSearch(text)}
              />
            </View>
          )}
          {jellyseerrApi && (
            <View className="flex flex-row flex-wrap space-x-2 px-4 mb-2">
              <TouchableOpacity onPress={() => setSearchType("Library")}>
                <Tag
                  text="Library"
                  textClass="p-1"
                  className={
                    searchType === "Library" ? "bg-purple-600" : undefined
                  }
                />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setSearchType("Discover")}>
                <Tag
                  text="Discover"
                  textClass="p-1"
                  className={
                    searchType === "Discover" ? "bg-purple-600" : undefined
                  }
                />
              </TouchableOpacity>
            </View>
          )}
          {!!q && (
            <View className="px-4 flex flex-col space-y-2">
              <Text className="text-neutral-500 ">
                Results for <Text className="text-purple-600">{q}</Text>
              </Text>
            </View>
          )}
          {searchType === "Library" && (
            <>
              <SearchItemWrapper
                header="Movies"
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
                header="Series"
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
                header="Episodes"
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
                header="Collections"
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
                header="Actors"
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
              <SearchItemWrapper
                ids={artists?.map((m) => m.Id!)}
                header="Artists"
                renderItem={(item: BaseItemDto) => (
                  <TouchableItemRouter
                    item={item}
                    key={item.Id}
                    className="flex flex-col w-28 mr-2"
                  >
                    <AlbumCover id={item.Id} />
                    <ItemCardText item={item} />
                  </TouchableItemRouter>
                )}
              />
              <SearchItemWrapper
                ids={albums?.map((m) => m.Id!)}
                header="Albums"
                renderItem={(item: BaseItemDto) => (
                  <TouchableItemRouter
                    item={item}
                    key={item.Id}
                    className="flex flex-col w-28 mr-2"
                  >
                    <AlbumCover id={item.Id} />
                    <ItemCardText item={item} />
                  </TouchableItemRouter>
                )}
              />
              <SearchItemWrapper
                ids={songs?.map((m) => m.Id!)}
                header="Songs"
                renderItem={(item: BaseItemDto) => (
                  <TouchableItemRouter
                    item={item}
                    key={item.Id}
                    className="flex flex-col w-28 mr-2"
                  >
                    <AlbumCover id={item.AlbumId} />
                    <ItemCardText item={item} />
                  </TouchableItemRouter>
                )}
              />
            </>
          )}
          {searchType === "Discover" && (
            <>
              <SearchItemWrapper
                header="Request Movies"
                items={jellyseerrMovieResults}
                renderItem={(item: MovieResult) => (
                  <JellyseerrPoster item={item} key={item.id} />
                )}
              />
              <SearchItemWrapper
                header="Request Series"
                items={jellyseerrTvResults}
                renderItem={(item: TvResult) => (
                  <JellyseerrPoster item={item} key={item.id} />
                )}
              />
              <SearchItemWrapper
                header="Actors"
                items={jellyseerrPersonResults}
                renderItem={(item: PersonResult) => (
                  <PersonPoster
                    className="mr-2"
                    key={item.id}
                    id={item.id.toString()}
                    name={item.name}
                    posterPath={item.profilePath}
                  />
                )}
              />
            </>
          )}

          {loading ? (
            <View className="mt-4 flex justify-center items-center">
              <Loader />
            </View>
          ) : noResults && debouncedSearch.length > 0 ? (
            <View>
              <Text className="text-center text-lg font-bold mt-4">
                No results found for
              </Text>
              <Text className="text-xs text-purple-600 text-center">
                "{debouncedSearch}"
              </Text>
            </View>
          ) : debouncedSearch.length === 0 && searchType === "Library" ? (
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
          ) : debouncedSearch.length === 0 && searchType === "Discover" ? (
            <View className="flex flex-col">
              {sortBy?.(
                jellyseerrDiscoverSettings?.filter((s) => s.enabled),
                "order"
              ).map((slide) => (
                <DiscoverSlide key={slide.id} slide={slide} />
              ))}
            </View>
          ) : null}
        </View>
      </ScrollView>
    </>
  );
}

type Props<T> = {
  ids?: string[] | null;
  items?: T[];
  renderItem: (item: any) => React.ReactNode;
  header?: string;
};

const SearchItemWrapper = <T extends unknown>({
  ids,
  items,
  renderItem,
  header,
}: PropsWithChildren<Props<T>>) => {
  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);

  const { data, isLoading: l1 } = useQuery({
    queryKey: ["items", ids],
    queryFn: async () => {
      if (!user?.Id || !api || !ids || ids.length === 0) {
        return [];
      }

      const itemPromises = ids.map((id) =>
        getUserItemData({
          api,
          userId: user.Id,
          itemId: id,
        })
      );

      const results = await Promise.all(itemPromises);

      // Filter out null items
      return results.filter(
        (item) => item !== null
      ) as unknown as BaseItemDto[];
    },
    enabled: !!ids && ids.length > 0 && !!api && !!user?.Id,
    staleTime: Infinity,
  });

  if (!data && (!items || items.length === 0)) return null;

  return (
    <>
      <Text className="font-bold text-lg px-4 mb-2">{header}</Text>
      <ScrollView
        horizontal
        className="px-4 mb-2"
        showsHorizontalScrollIndicator={false}
      >
        {data && data?.length > 0
          ? data.map((item) => renderItem(item))
          : items && items?.length > 0
          ? items.map((i) => renderItem(i))
          : undefined}
      </ScrollView>
    </>
  );
};

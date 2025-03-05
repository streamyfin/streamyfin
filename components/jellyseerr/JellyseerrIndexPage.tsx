import Discover from "@/components/jellyseerr/discover/Discover";
import { useJellyseerr } from "@/hooks/useJellyseerr";
import { MediaType } from "@/utils/jellyseerr/server/constants/media";
import {
  MovieResult,
  PersonResult,
  TvResult,
} from "@/utils/jellyseerr/server/models/Search";
import { useReactNavigationQuery } from "@/utils/useReactNavigationQuery";
import React, {useMemo, useState} from "react";
import { View, ViewProps } from "react-native";
import {
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { Text } from "../common/Text";
import JellyseerrPoster from "../posters/JellyseerrPoster";
import { LoadingSkeleton } from "../search/LoadingSkeleton";
import { SearchItemWrapper } from "../search/SearchItemWrapper";
import PersonPoster from "./PersonPoster";
import { useTranslation } from "react-i18next";
import {orderBy, uniqBy} from "lodash";
import {useInfiniteQuery} from "@tanstack/react-query";

interface Props extends ViewProps {
  searchQuery: string;
  sortType?: JellyseerrSearchSort;
  order?: "asc" | "desc";
}

export enum JellyseerrSearchSort {
  DEFAULT,
  VOTE_COUNT_AND_AVERAGE,
  POPULARITY
}

export const JellyserrIndexPage: React.FC<Props> = ({
  searchQuery,
  sortType,
  order
}) => {
  const { jellyseerrApi } = useJellyseerr();
  const opacity = useSharedValue(1);
  const { t } = useTranslation();

  const [loadInitialPages, setLoadInitialPages] = useState<Boolean>(false)

  const {
    data: jellyseerrDiscoverSettings,
    isFetching: f1,
    isLoading: l1,
  } = useReactNavigationQuery({
    queryKey: ["search", "jellyseerr", "discoverSettings", searchQuery],
    queryFn: async () => jellyseerrApi?.discoverSettings(),
    enabled: !!jellyseerrApi && searchQuery.length == 0,
  });

  const {
    data: jellyseerrResultPages,
    isFetching: f2,
    isLoading: l2,
    isFetchingNextPage: n2,
    hasNextPage,
    fetchNextPage
  } = useInfiniteQuery({
    queryKey: ["search", "jellyseerr", "results", searchQuery],
    queryFn: async ({pageParam}) =>
      jellyseerrApi?.search({
        query: new URLSearchParams(searchQuery || "").toString(),
        page: Number(pageParam),
      }),
    enabled: !!jellyseerrApi && searchQuery.length > 0,
    staleTime: 0,
    initialPageParam: 1,
    getNextPageParam: (lastPage, pages) => {
      const firstPage = pages?.[0]
      const mostRecentPage = lastPage || pages?.[pages?.length - 1]
      const currentPage = mostRecentPage?.page || 1

      return Math.min(currentPage + 1, firstPage?.totalPages || 1)
    },
  });

  useAnimatedReaction(
    () => f1 || f2 || l1 || l2 || n2,
    (isLoading) => {
      if (isLoading) {
        opacity.value = withTiming(1, { duration: 200 });
      } else {
        opacity.value = withTiming(0, { duration: 200 });
      }
    }
  );

  const sortingType = useMemo(
    () => {
      if (!sortType) return;
      switch (Number(JellyseerrSearchSort[sortType])) {
        case JellyseerrSearchSort.VOTE_COUNT_AND_AVERAGE:
          return ["voteCount", "voteAverage"];
        case JellyseerrSearchSort.POPULARITY:
          return ["voteCount", "popularity"]
        default:
          return undefined
      }
    },
    [sortType, order]
  )

  const jellyseerrResults = useMemo(
    () => {
      const lastPage = jellyseerrResultPages?.pages?.[jellyseerrResultPages?.pages?.length - 1]

      if ((lastPage?.page || 0) % 5 !== 0 && hasNextPage && !loadInitialPages) {
        fetchNextPage()
        setLoadInitialPages(lastPage?.page === 4 || (lastPage !== undefined && lastPage.totalPages == lastPage.page))
      }

      return uniqBy(jellyseerrResultPages?.pages?.flatMap?.(page => page?.results || []), "id")
    },
    [jellyseerrResultPages, fetchNextPage, hasNextPage]
  );

  const jellyseerrMovieResults = useMemo(
    () =>
      orderBy(
        jellyseerrResults?.filter((r) => r.mediaType === MediaType.MOVIE) as MovieResult[],
        sortingType || [m => m.title.toLowerCase() == searchQuery.toLowerCase()],
        order || "desc"
      ),
    [jellyseerrResults, sortingType, order]
  );

  const jellyseerrTvResults = useMemo(
    () =>
      orderBy(
        jellyseerrResults?.filter((r) => r.mediaType === MediaType.TV) as TvResult[],
        sortingType || [t => t.name.toLowerCase() == searchQuery.toLowerCase()],
        order || "desc"
      ),
    [jellyseerrResults, sortingType, order]
  );

  const jellyseerrPersonResults = useMemo(
    () =>
      orderBy(
        jellyseerrResults?.filter((r) => r.mediaType === "person") as PersonResult[],
        sortingType || [p => p.name.toLowerCase() == searchQuery.toLowerCase()],
        order || "desc"
      ),
    [jellyseerrResults, sortingType, order]
  );

  if (!searchQuery.length)
    return (
      <View className="flex flex-col">
        <Discover sliders={jellyseerrDiscoverSettings} />
      </View>
    );

  return (
    <View>
      <LoadingSkeleton isLoading={(f1 || f2 || l1 || l2) && !loadInitialPages} />

      {!jellyseerrMovieResults?.length &&
        !jellyseerrTvResults?.length &&
        !jellyseerrPersonResults?.length &&
        !f1 &&
        !f2 &&
        !l1 &&
        !l2 &&
        !loadInitialPages && (
          <View>
            <Text className="text-center text-lg font-bold mt-4">
              {t("search.no_results_found_for")}
            </Text>
            <Text className="text-xs text-purple-600 text-center">
              "{searchQuery}"
            </Text>
          </View>
        )}

      <View className={(f1 || f2 || l1 || l2) && !loadInitialPages ? "opacity-0" : "opacity-100"}>
        <SearchItemWrapper
          header={t("search.request_movies")}
          items={jellyseerrMovieResults}
          renderItem={(item: MovieResult) => (
            <JellyseerrPoster item={item} key={item.id} />
          )}
        />
        <SearchItemWrapper
          header={t("search.request_series")}
          items={jellyseerrTvResults}
          renderItem={(item: TvResult) => (
            <JellyseerrPoster item={item} key={item.id} />
          )}
        />
        <SearchItemWrapper
          header={t("search.actors")}
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
      </View>
    </View>
  );
};

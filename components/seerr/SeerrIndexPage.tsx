import { orderBy, uniqBy } from "lodash";
import type React from "react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { View, type ViewProps } from "react-native";
import {
  useAnimatedReaction,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import Discover from "@/components/seerr/discover/Discover";
import { useSeerr } from "@/hooks/useSeerr";
import { MediaType } from "@/utils/jellyseerr/server/constants/media";
import type {
  MovieResult,
  PersonResult,
  TvResult,
} from "@/utils/jellyseerr/server/models/Search";
import { useReactNavigationQuery } from "@/utils/useReactNavigationQuery";
import { Text } from "../common/Text";
import SeerrPoster from "../posters/SeerrPoster";
import { LoadingSkeleton } from "../search/LoadingSkeleton";
import { SearchItemWrapper } from "../search/SearchItemWrapper";
import PersonPoster from "./PersonPoster";

interface Props extends ViewProps {
  searchQuery: string;
  sortType?: SeerrSearchSort;
  order?: "asc" | "desc";
}

export enum SeerrSearchSort {
  DEFAULT = 0,
  VOTE_COUNT_AND_AVERAGE = 1,
  POPULARITY = 2,
}

export const SeerrIndexPage: React.FC<Props> = ({
  searchQuery,
  sortType,
  order,
}) => {
  const { seerrApi } = useSeerr();
  const opacity = useSharedValue(1);
  const { t } = useTranslation();

  const {
    data: seerrDiscoverSettings,
    isFetching: f1,
    isLoading: l1,
  } = useReactNavigationQuery({
    queryKey: ["search", "seerr", "discoverSettings", searchQuery],
    queryFn: async () => seerrApi?.discoverSettings(),
    enabled: !!seerrApi && searchQuery.length === 0,
  });

  const {
    data: seerrResults,
    isFetching: f2,
    isLoading: l2,
  } = useReactNavigationQuery({
    queryKey: ["search", "seerr", "results", searchQuery],
    queryFn: async () => {
      const params = {
        query: new URLSearchParams(searchQuery || "").toString(),
      };
      return await Promise.all([
        seerrApi?.search({ ...params, page: 1 }),
        seerrApi?.search({ ...params, page: 2 }),
        seerrApi?.search({ ...params, page: 3 }),
        seerrApi?.search({ ...params, page: 4 }),
      ]).then((all) =>
        uniqBy(
          all.flatMap((v) => v?.results || []),
          "id",
        ),
      );
    },
    enabled: !!seerrApi && searchQuery.length > 0,
  });

  useAnimatedReaction(
    () => f1 || f2 || l1 || l2,
    (isLoading) => {
      if (isLoading) {
        opacity.value = withTiming(1, { duration: 200 });
      } else {
        opacity.value = withTiming(0, { duration: 200 });
      }
    },
  );

  const sortingType = useMemo(() => {
    if (!sortType) return;
    switch (Number(SeerrSearchSort[sortType])) {
      case SeerrSearchSort.VOTE_COUNT_AND_AVERAGE:
        return ["voteCount", "voteAverage"];
      case SeerrSearchSort.POPULARITY:
        return ["voteCount", "popularity"];
      default:
        return undefined;
    }
  }, [sortType, order]);

  const seerrMovieResults = useMemo(
    () =>
      orderBy(
        seerrResults?.filter(
          (r) => r.mediaType === MediaType.MOVIE,
        ) as MovieResult[],
        sortingType || [
          (m) => m.title.toLowerCase() === searchQuery.toLowerCase(),
        ],
        order || "desc",
      ),
    [seerrResults, sortingType, order, searchQuery],
  );

  const seerrTvResults = useMemo(
    () =>
      orderBy(
        seerrResults?.filter((r) => r.mediaType === MediaType.TV) as TvResult[],
        sortingType || [
          (t) => t.name.toLowerCase() === searchQuery.toLowerCase(),
        ],
        order || "desc",
      ),
    [seerrResults, sortingType, order, searchQuery],
  );

  const seerrPersonResults = useMemo(
    () =>
      orderBy(
        seerrResults?.filter((r) => r.mediaType === "person") as PersonResult[],
        sortingType || [
          (p) => p.name.toLowerCase() === searchQuery.toLowerCase(),
        ],
        order || "desc",
      ),
    [seerrResults, sortingType, order, searchQuery],
  );

  if (!searchQuery.length)
    return (
      <View className='flex flex-col'>
        <Discover sliders={seerrDiscoverSettings} />
      </View>
    );

  return (
    <View>
      <LoadingSkeleton isLoading={f1 || f2 || l1 || l2} />

      {!seerrMovieResults?.length &&
        !seerrTvResults?.length &&
        !seerrPersonResults?.length &&
        !f1 &&
        !f2 &&
        !l1 &&
        !l2 && (
          <View>
            <Text className='text-center text-lg font-bold mt-4'>
              {t("search.no_results_found_for")}
            </Text>
            <Text className='text-xs text-purple-600 text-center'>
              "{searchQuery}"
            </Text>
          </View>
        )}

      <View className={f1 || f2 || l1 || l2 ? "opacity-0" : "opacity-100"}>
        <SearchItemWrapper
          header={t("search.request_movies")}
          items={seerrMovieResults}
          renderItem={(item: MovieResult) => (
            <SeerrPoster item={item} key={item.id} />
          )}
        />
        <SearchItemWrapper
          header={t("search.request_series")}
          items={seerrTvResults}
          renderItem={(item: TvResult) => (
            <SeerrPoster item={item} key={item.id} />
          )}
        />
        <SearchItemWrapper
          header={t("search.actors")}
          items={seerrPersonResults}
          renderItem={(item: PersonResult) => (
            <PersonPoster
              className='mr-2'
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

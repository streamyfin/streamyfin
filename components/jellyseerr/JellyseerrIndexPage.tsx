import { useJellyseerr } from "@/hooks/useJellyseerr";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { getUserItemData } from "@/utils/jellyfin/user-library/getUserItemData";
import { MediaType } from "@/utils/jellyseerr/server/constants/media";
import {
  MovieResult,
  PersonResult,
  TvResult,
} from "@/utils/jellyseerr/server/models/Search";
import { useReactNavigationQuery } from "@/utils/useReactNavigationQuery";
import { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { useQuery } from "@tanstack/react-query";
import { useAtom } from "jotai";
import { PropsWithChildren, useMemo } from "react";
import { ScrollView, View, ViewProps } from "react-native";
import { Text } from "../common/Text";
import JellyseerrPoster from "../posters/JellyseerrPoster";
import PersonPoster from "./PersonPoster";
import { SearchItemWrapper } from "../search/SearchItemWrapper";
import DiscoverSlide from "./DiscoverSlide";
import { sortBy } from "lodash";
import { Loader } from "../Loader";
import Animated, {
  withTiming,
  useAnimatedStyle,
  withSequence,
  useSharedValue,
  useAnimatedReaction,
} from "react-native-reanimated";
import { LoadingSkeleton } from "../search/LoadingSkeleton";

interface Props extends ViewProps {
  searchQuery: string;
}

export const JellyserrIndexPage: React.FC<Props> = ({ searchQuery }) => {
  const { jellyseerrApi } = useJellyseerr();
  const opacity = useSharedValue(1);

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
    data: jellyseerrResults,
    isFetching: f2,
    isLoading: l2,
  } = useReactNavigationQuery({
    queryKey: ["search", "jellyseerr", "results", searchQuery],
    queryFn: async () => {
      const response = await jellyseerrApi?.search({
        query: new URLSearchParams(searchQuery).toString(),
        page: 1,
        language: "en",
      });
      return response?.results;
    },
    enabled: !!jellyseerrApi && searchQuery.length > 0,
  });

  const animatedStyle = useAnimatedStyle(() => {
    return {
      opacity: opacity.value,
    };
  });

  useAnimatedReaction(
    () => f1 || f2 || l1 || l2,
    (isLoading) => {
      if (isLoading) {
        opacity.value = withTiming(1, { duration: 200 });
      } else {
        opacity.value = withTiming(0, { duration: 200 });
      }
    }
  );

  const jellyseerrMovieResults = useMemo(
    () =>
      jellyseerrResults?.filter(
        (r) => r.mediaType === MediaType.MOVIE
      ) as MovieResult[],
    [jellyseerrResults]
  );

  const jellyseerrTvResults = useMemo(
    () =>
      jellyseerrResults?.filter(
        (r) => r.mediaType === MediaType.TV
      ) as TvResult[],
    [jellyseerrResults]
  );

  const jellyseerrPersonResults = useMemo(
    () =>
      jellyseerrResults?.filter(
        (r) => r.mediaType === "person"
      ) as PersonResult[],
    [jellyseerrResults]
  );

  if (!searchQuery.length)
    return (
      <View className="flex flex-col">
        {sortBy?.(
          jellyseerrDiscoverSettings?.filter((s) => s.enabled),
          "order"
        ).map((slide) => (
          <DiscoverSlide key={slide.id} slide={slide} />
        ))}
      </View>
    );

  return (
    <View>
      <LoadingSkeleton isLoading={f1 || f2 || l1 || l2} />

      {!jellyseerrMovieResults?.length &&
        !jellyseerrTvResults?.length &&
        !jellyseerrPersonResults?.length &&
        !f1 &&
        !f2 &&
        !l1 &&
        !l2 && (
          <View>
            <Text className="text-center text-lg font-bold mt-4">
              No results found for
            </Text>
            <Text className="text-xs text-purple-600 text-center">
              "{searchQuery}"
            </Text>
          </View>
        )}

      <View className={f1 || f2 || l1 || l2 ? "opacity-0" : "opacity-100"}>
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
      </View>
    </View>
  );
};

import { useInfiniteQuery } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { uniqBy } from "lodash";
import { useMemo } from "react";
import { Text } from "@/components/common/Text";
import { textShadowStyle } from "@/components/jellyseerr/discover/GenericSlideCard";
import ParallaxSlideShow from "@/components/jellyseerr/ParallaxSlideShow";
import JellyseerrPoster from "@/components/posters/JellyseerrPoster";
import { Endpoints, useJellyseerr } from "@/hooks/useJellyseerr";
import { DiscoverSliderType } from "@/utils/jellyseerr/server/constants/discover";
import {
  type MovieResult,
  type TvResult,
} from "@/utils/jellyseerr/server/models/Search";

export default function page() {
  const local = useLocalSearchParams();
  const { jellyseerrApi } = useJellyseerr();

  const { genreId, name, type } = local as unknown as {
    genreId: string;
    name: string;
    type: DiscoverSliderType;
  };

  const { data, fetchNextPage, hasNextPage } = useInfiniteQuery({
    queryKey: ["jellyseerr", "company", type, genreId],
    queryFn: async ({ pageParam }) => {
      const params: any = {
        page: Number(pageParam),
        genre: genreId,
      };

      return jellyseerrApi?.discover(
        type === DiscoverSliderType.MOVIE_GENRES
          ? Endpoints.DISCOVER_MOVIES
          : Endpoints.DISCOVER_TV,
        params,
      );
    },
    enabled: !!jellyseerrApi && !!genreId,
    initialPageParam: 1,
    getNextPageParam: (lastPage, pages) =>
      (lastPage?.page || pages?.findLast((p) => p?.results.length)?.page || 1) +
      1,
    staleTime: 0,
  });

  const flatData = useMemo(
    () =>
      uniqBy(
        data?.pages
          ?.filter((p) => p?.results.length)
          .flatMap((p) => p?.results ?? []),
        "id",
      ) ?? [],
    [data],
  );

  const backdrops = useMemo(
    () =>
      jellyseerrApi
        ? flatData.map((r) =>
            jellyseerrApi.imageProxy(
              (r as TvResult | MovieResult).backdropPath,
              "w1920_and_h800_multi_faces",
            ),
          )
        : [],
    [jellyseerrApi, flatData],
  );

  return (
    <ParallaxSlideShow
      data={flatData}
      images={backdrops}
      listHeader=''
      keyExtractor={(item) => item.id.toString()}
      onEndReached={() => {
        if (hasNextPage) {
          fetchNextPage();
        }
      }}
      logo={
        <Text
          className='text-4xl font-bold text-center bottom-1'
          style={{
            ...textShadowStyle.shadow,
            shadowRadius: 10,
          }}
        >
          {name}
        </Text>
      }
      renderItem={(item, _index) => (
        <JellyseerrPoster item={item as MovieResult | TvResult} />
      )}
    />
  );
}

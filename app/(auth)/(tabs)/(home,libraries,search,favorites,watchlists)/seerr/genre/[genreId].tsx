import { useInfiniteQuery } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { uniqBy } from "lodash";
import { useMemo } from "react";
import { Text } from "@/components/common/Text";
import SeerrPoster from "@/components/posters/SeerrPoster";
import { textShadowStyle } from "@/components/seerr/discover/GenericSlideCard";
import ParallaxSlideShow from "@/components/seerr/ParallaxSlideShow";
import { Endpoints, useSeerr } from "@/hooks/useSeerr";
import { DiscoverSliderType } from "@/utils/jellyseerr/server/constants/discover";

export default function GenrePage() {
  const local = useLocalSearchParams();
  const { seerrApi, isSeerrMovieOrTvResult } = useSeerr();

  const { genreId, name, type } = local as unknown as {
    genreId: string;
    name: string;
    type: DiscoverSliderType;
  };

  const { data, fetchNextPage, hasNextPage } = useInfiniteQuery({
    queryKey: ["seerr", "company", type, genreId],
    queryFn: async ({ pageParam }) => {
      const params: any = {
        page: Number(pageParam),
        genre: genreId,
      };

      return seerrApi?.discover(
        type === DiscoverSliderType.MOVIE_GENRES
          ? Endpoints.DISCOVER_MOVIES
          : Endpoints.DISCOVER_TV,
        params,
      );
    },
    enabled: !!seerrApi && !!genreId,
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
          .flatMap(
            (p) => p?.results.filter((r) => isSeerrMovieOrTvResult(r)) ?? [],
          ),
        "id",
      ) ?? [],
    [data],
  );

  const backdrops = useMemo(
    () =>
      seerrApi
        ? flatData.map((r) =>
            seerrApi.imageProxy(r.backdropPath, "w1920_and_h800_multi_faces"),
          )
        : [],
    [seerrApi, flatData],
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
      renderItem={(item, _index) => <SeerrPoster item={item} />}
    />
  );
}

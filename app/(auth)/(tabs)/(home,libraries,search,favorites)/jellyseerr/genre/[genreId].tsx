import {router, useLocalSearchParams, useSegments,} from "expo-router";
import React, {useMemo,} from "react";
import {TouchableOpacity} from "react-native";
import {useInfiniteQuery} from "@tanstack/react-query";
import {Endpoints, useJellyseerr} from "@/hooks/useJellyseerr";
import {Text} from "@/components/common/Text";
import Poster from "@/components/posters/Poster";
import JellyseerrMediaIcon from "@/components/jellyseerr/JellyseerrMediaIcon";
import {DiscoverSliderType} from "@/utils/jellyseerr/server/constants/discover";
import ParallaxSlideShow from "@/components/jellyseerr/ParallaxSlideShow";
import {MovieResult, Results, TvResult} from "@/utils/jellyseerr/server/models/Search";
import {uniqBy} from "lodash";
import {textShadowStyle} from "@/components/jellyseerr/discover/GenericSlideCard";

export default function page() {
  const local = useLocalSearchParams();
  const segments = useSegments();
  const {jellyseerrApi} = useJellyseerr();

  const from = segments[2];
  const {genreId, name, type} = local as unknown as {
    genreId: string,
    name: string,
    type: DiscoverSliderType
  };

  const {data, fetchNextPage, hasNextPage} = useInfiniteQuery({
    queryKey: ["jellyseerr", "company", type, genreId],
    queryFn: async ({pageParam}) => {
      let params: any = {
        page: Number(pageParam),
        genre: genreId
      };

      return jellyseerrApi?.discover(
         type == DiscoverSliderType.MOVIE_GENRES
           ? Endpoints.DISCOVER_MOVIES
           : Endpoints.DISCOVER_TV,
        params
      )
    },
    enabled: !!jellyseerrApi && !!genreId,
    initialPageParam: 1,
    getNextPageParam: (lastPage, pages) =>
      (lastPage?.page || pages?.findLast((p) => p?.results.length)?.page || 1) +
      1,
    staleTime: 0,
  });

  const flatData = useMemo(
    () => uniqBy(data?.pages?.filter((p) => p?.results.length).flatMap((p) => p?.results ?? []), "id")?? [],
    [data]
  );

  const backdrops = useMemo(
    () => jellyseerrApi
      ? flatData.map((r) => jellyseerrApi.imageProxy((r as  TvResult | MovieResult).backdropPath, "w1920_and_h800_multi_faces"))
      : [],
    [jellyseerrApi, flatData]
  );

  const viewDetails = (result: Results) => {
    router.push({
      //@ts-ignore
      pathname: `/(auth)/(tabs)/${from}/jellyseerr/page`,
      //@ts-ignore
      params: {
        ...result,
        mediaTitle: getName(result),
        releaseYear: getYear(result),
        canRequest: "false",
        posterSrc: jellyseerrApi?.imageProxy(
          (result as MovieResult | TvResult).posterPath,
          "w300_and_h450_face"
        ),
      },
    });
  };

  const getName = (result: Results) => {
    return (result as TvResult).name || (result as MovieResult).title
  }

  const getYear = (result: Results) => {
    return new Date((result as TvResult).firstAirDate || (result as MovieResult).releaseDate).getFullYear()
  }

  return (
    <ParallaxSlideShow
      data={flatData}
      images={backdrops}
      listHeader=""
      keyExtractor={(item) => item.id.toString()}
      onEndReached={() => {
        if (hasNextPage) {
          fetchNextPage()
        }
      }}
      logo={
        <Text
          className="text-4xl font-bold text-center bottom-1"
          style={{
            ...textShadowStyle.shadow,
            shadowRadius: 10
          }}>
          {name}
        </Text>
      }
      renderItem={(item, index) => (
        <TouchableOpacity
          className="w-full flex flex-col pr-2"
          onPress={() => viewDetails(item)}
        >
          <Poster
            id={item.id.toString()}
            url={jellyseerrApi?.imageProxy((item as MovieResult | TvResult).posterPath)}
          />
          <JellyseerrMediaIcon
            className="absolute top-1 left-1"
            mediaType={item.mediaType as "movie" | "tv"}
          />
          <Text className="mt-2" numberOfLines={1}>{getName(item)}</Text>
          <Text className="text-xs opacity-50">{getYear(item)}</Text>
        </TouchableOpacity>
      )}
    />
  );
}

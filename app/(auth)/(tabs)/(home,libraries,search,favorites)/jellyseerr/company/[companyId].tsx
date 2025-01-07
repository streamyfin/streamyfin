import {router, useLocalSearchParams, useSegments,} from "expo-router";
import React, {useMemo,} from "react";
import {TouchableOpacity} from "react-native";
import {useInfiniteQuery} from "@tanstack/react-query";
import {Endpoints, useJellyseerr} from "@/hooks/useJellyseerr";
import {Text} from "@/components/common/Text";
import {Image} from "expo-image";
import Poster from "@/components/posters/Poster";
import JellyseerrMediaIcon from "@/components/jellyseerr/JellyseerrMediaIcon";
import {DiscoverSliderType} from "@/utils/jellyseerr/server/constants/discover";
import ParallaxSlideShow from "@/components/jellyseerr/ParallaxSlideShow";
import {MovieResult, Results, TvResult} from "@/utils/jellyseerr/server/models/Search";
import {COMPANY_LOGO_IMAGE_FILTER} from "@/utils/jellyseerr/src/components/Discover/NetworkSlider";
import {uniqBy} from "lodash";
import JellyseerrPoster from "@/components/posters/JellyseerrPoster";

export default function page() {
  const local = useLocalSearchParams();
  const {jellyseerrApi} = useJellyseerr();

  const {companyId, name, image, type} = local as unknown as {
    companyId: string,
    name: string,
    image: string,
    type: DiscoverSliderType
  };

  const {data, fetchNextPage, hasNextPage} = useInfiniteQuery({
    queryKey: ["jellyseerr", "company", type, companyId],
    queryFn: async ({pageParam}) => {
      let params: any = {
        page: Number(pageParam),
      };

      return jellyseerrApi?.discover(
       (
         type == DiscoverSliderType.NETWORKS
           ? Endpoints.DISCOVER_TV_NETWORK
           : Endpoints.DISCOVER_MOVIES_STUDIO
       ) + `/${companyId}`,
        params
      )
    },
    enabled: !!jellyseerrApi && !!companyId,
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
        <Image
          id={companyId}
          key={companyId}
          className="bottom-1 w-1/2"
          source={{
            uri: jellyseerrApi?.imageProxy(image, COMPANY_LOGO_IMAGE_FILTER),
          }}
          cachePolicy={"memory-disk"}
          contentFit="contain"
          style={{
            aspectRatio: "4/3",
          }}
        />
      }
      renderItem={(item, index) =>
        <JellyseerrPoster item={item as MovieResult | TvResult} />
      }
    />
  );
}

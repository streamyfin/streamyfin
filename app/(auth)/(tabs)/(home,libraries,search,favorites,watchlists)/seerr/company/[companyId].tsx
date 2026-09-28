import { useInfiniteQuery } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { uniqBy } from "lodash";
import { useMemo } from "react";
import { Image } from "@/components/common/ServerImage";
import SeerrPoster from "@/components/posters/SeerrPoster";
import ParallaxSlideShow from "@/components/seerr/ParallaxSlideShow";
import { Endpoints, useSeerr } from "@/hooks/useSeerr";
import { COMPANY_LOGO_IMAGE_FILTER } from "@/utils/seerr/data";
import {
  DiscoverSliderType,
  type MovieResult,
  type TvResult,
} from "@/utils/seerr/types";

export default function SeerrCompanyPage() {
  const local = useLocalSearchParams();
  const { seerrApi, isSeerrMovieOrTvResult } = useSeerr();

  const { companyId, image, type } = local as unknown as {
    companyId: string;
    name: string;
    image: string;
    type: DiscoverSliderType; //This gets converted to a string because it's a url param
  };

  const { data, fetchNextPage, hasNextPage, isLoading } = useInfiniteQuery({
    queryKey: ["seerr", "company", type, companyId],
    queryFn: async ({ pageParam }) => {
      const params: any = {
        page: Number(pageParam),
      };
      return seerrApi?.discover(
        `${
          Number(type) === DiscoverSliderType.NETWORKS
            ? Endpoints.DISCOVER_TV_NETWORK
            : Endpoints.DISCOVER_MOVIES_STUDIO
        }/${companyId}`,
        params,
      );
    },
    enabled: !!seerrApi && !!companyId,
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
            seerrApi.imageProxy(
              (r as TvResult | MovieResult).backdropPath,
              "w1920_and_h800_multi_faces",
            ),
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
      isLoading={isLoading}
      logo={
        <Image
          id={companyId}
          key={companyId}
          className='bottom-1 w-1/2'
          source={{
            uri: seerrApi?.imageProxy(image, COMPANY_LOGO_IMAGE_FILTER),
          }}
          cachePolicy={"memory-disk"}
          contentFit='contain'
          style={{
            aspectRatio: "4/3",
          }}
        />
      }
      renderItem={(item, _index) => <SeerrPoster item={item} />}
    />
  );
}

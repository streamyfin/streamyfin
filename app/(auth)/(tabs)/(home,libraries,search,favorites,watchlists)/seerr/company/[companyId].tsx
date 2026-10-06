import { useLocalSearchParams } from "expo-router";
import { useMemo } from "react";
import { Platform } from "react-native";
import { Image } from "@/components/common/ServerImage";
import SeerrPoster from "@/components/posters/SeerrPoster";
import ParallaxSlideShow from "@/components/seerr/ParallaxSlideShow";
import { TVSeerrTitlesHeading } from "@/components/seerr/tv/TVSeerrTitlesHeading";
import { TVSeerrTitlesPage } from "@/components/seerr/tv/TVSeerrTitlesPage";
import { useSeerr } from "@/hooks/useSeerr";
import { useSeerrDiscoverTitles } from "@/hooks/useSeerrDiscoverTitles";
import { COMPANY_LOGO_IMAGE_FILTER } from "@/utils/seerr/data";
import {
  DiscoverSliderType,
  type MovieResult,
  type TvResult,
} from "@/utils/seerr/types";

export default function SeerrCompanyPage() {
  const local = useLocalSearchParams();
  const { companyId, name, image, type } = local as unknown as {
    companyId: string;
    name: string;
    image: string;
    type: DiscoverSliderType;
  };
  // The phone's page scrolls posters no remote can reach.
  if (Platform.isTV)
    return (
      <TVSeerrTitlesPage
        source={{ kind: "company", type, id: companyId }}
        heading={<TVSeerrTitlesHeading text={name} logo={image} />}
      />
    );
  return <MobileCompanyPage />;
}

function MobileCompanyPage() {
  const local = useLocalSearchParams();
  const { seerrApi } = useSeerr();

  const { companyId, image, type } = local as unknown as {
    companyId: string;
    name: string;
    image: string;
    type: DiscoverSliderType; //This gets converted to a string because it's a url param
  };

  const {
    titles: flatData,
    loadMore,
    isLoading,
  } = useSeerrDiscoverTitles({ kind: "company", type, id: companyId });

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
      onEndReached={loadMore}
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

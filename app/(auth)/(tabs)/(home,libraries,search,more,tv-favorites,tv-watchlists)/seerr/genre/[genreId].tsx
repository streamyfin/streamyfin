import { useLocalSearchParams } from "expo-router";
import { useMemo } from "react";
import { Platform } from "react-native";
import { Text } from "@/components/common/Text";
import SeerrPoster from "@/components/posters/SeerrPoster";
import { textShadowStyle } from "@/components/seerr/discover/GenericSlideCard";
import ParallaxSlideShow from "@/components/seerr/ParallaxSlideShow";
import { TVSeerrTitlesHeading } from "@/components/seerr/tv/TVSeerrTitlesHeading";
import { TVSeerrTitlesPage } from "@/components/seerr/tv/TVSeerrTitlesPage";
import { useSeerr } from "@/hooks/useSeerr";
import { useSeerrDiscoverTitles } from "@/hooks/useSeerrDiscoverTitles";
import { DiscoverSliderType } from "@/utils/seerr/types";

export default function SeerrGenrePage() {
  const local = useLocalSearchParams();
  const { genreId, name, type } = local as unknown as {
    genreId: string;
    name: string;
    type: DiscoverSliderType;
  };
  // The phone's page scrolls posters no remote can reach.
  if (Platform.isTV)
    return (
      <TVSeerrTitlesPage
        source={{ kind: "genre", type, id: genreId }}
        heading={<TVSeerrTitlesHeading text={name} />}
      />
    );
  return <MobileGenrePage />;
}

function MobileGenrePage() {
  const local = useLocalSearchParams();
  const { seerrApi } = useSeerr();

  const { genreId, name, type } = local as unknown as {
    genreId: string;
    name: string;
    type: DiscoverSliderType;
  };

  const { titles: flatData, loadMore } = useSeerrDiscoverTitles({
    kind: "genre",
    type,
    id: genreId,
  });

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
      onEndReached={loadMore}
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

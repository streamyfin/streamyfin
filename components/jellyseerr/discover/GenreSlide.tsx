import React, {useCallback} from "react";
import {Endpoints, useJellyseerr,} from "@/hooks/useJellyseerr";
import {TouchableOpacity, ViewProps} from "react-native";
import Slide, {SlideProps} from "@/components/jellyseerr/discover/Slide";
import GenericSlideCard from "@/components/jellyseerr/discover/GenericSlideCard";
import {router, useSegments} from "expo-router";
import {useQuery} from "@tanstack/react-query";
import {DiscoverSliderType} from "@/utils/jellyseerr/server/constants/discover";
import {genreColorMap} from "@/utils/jellyseerr/src/components/Discover/constants";
import {GenreSliderItem} from "@/utils/jellyseerr/server/interfaces/api/discoverInterfaces";

const GenreSlide: React.FC<SlideProps & ViewProps> = ({ slide, ...props }) => {
  const segments = useSegments();
  const { jellyseerrApi } = useJellyseerr();
  const from = segments[2];

  const navigate = useCallback((genre: GenreSliderItem) => router.push({
    pathname: `/(auth)/(tabs)/${from}/jellyseerr/genre/${genre.id}`,
    params: {type: slide.type, name: genre.name}
  }), [slide]);

  const {data, isFetching, isLoading } = useQuery({
    queryKey: ['jellyseerr', 'discover', slide.type, slide.id],
    queryFn: async () => {
      return jellyseerrApi?.getGenreSliders(
        slide.type == DiscoverSliderType.MOVIE_GENRES
          ? Endpoints.MOVIE
          : Endpoints.TV
      )
    },
    enabled: !!jellyseerrApi
  })

  return (
    data && <Slide
      {...props}
      slide={slide}
      data={data}
      keyExtractor={(item) => item.id.toString()}
      renderItem={(item, index) => (
        <TouchableOpacity className="mr-2" onPress={() => navigate(item)}>
          <GenericSlideCard
            className="w-28 rounded-lg overflow-hidden border border-neutral-900"
            id={item.id.toString()}
            title={item.name}
            colors={[]}
            contentFit={"cover"}
            url={jellyseerrApi?.imageProxy(item.backdrops?.[0], `w780_filter(duotone,${genreColorMap[item.id] ?? genreColorMap[0]})`)}
          />
        </TouchableOpacity>
      )}
    />
  );
};

export default GenreSlide;

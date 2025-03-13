import React, { useMemo } from "react";
import DiscoverSlider from "@/utils/jellyseerr/server/entity/DiscoverSlider";
import { DiscoverSliderType } from "@/utils/jellyseerr/server/constants/discover";
import { sortBy } from "lodash";
import MovieTvSlide from "@/components/jellyseerr/discover/MovieTvSlide";
import CompanySlide from "@/components/jellyseerr/discover/CompanySlide";
import { View } from "react-native";
import { networks } from "@/utils/jellyseerr/src/components/Discover/NetworkSlider";
import { studios } from "@/utils/jellyseerr/src/components/Discover/StudioSlider";
import GenreSlide from "@/components/jellyseerr/discover/GenreSlide";
import RecentRequestsSlide from "@/components/jellyseerr/discover/RecentRequestsSlide";

interface Props {
  sliders?: DiscoverSlider[];
}
const Discover: React.FC<Props> = ({ sliders }) => {
  if (!sliders) return;

  const sortedSliders = useMemo(
    () =>
      sortBy(
        sliders.filter((s) => s.enabled),
        "order",
        "asc",
      ),
    [sliders],
  );

  return (
    <View className="flex flex-col space-y-4 mb-8">
      {sortedSliders.map((slide) => {
        switch (slide.type) {
          case DiscoverSliderType.RECENT_REQUESTS:
            return (
              <RecentRequestsSlide
                key={slide.id}
                slide={slide}
                contentContainerStyle={{ paddingBottom: 16 }}
              />
            );
          case DiscoverSliderType.NETWORKS:
            return (
              <CompanySlide key={slide.id} slide={slide} data={networks} />
            );
          case DiscoverSliderType.STUDIOS:
            return <CompanySlide key={slide.id} slide={slide} data={studios} />;
          case DiscoverSliderType.MOVIE_GENRES:
          case DiscoverSliderType.TV_GENRES:
            return <GenreSlide key={slide.id} slide={slide} />;
          case DiscoverSliderType.TRENDING:
          case DiscoverSliderType.POPULAR_MOVIES:
          case DiscoverSliderType.UPCOMING_MOVIES:
          case DiscoverSliderType.POPULAR_TV:
          case DiscoverSliderType.UPCOMING_TV:
            return (
              <MovieTvSlide
                key={slide.id}
                slide={slide}
                contentContainerStyle={{ paddingBottom: 16 }}
              />
            );
        }
      })}
    </View>
  );
};

export default Discover;

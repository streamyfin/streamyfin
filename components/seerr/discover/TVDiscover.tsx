import { sortBy } from "lodash";
import React, { useMemo } from "react";
import { View } from "react-native";
import { networks, studios } from "@/utils/seerr/data";
import type { DiscoverSlider } from "@/utils/seerr/types";
import { DiscoverSliderType } from "@/utils/seerr/types";
import { TVCompanySlide } from "./TVCompanySlide";
import { TVDiscoverSlide } from "./TVDiscoverSlide";
import { TVGenreSlide } from "./TVGenreSlide";
import { TVRecentlyAddedSlide } from "./TVRecentlyAddedSlide";
import { TVRecentRequestsSlide } from "./TVRecentRequestsSlide";

interface TVDiscoverProps {
  sliders?: DiscoverSlider[];
}

/**
 * Seerr's Discover on the TV: every row the server enables, in its order, as
 * the phone draws them (Discover).
 */
export const TVDiscover: React.FC<TVDiscoverProps> = ({ sliders }) => {
  const sortedSliders = useMemo(
    () =>
      sortBy(
        (sliders ?? []).filter((s) => s.enabled),
        "order",
        "asc",
      ),
    [sliders],
  );

  if (!sliders || sortedSliders.length === 0) return null;

  return (
    <View>
      {sortedSliders.map((slide, index) => {
        const isFirstSlide = index === 0;
        switch (slide.type) {
          case DiscoverSliderType.RECENTLY_ADDED:
            return (
              <TVRecentlyAddedSlide
                key={slide.id}
                slide={slide}
                isFirstSlide={isFirstSlide}
              />
            );
          case DiscoverSliderType.RECENT_REQUESTS:
            return (
              <TVRecentRequestsSlide
                key={slide.id}
                slide={slide}
                isFirstSlide={isFirstSlide}
              />
            );
          case DiscoverSliderType.NETWORKS:
            return (
              <TVCompanySlide
                key={slide.id}
                slide={slide}
                data={networks}
                isFirstSlide={isFirstSlide}
              />
            );
          case DiscoverSliderType.STUDIOS:
            return (
              <TVCompanySlide
                key={slide.id}
                slide={slide}
                data={studios}
                isFirstSlide={isFirstSlide}
              />
            );
          case DiscoverSliderType.MOVIE_GENRES:
          case DiscoverSliderType.TV_GENRES:
            return (
              <TVGenreSlide
                key={slide.id}
                slide={slide}
                isFirstSlide={isFirstSlide}
              />
            );
          case DiscoverSliderType.TRENDING:
          case DiscoverSliderType.POPULAR_MOVIES:
          case DiscoverSliderType.UPCOMING_MOVIES:
          case DiscoverSliderType.POPULAR_TV:
          case DiscoverSliderType.UPCOMING_TV:
            return (
              <TVDiscoverSlide
                key={slide.id}
                slide={slide}
                isFirstSlide={isFirstSlide}
              />
            );
          default:
            return null;
        }
      })}
    </View>
  );
};

import React, { useMemo } from "react";
import { View } from "react-native";
import { useSeerr } from "@/hooks/useSeerr";
import { networks, studios } from "@/utils/seerr/data";
import { discoverRows } from "@/utils/seerr/sliders";
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
  const { seerrUser } = useSeerr();
  // Only rows that show: the first one takes the focus, and a row that drew
  // nothing, such as recently added for a plain user, left it on no card.
  const sortedSliders = useMemo(
    () => discoverRows(sliders, seerrUser?.permissions ?? 0),
    [sliders, seerrUser],
  );

  if (sortedSliders.length === 0) return null;

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

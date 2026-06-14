import { sortBy } from "lodash";
import React, { useMemo } from "react";
import { View } from "react-native";
import { DiscoverSliderType } from "@/utils/jellyseerr/server/constants/discover";
import type DiscoverSlider from "@/utils/jellyseerr/server/entity/DiscoverSlider";
import { TVDiscoverSlide } from "./TVDiscoverSlide";

interface TVDiscoverProps {
  sliders?: DiscoverSlider[];
}

// Only show movie/TV slides on TV - skip genres, networks, studios for now
const SUPPORTED_SLIDE_TYPES = [
  DiscoverSliderType.TRENDING,
  DiscoverSliderType.POPULAR_MOVIES,
  DiscoverSliderType.UPCOMING_MOVIES,
  DiscoverSliderType.POPULAR_TV,
  DiscoverSliderType.UPCOMING_TV,
];

export const TVDiscover: React.FC<TVDiscoverProps> = ({ sliders }) => {
  const sortedSliders = useMemo(
    () =>
      sortBy(
        (sliders ?? []).filter(
          (s) => s.enabled && SUPPORTED_SLIDE_TYPES.includes(s.type),
        ),
        "order",
        "asc",
      ),
    [sliders],
  );

  if (!sliders || sortedSliders.length === 0) return null;

  return (
    <View>
      {sortedSliders.map((slide, index) => (
        <TVDiscoverSlide
          key={slide.id}
          slide={slide}
          isFirstSlide={index === 0}
        />
      ))}
    </View>
  );
};

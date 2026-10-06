import type React from "react";
import { useMemo } from "react";
import { View } from "react-native";
import CompanySlide from "@/components/seerr/discover/CompanySlide";
import GenreSlide from "@/components/seerr/discover/GenreSlide";
import MovieTvSlide from "@/components/seerr/discover/MovieTvSlide";
import RecentlyAddedSlide from "@/components/seerr/discover/RecentlyAddedSlide";
import RecentRequestsSlide from "@/components/seerr/discover/RecentRequestsSlide";
import { SEERR_DISCOVER_ROW_GAP } from "@/constants/Seerr";
import { useSeerr } from "@/hooks/useSeerr";
import { networks, studios } from "@/utils/seerr/data";
import { discoverRows } from "@/utils/seerr/sliders";
import type { DiscoverSlider } from "@/utils/seerr/types";
import { DiscoverSliderType } from "@/utils/seerr/types";

interface Props {
  sliders?: DiscoverSlider[];
}

const Discover: React.FC<Props> = ({ sliders }) => {
  const { seerrUser } = useSeerr();
  // The rows the TV shows too (discoverRows).
  const sortedSliders = useMemo(
    () => discoverRows(sliders, seerrUser?.permissions ?? 0),
    [sliders, seerrUser],
  );

  if (!sliders) return null;

  return (
    // One gap between rows, as the home screen spaces its own, set as a style:
    // a release build drops the space-y classes.
    <View style={{ gap: SEERR_DISCOVER_ROW_GAP, marginBottom: 32 }}>
      {sortedSliders.map((slide) => {
        switch (slide.type) {
          case DiscoverSliderType.RECENTLY_ADDED:
            return <RecentlyAddedSlide key={slide.id} slide={slide} />;
          case DiscoverSliderType.RECENT_REQUESTS:
            return <RecentRequestsSlide key={slide.id} slide={slide} />;
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
            return <MovieTvSlide key={slide.id} slide={slide} />;
          default:
            return null;
        }
      })}
    </View>
  );
};

export default Discover;

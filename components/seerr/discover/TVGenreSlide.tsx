import type React from "react";
import { useTranslation } from "react-i18next";
import { TVSeerrRow } from "@/components/seerr/discover/TVSeerrRow";
import { TVSeerrSlideCard } from "@/components/seerr/tv/TVSeerrSlideCard";
import useRouter from "@/hooks/useAppRouter";
import { useSeerr } from "@/hooks/useSeerr";
import { useSeerrGenreSliders } from "@/hooks/useSeerrDiscoverData";
import { genreColorMap } from "@/utils/seerr/data";
import { type DiscoverSlider, DiscoverSliderType } from "@/utils/seerr/types";

/**
 * Seerr's movie or series genres row on the TV, as the phone has it (GenreSlide):
 * each genre over a tinted picture, leading to its titles.
 */
export const TVGenreSlide: React.FC<{
  slide: DiscoverSlider;
  isFirstSlide?: boolean;
}> = ({ slide, isFirstSlide = false }) => {
  const { t } = useTranslation();
  const router = useRouter();
  const { seerrApi } = useSeerr();

  const { data } = useSeerrGenreSliders(slide);

  if (!data?.length) return null;

  return (
    <TVSeerrRow
      title={t(
        `search.${DiscoverSliderType[slide.type].toString().toLowerCase()}`,
      )}
      data={data}
      keyExtractor={(item) => item.id.toString()}
      renderItem={(genre, index) => (
        <TVSeerrSlideCard
          title={genre.name}
          contentFit='cover'
          hasTVPreferredFocus={isFirstSlide && index === 0}
          imageUrl={seerrApi?.imageProxy(
            genre.backdrops?.[0],
            `w780_filter(duotone,${genreColorMap[genre.id] ?? genreColorMap[0]})`,
          )}
          onPress={() =>
            router.push({
              pathname: "/(auth)/(tabs)/(search)/seerr/genre/[genreId]",
              params: {
                genreId: String(genre.id),
                type: slide.type,
                name: genre.name,
              },
            })
          }
        />
      )}
    />
  );
};

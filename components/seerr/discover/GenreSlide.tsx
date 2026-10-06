import { useSegments } from "expo-router";
import type React from "react";
import { useCallback } from "react";
import { TouchableOpacity, type ViewProps } from "react-native";
import GenericSlideCard from "@/components/seerr/discover/GenericSlideCard";
import Slide, { type SlideProps } from "@/components/seerr/discover/Slide";
import useRouter from "@/hooks/useAppRouter";
import { useSeerr } from "@/hooks/useSeerr";
import { useSeerrGenreSliders } from "@/hooks/useSeerrDiscoverData";
import { genreColorMap } from "@/utils/seerr/data";
import type { GenreSliderItem } from "@/utils/seerr/types";

const GenreSlide: React.FC<SlideProps & ViewProps> = ({ slide, ...props }) => {
  const segments = useSegments();
  const { seerrApi } = useSeerr();
  const router = useRouter();
  const from = (segments as string[])[2] || "(home)";

  const navigate = useCallback(
    (genre: GenreSliderItem) =>
      router.push({
        pathname: `/(auth)/(tabs)/${from}/seerr/genre/${genre.id}` as any,
        params: { type: slide.type, name: genre.name },
      }),
    [slide],
  );

  const { data } = useSeerrGenreSliders(slide);

  return (
    data && (
      <Slide
        {...props}
        slide={slide}
        data={data}
        keyExtractor={(item) => item.id.toString()}
        renderItem={(item, _index) => (
          <TouchableOpacity className='mr-2' onPress={() => navigate(item)}>
            <GenericSlideCard
              className='w-28 rounded-lg overflow-hidden border border-neutral-900'
              id={item.id.toString()}
              title={item.name}
              colors={["transparent", "transparent"]}
              contentFit={"cover"}
              url={seerrApi?.imageProxy(
                item.backdrops?.[0],
                `w780_filter(duotone,${
                  genreColorMap[item.id] ?? genreColorMap[0]
                })`,
              )}
            />
          </TouchableOpacity>
        )}
      />
    )
  );
};

export default GenreSlide;

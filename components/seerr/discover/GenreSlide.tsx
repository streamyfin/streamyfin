import { useQuery } from "@tanstack/react-query";
import { useSegments } from "expo-router";
import type React from "react";
import { useCallback } from "react";
import { TouchableOpacity, type ViewProps } from "react-native";
import GenericSlideCard from "@/components/seerr/discover/GenericSlideCard";
import Slide, { type SlideProps } from "@/components/seerr/discover/Slide";
import useRouter from "@/hooks/useAppRouter";
import { Endpoints, useSeerr } from "@/hooks/useSeerr";
import { DiscoverSliderType } from "@/utils/jellyseerr/server/constants/discover";
import type { GenreSliderItem } from "@/utils/jellyseerr/server/interfaces/api/discoverInterfaces";
import { genreColorMap } from "@/utils/jellyseerr/src/components/Discover/constants";

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

  const { data } = useQuery({
    queryKey: ["seerr", "discover", slide.type, slide.id],
    queryFn: async () => {
      return seerrApi?.getGenreSliders(
        slide.type === DiscoverSliderType.MOVIE_GENRES
          ? Endpoints.MOVIE
          : Endpoints.TV,
      );
    },
    enabled: !!seerrApi,
  });

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

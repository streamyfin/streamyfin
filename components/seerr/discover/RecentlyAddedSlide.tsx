import { useQuery } from "@tanstack/react-query";
import type React from "react";
import { View, type ViewProps } from "react-native";
import SeerrPoster from "@/components/posters/SeerrPoster";
import Slide, { type SlideProps } from "@/components/seerr/discover/Slide";
import { useSeerr } from "@/hooks/useSeerr";
import { canSeeRecentlyAdded } from "@/utils/seerr/permissions";
import { type MediaInfo, MediaType } from "@/utils/seerr/types";

/** A title the library gained, as a poster like the other rows draw. */
const RecentlyAddedPoster: React.FC<{ media: MediaInfo }> = ({ media }) => {
  const { seerrApi } = useSeerr();

  const { data: details } = useQuery({
    queryKey: ["seerr", "detail", media.mediaType, media.tmdbId],
    queryFn: async () =>
      media.mediaType === MediaType.MOVIE
        ? seerrApi?.movieDetails(media.tmdbId)
        : seerrApi?.tvDetails(media.tmdbId),
    enabled: !!seerrApi,
  });

  // The poster's own width while its title loads, so the row does not jump.
  if (!details) return <View className='w-28 mr-2' />;
  return <SeerrPoster item={details} />;
};

/**
 * Seerr's recently added row (RecentlyAddedSlider): the twenty titles the
 * library gained last, as posters with their type and their status, for
 * those who manage requests or may see what was added.
 */
const RecentlyAddedSlide: React.FC<SlideProps & ViewProps> = ({
  slide,
  ...props
}) => {
  const { seerrApi, seerrUser } = useSeerr();
  const visible = canSeeRecentlyAdded(seerrUser?.permissions ?? 0);

  const { data: media } = useQuery({
    queryKey: ["seerr", "recently_added"],
    queryFn: async () => seerrApi?.recentlyAdded(),
    enabled: !!seerrApi && visible,
    refetchOnMount: true,
    staleTime: 0,
  });

  if (!visible || !media?.results?.length) return null;

  return (
    <Slide
      {...props}
      slide={slide}
      data={media.results}
      keyExtractor={(item) => item.id.toString()}
      renderItem={(item: MediaInfo) => <RecentlyAddedPoster media={item} />}
    />
  );
};

export default RecentlyAddedSlide;

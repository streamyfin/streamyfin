import { useQuery } from "@tanstack/react-query";
import type React from "react";
import { useTranslation } from "react-i18next";
import { View } from "react-native";
import { TVSeerrRow } from "@/components/seerr/discover/TVSeerrRow";
import { TVSeerrPosterCard } from "@/components/tv/TVSeerrPosterCard";
import { useScaledTVSizes } from "@/constants/TVSizes";
import useRouter from "@/hooks/useAppRouter";
import { useSeerr } from "@/hooks/useSeerr";
import { canSeeRecentlyAdded } from "@/utils/seerr/permissions";
import {
  type DiscoverSlider,
  DiscoverSliderType,
  type MediaInfo,
  MediaType,
} from "@/utils/seerr/types";

/** A title the library gained, as a poster like the other rows draw. */
const TVRecentlyAddedCard: React.FC<{
  media: MediaInfo;
  hasTVPreferredFocus: boolean;
}> = ({ media, hasTVPreferredFocus }) => {
  const { seerrApi } = useSeerr();
  const router = useRouter();
  const sizes = useScaledTVSizes();

  const { data: details } = useQuery({
    queryKey: ["seerr", "detail", media.mediaType, media.tmdbId],
    queryFn: async () =>
      media.mediaType === MediaType.MOVIE
        ? seerrApi?.movieDetails(media.tmdbId)
        : seerrApi?.tvDetails(media.tmdbId),
    enabled: !!seerrApi,
  });

  // The poster's own width while its title loads, so the row does not jump.
  if (!details) return <View style={{ width: sizes.posters.poster }} />;
  return (
    <TVSeerrPosterCard
      item={{ ...details, mediaType: media.mediaType }}
      hasTVPreferredFocus={hasTVPreferredFocus}
      onPress={() =>
        router.push({
          pathname: "/(auth)/(tabs)/(search)/seerr/page",
          params: { id: String(media.tmdbId), mediaType: media.mediaType },
        })
      }
    />
  );
};

/**
 * Seerr's recently added row (RecentlyAddedSlider) on the TV, as the phone
 * has it: the twenty titles the library gained last, for those who manage
 * requests or may see what was added.
 */
export const TVRecentlyAddedSlide: React.FC<{
  slide: DiscoverSlider;
  isFirstSlide?: boolean;
}> = ({ slide, isFirstSlide = false }) => {
  const { t } = useTranslation();
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
    <TVSeerrRow
      title={t(
        `search.${DiscoverSliderType[slide.type].toString().toLowerCase()}`,
      )}
      data={media.results}
      keyExtractor={(item) => item.id.toString()}
      renderItem={(item, index) => (
        <TVRecentlyAddedCard
          media={item}
          hasTVPreferredFocus={isFirstSlide && index === 0}
        />
      )}
    />
  );
};

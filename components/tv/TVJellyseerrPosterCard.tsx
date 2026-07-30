import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import React, { useMemo } from "react";
import { TVPosterCard } from "@/components/tv/TVPosterCard";
import { useJellyseerr } from "@/hooks/useJellyseerr";
import { MediaStatus } from "@/utils/jellyseerr/server/constants/media";
import type {
  MovieResult,
  TvResult,
} from "@/utils/jellyseerr/server/models/Search";

export interface TVJellyseerrPosterCardProps {
  item: MovieResult | TvResult;
  onPress: () => void;
  hasTVPreferredFocus?: boolean;
}

/**
 * Jellyseerr movie/TV poster rendered through the standard TVPosterCard so
 * search and discover share the interface-wide focus style instead of a
 * bespoke glow. The TMDB result is adapted to a minimal BaseItemDto;
 * "already in library" maps to the played state so the standard watched
 * checkmark badge doubles as the in-library indicator.
 */
export const TVJellyseerrPosterCard: React.FC<TVJellyseerrPosterCardProps> = ({
  item,
  onPress,
  hasTVPreferredFocus = false,
}) => {
  const { jellyseerrApi, getTitle, getYear } = useJellyseerr();

  const posterUrl = item.posterPath
    ? jellyseerrApi?.imageProxy(item.posterPath, "w342")
    : undefined;

  const isInLibrary =
    item.mediaInfo?.status === MediaStatus.AVAILABLE ||
    item.mediaInfo?.status === MediaStatus.PARTIALLY_AVAILABLE;

  const dtoItem = useMemo<BaseItemDto>(() => {
    const year = getYear(item);
    return {
      Id: String(item.id),
      Name: getTitle(item),
      Type: item.mediaType === "movie" ? "Movie" : "Series",
      ProductionYear: Number.isNaN(year) ? undefined : year,
      UserData: { Played: isInLibrary },
    };
    // getTitle/getYear are pure helpers recreated by useJellyseerr each
    // render; keying on them would defeat the memo.
  }, [item, isInLibrary]);

  return (
    <TVPosterCard
      item={dtoItem}
      onPress={onPress}
      hasTVPreferredFocus={hasTVPreferredFocus}
      imageUrlGetter={() => posterUrl}
      showProgress={false}
    />
  );
};

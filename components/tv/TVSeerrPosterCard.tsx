import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import React, { useMemo } from "react";
import { TVPosterCard } from "@/components/tv/TVPosterCard";
import { useSeerr } from "@/hooks/useSeerr";
import type { MovieResult, TvResult } from "@/utils/seerr/types";
import { MediaStatus } from "@/utils/seerr/types";

export interface TVSeerrPosterCardProps {
  item: MovieResult | TvResult;
  onPress: () => void;
  hasTVPreferredFocus?: boolean;
}

/**
 * Seerr movie/TV poster rendered through the standard TVPosterCard so
 * search and discover share the interface-wide focus style instead of a
 * bespoke glow. The TMDB result is adapted to a minimal BaseItemDto;
 * "already in library" maps to the played state so the standard watched
 * checkmark badge doubles as the in-library indicator.
 */
export const TVSeerrPosterCard: React.FC<TVSeerrPosterCardProps> = ({
  item,
  onPress,
  hasTVPreferredFocus = false,
}) => {
  const { seerrApi, getTitle, getYear } = useSeerr();

  const posterUrl = item.posterPath
    ? seerrApi?.imageProxy(item.posterPath, "w342")
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
    // getTitle/getYear are pure helpers recreated by useSeerr each
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

import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import React, { useMemo } from "react";
import { TVPosterCard } from "@/components/tv/TVPosterCard";
import { TVSeerrBadges } from "@/components/tv/TVSeerrBadges";
import { useSeerr } from "@/hooks/useSeerr";
import { canRequest } from "@/utils/seerr/requests";
import type {
  MovieDetails,
  MovieResult,
  PersonCreditCast,
  TvDetails,
  TvResult,
} from "@/utils/seerr/types";

export interface TVSeerrPosterCardProps {
  /** A search or Discover result, a person's role, or details with a type. */
  item:
    | MovieResult
    | TvResult
    | PersonCreditCast
    | ((MovieDetails | TvDetails) & { mediaType: "movie" | "tv" });
  onPress: () => void;
  hasTVPreferredFocus?: boolean;
}

/**
 * Seerr movie/TV poster rendered through the standard TVPosterCard so
 * search and discover share the interface-wide focus style instead of a
 * bespoke glow. The TMDB result is adapted to a minimal BaseItemDto, and
 * Seerr's own badges sit over the poster, as on the phone: the type at the
 * top left, where the title stands at the top right.
 */
export const TVSeerrPosterCard: React.FC<TVSeerrPosterCardProps> = ({
  item,
  onPress,
  hasTVPreferredFocus = false,
}) => {
  // One useSeerr for the card, each building its own client: a TV grid
  // mounts every poster at once.
  const { seerrApi, seerrUser, getTitle, getYear } = useSeerr();
  const requestable = !!seerrUser && canRequest(item, seerrUser.permissions);

  const posterUrl = item.posterPath
    ? seerrApi?.imageProxy(item.posterPath, "w342")
    : undefined;

  const dtoItem = useMemo<BaseItemDto>(() => {
    const year = getYear(item);
    return {
      Id: String(item.id),
      Name: getTitle(item),
      Type: item.mediaType === "movie" ? "Movie" : "Series",
      ProductionYear: Number.isNaN(year) ? undefined : year,
    };
    // getTitle/getYear are pure helpers recreated by useSeerr each
    // render; keying on them would defeat the memo.
  }, [item]);

  return (
    <TVPosterCard
      item={dtoItem}
      onPress={onPress}
      hasTVPreferredFocus={hasTVPreferredFocus}
      imageUrlGetter={() => posterUrl}
      showProgress={false}
      showWatchedIndicator={false}
      // One line, as on the phone: a row takes the height of its tallest
      // card, so one long name spread the rows apart.
      titleLines={1}
      overlay={
        <TVSeerrBadges
          mediaType={item.mediaType}
          status={item.mediaInfo?.status}
          canRequest={requestable}
        />
      }
    />
  );
};

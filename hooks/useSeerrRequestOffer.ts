import { useSeerr } from "@/hooks/useSeerr";
import { useSeerrPublicSettings } from "@/hooks/useSeerrPublicSettings";
import { hasPermission, Permission } from "@/utils/seerr/permissions";
import { requestOffer } from "@/utils/seerr/requests";
import type {
  MediaType,
  MovieDetails,
  MovieResult,
  TvDetails,
  TvResult,
} from "@/utils/seerr/types";

/**
 * What a title's page offers to request, the phone's and the TV's from one
 * rule (requestOffer), with the server's settings the season lists read.
 */
export const useSeerrRequestOffer = (
  details: MovieResult | TvResult | MovieDetails | TvDetails | undefined,
  mediaType: MediaType | undefined,
) => {
  const { seerrUser } = useSeerr();
  const publicSettings = useSeerrPublicSettings();
  const specials = publicSettings?.enableSpecialEpisodes === true;
  const partial = publicSettings?.partialRequestsEnabled !== false;
  const permissions = seerrUser?.permissions ?? 0;

  return {
    ...requestOffer(details, mediaType, permissions, { specials }),
    hasAdvancedRequestPermission:
      !!seerrUser &&
      hasPermission(
        [Permission.REQUEST_ADVANCED, Permission.MANAGE_REQUESTS],
        permissions,
        { type: "or" },
      ),
    specials,
    partial,
  };
};

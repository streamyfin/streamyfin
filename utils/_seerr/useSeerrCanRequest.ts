import { useMemo } from "react";
import { useSeerr } from "@/hooks/useSeerr";
import {
  MediaRequestStatus,
  MediaStatus,
  MediaType,
} from "@/utils/jellyseerr/server/constants/media";
import {
  hasPermission,
  Permission,
} from "@/utils/jellyseerr/server/lib/permissions";
import { PersonCreditCast } from "@/utils/jellyseerr/server/models/Person";
import type {
  MovieResult,
  TvResult,
} from "@/utils/jellyseerr/server/models/Search";
import type MediaRequest from "../jellyseerr/server/entity/MediaRequest";
import type { MovieDetails } from "../jellyseerr/server/models/Movie";
import type { TvDetails } from "../jellyseerr/server/models/Tv";

export const useSeerrCanRequest = (
  item?: MovieResult | TvResult | MovieDetails | TvDetails | PersonCreditCast,
) => {
  const { seerrUser } = useSeerr();

  const canRequest = useMemo(() => {
    if (!seerrUser || !item) return false;

    const canNotRequest =
      item?.mediaInfo?.requests?.some(
        (r: MediaRequest) =>
          r.status === MediaRequestStatus.PENDING ||
          r.status === MediaRequestStatus.APPROVED,
      ) ||
      item.mediaInfo?.status === MediaStatus.AVAILABLE ||
      item.mediaInfo?.status === MediaStatus.BLACKLISTED ||
      item.mediaInfo?.status === MediaStatus.PENDING ||
      item.mediaInfo?.status === MediaStatus.PROCESSING;

    if (canNotRequest) return false;

    const userHasPermission = hasPermission(
      [
        Permission.REQUEST,
        item?.mediaInfo?.mediaType === MediaType.MOVIE
          ? Permission.REQUEST_MOVIE
          : Permission.REQUEST_TV,
      ],
      seerrUser.permissions,
      { type: "or" },
    );

    return userHasPermission && !canNotRequest;
  }, [item, seerrUser]);

  const hasAdvancedRequestPermission = useMemo(() => {
    if (!seerrUser) return false;

    return hasPermission(
      [Permission.REQUEST_ADVANCED, Permission.MANAGE_REQUESTS],
      seerrUser.permissions,
      { type: "or" },
    );
  }, [seerrUser]);

  return [canRequest, hasAdvancedRequestPermission];
};

import { useJellyseerr } from "@/hooks/useJellyseerr";
import {
  MediaRequestStatus,
  MediaStatus,
} from "@/utils/jellyseerr/server/constants/media";
import {
  Permission,
  hasPermission,
} from "@/utils/jellyseerr/server/lib/permissions";
import type {
  MovieResult,
  TvResult,
} from "@/utils/jellyseerr/server/models/Search";
import { useMemo } from "react";
import type MediaRequest from "../jellyseerr/server/entity/MediaRequest";
import type { MovieDetails } from "../jellyseerr/server/models/Movie";
import type { TvDetails } from "../jellyseerr/server/models/Tv";

export const useJellyseerrCanRequest = (
  item?: MovieResult | TvResult | MovieDetails | TvDetails,
) => {
  const { jellyseerrUser } = useJellyseerr();

  const canRequest = useMemo(() => {
    if (!jellyseerrUser || !item) return false;

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
        item?.mediaInfo?.mediaType
          ? Permission.REQUEST_MOVIE
          : Permission.REQUEST_TV,
      ],
      jellyseerrUser.permissions,
      { type: "or" },
    );

    return userHasPermission && !canNotRequest;
  }, [item, jellyseerrUser]);

  const hasAdvancedRequestPermission = useMemo(() => {
    if (!jellyseerrUser) return false;

    return hasPermission(
      [Permission.REQUEST_ADVANCED, Permission.MANAGE_REQUESTS],
      jellyseerrUser.permissions,
      { type: "or" },
    );
  }, [jellyseerrUser]);

  return [canRequest, hasAdvancedRequestPermission];
};

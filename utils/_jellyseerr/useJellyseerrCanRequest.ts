import { useJellyseerr } from "@/hooks/useJellyseerr";
import {
  MediaRequestStatus,
  MediaStatus,
} from "@/utils/jellyseerr/server/constants/media";
import {
  hasPermission,
  Permission,
} from "@/utils/jellyseerr/server/lib/permissions";
import { MovieResult, TvResult } from "@/utils/jellyseerr/server/models/Search";
import { useMemo } from "react";
import MediaRequest from "../jellyseerr/server/entity/MediaRequest";
import { MovieDetails } from "../jellyseerr/server/models/Movie";
import { TvDetails } from "../jellyseerr/server/models/Tv";

export const useJellyseerrCanRequest = (
  item?: MovieResult | TvResult | MovieDetails | TvDetails
) => {
  const { jellyseerrUser } = useJellyseerr();

  const canRequest = useMemo(() => {
    if (!jellyseerrUser || !item) return false;

    const canNotRequest =
      item?.mediaInfo?.requests?.some(
        (r: MediaRequest) =>
          r.status == MediaRequestStatus.PENDING ||
          r.status == MediaRequestStatus.APPROVED
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
      { type: "or" }
    );

    return userHasPermission && !canNotRequest;
  }, [item, jellyseerrUser]);

  return canRequest;
};

import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { SEERR_DOWNLOAD_REFRESH_MS } from "@/constants/Seerr";
import { useSeerr } from "@/hooks/useSeerr";
import { useSeerrCanRequest } from "@/hooks/useSeerrCanRequest";
import { useSeerrTitleDetails } from "@/hooks/useSeerrDiscoverData";
import { hasPermission, Permission } from "@/utils/seerr/permissions";
import {
  type RequestBadgeLabel,
  requestBadge,
  requestDownloads,
  seerrAvatarUrl,
} from "@/utils/seerr/requestCard";
import { type MediaRequest, MediaType } from "@/utils/seerr/types";

/**
 * What Seerr's request card shows for a request (RequestCard), for the phone
 * and the TV card alike: the title's details, the request as it stands now,
 * its badge, who asked when the user may see it, the seasons asked for and
 * the images.
 */
export const useSeerrRequestCard = (request: MediaRequest) => {
  const { t } = useTranslation();
  const { seerrApi, seerrUser, getTitle, getYear } = useSeerr();
  const mediaType = request.media?.mediaType ?? request.type;
  const tmdbId = request.media?.tmdbId;

  const { data: details } = useSeerrTitleDetails(mediaType, tmdbId);

  // Asked again while one of its downloads runs, to move the badge along.
  const { data: refreshed } = useQuery({
    queryKey: ["seerr", "requests", mediaType, request.id],
    queryFn: async () => seerrApi?.getRequest(request.id),
    enabled: !!seerrApi,
    refetchInterval: (query) =>
      requestDownloads(query.state.data ?? request).length > 0
        ? SEERR_DOWNLOAD_REFRESH_MS
        : false,
  });

  const current = refreshed ?? request;
  const [canRequest] = useSeerrCanRequest(details);
  const baseUrl = seerrApi?.axios.defaults.baseURL ?? "";
  const seasons = mediaType === MediaType.TV ? (current.seasons ?? []) : [];

  // Written out rather than built, so each key reads as used.
  const badgeText: Record<RequestBadgeLabel, string> = {
    available: t("seerr.request_status.available"),
    partially_available: t("seerr.request_status.partially_available"),
    requested: t("seerr.request_status.requested"),
    processing: t("seerr.request_status.processing"),
    pending: t("seerr.request_status.pending"),
    declined: t("seerr.request_status.declined"),
    failed: t("seerr.request_status.failed"),
    blocklisted: t("seerr.request_status.blocklisted"),
    deleted: t("seerr.request_status.deleted"),
  };

  return {
    details,
    current,
    mediaType,
    canRequest,
    badge: requestBadge(current),
    badgeText,
    avatar: seerrAvatarUrl(baseUrl, current.requestedBy?.avatar),
    // Seerr names the requester to those who may see others' requests.
    showRequester: hasPermission(
      [Permission.MANAGE_REQUESTS, Permission.REQUEST_VIEW],
      seerrUser?.permissions ?? 0,
      { type: "or" },
    ),
    seasonLabels: seasons.map((season) =>
      season.seasonNumber === 0
        ? t("seerr.specials")
        : `${season.seasonNumber}`,
    ),
    title: getTitle(details),
    year: getYear(details),
    posterSrc:
      seerrApi?.imageProxy(details?.posterPath, "w300_and_h450_face") ?? "",
    backdropSrc: details?.backdropPath
      ? seerrApi?.imageProxy(
          details.backdropPath,
          "w1920_and_h800_multi_faces",
          640,
        )
      : undefined,
  };
};

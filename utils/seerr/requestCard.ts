import {
  type DownloadingItem,
  type MediaRequest,
  MediaRequestStatus,
  MediaStatus,
  MediaType,
} from "./types";

/*
 * What Seerr's RequestCard shows about a request, as data: the badge under
 * the title (its AvailabilityBadge, then StatusBadge for the media) and the
 * downloads it follows.
 */

export type RequestBadgeTone = "success" | "primary" | "warning" | "danger";

export type RequestBadgeLabel =
  | "available"
  | "partially_available"
  | "requested"
  | "processing"
  | "pending"
  | "declined"
  | "failed"
  | "blocklisted"
  | "deleted";

export interface RequestBadge {
  tone: RequestBadgeTone;
  label: RequestBadgeLabel;
  /** How far the download is, 0 to 100, while one is under way. */
  progress?: number;
}

/** How far a download is, 0 to 100 (Seerr's calculateDownloadProgress). */
export const downloadProgress = (item: DownloadingItem): number =>
  item.size ? Math.round(((item.size - item.sizeLeft) / item.size) * 100) : 0;

/**
 * A request's downloads: for a series, only those of the seasons it asked
 * for (Seerr's getRequestDownloadStatus).
 */
export const requestDownloads = (request: MediaRequest): DownloadingItem[] => {
  const items =
    (request.is4k
      ? request.media?.downloadStatus4k
      : request.media?.downloadStatus) ?? [];
  const seasons =
    request.type === MediaType.TV
      ? (request.seasons ?? []).map((season) => season.seasonNumber)
      : [];
  if (seasons.length === 0) return items;
  return items.filter(
    (item) => item.episode && seasons.includes(item.episode.seasonNumber),
  );
};

/** The badge Seerr's RequestCard draws for a request, if any. */
export const requestBadge = (
  request: MediaRequest,
): RequestBadge | undefined => {
  const status = request.is4k ? request.media?.status4k : request.media?.status;

  if (request.status === MediaRequestStatus.DECLINED) {
    return { tone: "danger", label: "declined" };
  }
  if (request.status === MediaRequestStatus.FAILED) {
    return { tone: "danger", label: "failed" };
  }
  if (
    request.status === MediaRequestStatus.PENDING &&
    status === MediaStatus.DELETED
  ) {
    return { tone: "warning", label: "pending" };
  }

  const [download] = requestDownloads(request);
  // Seerr names a title whose download is under way "Processing", whatever
  // the library says of it, and draws how far it is behind the name.
  const underWay = (
    tone: RequestBadgeTone,
    label: RequestBadgeLabel,
  ): RequestBadge =>
    download
      ? { tone, label: "processing", progress: downloadProgress(download) }
      : { tone, label };

  switch (status) {
    case MediaStatus.AVAILABLE:
      return underWay("success", "available");
    case MediaStatus.PARTIALLY_AVAILABLE:
      return underWay("success", "partially_available");
    case MediaStatus.PROCESSING:
      return underWay("primary", "requested");
    case MediaStatus.PENDING:
      return { tone: "warning", label: "pending" };
    case MediaStatus.BLOCKLISTED:
      return { tone: "danger", label: "blocklisted" };
    case MediaStatus.DELETED:
      return underWay("danger", "deleted");
    default:
      return undefined;
  }
};

/**
 * A Seerr user's avatar: a path on the Seerr server for a Jellyfin user,
 * served without a session (/avatarproxy), or a full address.
 */
export const seerrAvatarUrl = (
  baseUrl: string,
  avatar: string | null | undefined,
): string | undefined => {
  if (!avatar) return undefined;
  return /^https?:\/\//i.test(avatar) ? avatar : `${baseUrl}${avatar}`;
};

/**
 * Which sides of a scrolling row hide more, so a fade can say so: Seerr's own
 * row scrolls with its scrollbar hidden and nothing to tell it does. A
 * worklet, for the fades to follow the row on the UI thread.
 */
export const overflowEdges = ({
  offset,
  width,
  contentWidth,
}: {
  offset: number;
  width: number;
  contentWidth: number;
}): { start: boolean; end: boolean } => {
  "worklet";
  return {
    start: offset > 1,
    end: offset + width < contentWidth - 1,
  };
};

/**
 * How far left a row slides to show its end, none when it fits or before
 * either width is known. A worklet, for the pan that slides it.
 */
export const slideLimit = ({
  width,
  contentWidth,
}: {
  width: number;
  contentWidth: number;
}): number => {
  "worklet";
  return Math.min(0, width - contentWidth);
};

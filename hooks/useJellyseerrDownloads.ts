import { useQuery } from "@tanstack/react-query";
import { Platform } from "react-native";
import { useJellyseerr } from "@/hooks/useJellyseerr";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import type { MediaType } from "@/utils/jellyseerr/server/constants/media";
import type { RequestResultsResponse } from "@/utils/jellyseerr/server/interfaces/api/requestInterfaces";
import type { DownloadingItem } from "@/utils/jellyseerr/server/lib/downloadtracker";

/**
 * Requests fetched per round-trip. Jellyseerr has no "give me the download
 * queue" endpoint, so the client scans requests and reads `media.downloadStatus`
 * off each one.
 */
const PAGE_SIZE = 100;

/**
 * Pagination cap. Download activity never touches `request.updatedAt`, so no
 * sort can float an in-flight download to the front — the only way not to miss
 * one is to walk pages. Scanning stops as soon as a short page comes back, so
 * the common case (fewer than 100 requests) is a single call.
 */
const MAX_PAGES = 5;

/** Jellyseerr's own download-sync cron runs once a minute. */
const IDLE_POLL_MS = 60_000;
const ACTIVE_POLL_MS = 15_000;

/**
 * Radarr/Sonarr leave finished and failed grabs sitting in the queue
 * indefinitely, so counting them would mean the badge never returns to zero.
 * Everything else — queued, paused, warning, delay — is still in flight and
 * keeps its raw status visible on the card.
 */
const TERMINAL_STATUSES = new Set(["completed", "failed"]);

/**
 * What `DownloadingItem` actually looks like on the wire.
 *
 * The submodule types `estimatedCompletionTime` as a required `Date` and
 * `timeLeft` as a required `string`, but JSON gives an ISO string, `null`
 * (an Invalid Date serialises to null), or no key at all. `EpisodeNumberResult`
 * is not exported from downloadtracker.ts, and the payload is really Sonarr's
 * fuller episode record, so that shape is inlined here.
 */
type DownloadingItemWire = Omit<
  DownloadingItem,
  "estimatedCompletionTime" | "timeLeft" | "episode"
> & {
  estimatedCompletionTime?: string | null;
  timeLeft?: string;
  episode?: {
    seasonNumber?: number;
    episodeNumber?: number;
    title?: string;
  };
};

export interface JellyseerrDownloadEpisode {
  seasonNumber?: number;
  episodeNumber?: number;
  title?: string;
}

export interface JellyseerrDownload {
  /** Stable list key; also the dedupe key. */
  key: string;
  downloadId?: string;
  requestId: number;
  is4k: boolean;
  mediaType: MediaType;
  tmdbId: number;
  /** Radarr/Sonarr release name — not a human-facing media title. */
  releaseTitle: string;
  /** Raw arr queue status, e.g. "downloading", "paused", "warning". */
  status: string;
  size: number;
  sizeLeft: number;
  downloaded: number;
  /** 0-100, clamped and NaN-safe. */
  progress: number;
  timeLeft?: string;
  estimatedCompletionTime: Date | null;
  /** First episode of the grab; a season pack collapses into one row. */
  episode?: JellyseerrDownloadEpisode;
  /** How many queue records collapsed here. >1 means a season pack. */
  episodeCount: number;
  firstEpisodeNumber?: number;
  lastEpisodeNumber?: number;
}

export interface UseJellyseerrDownloadsResult {
  downloads: JellyseerrDownload[];
  count: number;
  isLoading: boolean;
  isError: boolean;
  refetch: () => Promise<unknown>;
  /** Whether the query is allowed to run at all (mobile, configured, online). */
  enabled: boolean;
}

const toDate = (value?: string | null): Date | null => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

/** Widens a collapsed row's episode range as sibling records fold into it. */
const absorbEpisode = (
  row: JellyseerrDownload,
  episode?: JellyseerrDownloadEpisode,
) => {
  row.episodeCount += 1;
  const number = episode?.episodeNumber;
  if (number === undefined) return;
  row.firstEpisodeNumber =
    row.firstEpisodeNumber === undefined
      ? number
      : Math.min(row.firstEpisodeNumber, number);
  row.lastEpisodeNumber =
    row.lastEpisodeNumber === undefined
      ? number
      : Math.max(row.lastEpisodeNumber, number);
};

/**
 * Folds pages of requests into the distinct arr queue entries behind them.
 *
 * Exported so `refetchInterval` and the query function share one definition.
 */
export const flattenActiveDownloads = (
  pages: (RequestResultsResponse | undefined)[],
): JellyseerrDownload[] => {
  const byKey = new Map<string, JellyseerrDownload>();

  for (const page of pages) {
    for (const request of page?.results ?? []) {
      // mediaType and tmdbId are the card's lookup keys for fetching the
      // poster and human title. Without them the row can only ever show the
      // raw release name, so drop it rather than emit one with invalid keys.
      const mediaType = request.media?.mediaType;
      const tmdbId = request.media?.tmdbId;
      if (!mediaType || tmdbId === undefined || tmdbId === null) continue;

      // Mirrors JellyseerrPoster: a 4k request tracks the 4k queue. Cast to the
      // wire shape here — the declared entity type does not survive JSON.
      const items = ((request.is4k
        ? request.media?.downloadStatus4k
        : request.media?.downloadStatus) ??
        []) as unknown as DownloadingItemWire[];

      items.forEach((item, index) => {
        if (TERMINAL_STATUSES.has((item.status ?? "").toLowerCase())) return;

        // Never fall back to "unkeyed": pending-release rows carry no
        // downloadId, and one media row is reachable from several requests, so
        // an unkeyed push would multiply the count. Keying off the media (not
        // the request) is what collapses the two-requests-one-media case.
        const key =
          item.downloadId ||
          `${request.media?.id ?? request.id}:${item.externalId ?? index}:${
            item.title ?? ""
          }`;

        const existing = byKey.get(key);
        if (existing) {
          // Sonarr emits one record per episode of a season pack, all sharing
          // a downloadId — fold them into a range rather than dropping them.
          absorbEpisode(existing, item.episode);
          return;
        }

        const size = item.size ?? 0;
        const sizeLeft = item.sizeLeft ?? 0;
        const downloaded = Math.max(0, size - sizeLeft);

        const row: JellyseerrDownload = {
          key,
          downloadId: item.downloadId,
          requestId: request.id,
          is4k: Boolean(request.is4k),
          mediaType,
          tmdbId,
          releaseTitle: item.title,
          status: item.status,
          size,
          sizeLeft,
          downloaded,
          // size is 0 for freshly grabbed items, before the client reports one.
          progress:
            size > 0
              ? Math.max(0, Math.min(100, (downloaded / size) * 100))
              : 0,
          timeLeft: item.timeLeft,
          estimatedCompletionTime: toDate(item.estimatedCompletionTime),
          episode: item.episode,
          episodeCount: 0,
          firstEpisodeNumber: undefined,
          lastEpisodeNumber: undefined,
        };
        absorbEpisode(row, item.episode);
        byKey.set(key, row);
      });
    }
  }

  return [...byKey.values()];
};

/**
 * Active Radarr/Sonarr downloads as reported by Jellyseerr.
 *
 * Both the header badge and the downloads screen call this; the shared query
 * key means one poll and one timer no matter how many consumers mount.
 */
export const useJellyseerrDownloads = (): UseJellyseerrDownloadsResult => {
  const { jellyseerrApi } = useJellyseerr();
  const { isConnected } = useNetworkStatus();

  // jellyseerrApi is undefined unless the URL, cookies and user are all set,
  // so it is the whole "Jellyseerr is usable" check.
  const enabled = !Platform.isTV && !!jellyseerrApi && isConnected;

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["jellyseerr", "active-downloads"],
    queryFn: async () => {
      const pages: (RequestResultsResponse | undefined)[] = [];
      for (let page = 0; page < MAX_PAGES; page++) {
        const result = await jellyseerrApi?.activeDownloads(
          PAGE_SIZE,
          page * PAGE_SIZE,
        );
        if (!result) break;
        pages.push(result);
        if ((result.results?.length ?? 0) < PAGE_SIZE) break;
      }
      return flattenActiveDownloads(pages);
    },
    enabled,
    // Without a staleTime, every mount of the badge or the screen kicks off
    // another full page walk on top of the poll below.
    staleTime: ACTIVE_POLL_MS,
    // gcTime 0 keeps this out of the MMKV-persisted cache. Without it the app
    // rehydrates a day-old queue on cold start and the badge lights up with
    // downloads that finished long ago.
    gcTime: 0,
    // networkMode is offlineFirst app-wide, so an interval still fires while
    // offline — `enabled` above is what actually stops it.
    refetchInterval: (query) =>
      (query.state.data?.length ?? 0) > 0 ? ACTIVE_POLL_MS : IDLE_POLL_MS,
  });

  const downloads = enabled ? (data ?? []) : [];

  return {
    downloads,
    count: downloads.length,
    isLoading,
    isError,
    refetch,
    enabled,
  };
};

export default useJellyseerrDownloads;

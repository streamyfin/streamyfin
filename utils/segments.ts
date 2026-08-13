import { Api } from "@jellyfin/sdk";
import { MediaSegmentType } from "@jellyfin/sdk/lib/generated-client/models/media-segment-type";
import { getMediaSegmentsApi } from "@jellyfin/sdk/lib/utils/api/media-segments-api";
import { useQuery } from "@tanstack/react-query";
import React from "react";
import { DownloadedItem, MediaTimeSegment } from "@/providers/Downloads/types";
import { getAuthHeaders } from "./jellyfin/jellyfin";

export interface SegmentBuckets {
  introSegments: MediaTimeSegment[];
  creditSegments: MediaTimeSegment[];
  recapSegments: MediaTimeSegment[];
  commercialSegments: MediaTimeSegment[];
  previewSegments: MediaTimeSegment[];
}

// Legacy endpoints (intro-skipper / chapter-credits plugins on pre-10.11 servers)
interface IntroTimestamps {
  IntroStart: number;
  IntroEnd: number;
  Valid: boolean;
}

interface CreditTimestamps {
  Credits: { Start: number; End: number; Valid: boolean };
}

const TICKS_PER_SECOND = 10_000_000;
const ticksToSeconds = (ticks: number): number => ticks / TICKS_PER_SECOND;

const emptyBuckets = (): SegmentBuckets => ({
  introSegments: [],
  creditSegments: [],
  recapSegments: [],
  commercialSegments: [],
  previewSegments: [],
});

export const useSegments = (
  itemId: string,
  isOffline: boolean,
  downloadedFiles: DownloadedItem[] | undefined,
  api: Api | null,
) => {
  const downloadedItem = React.useMemo(
    () => downloadedFiles?.find((d) => d.item.Id === itemId),
    [downloadedFiles, itemId],
  );

  return useQuery({
    queryKey: ["segments", itemId, isOffline],
    queryFn: async () => {
      if (isOffline && downloadedItem) {
        return getSegmentsForItem(downloadedItem);
      }
      if (!api) {
        throw new Error("API client is not available");
      }
      return fetchAndParseSegments(itemId, api);
    },
    enabled: !!itemId && (isOffline ? !!downloadedItem : !!api),
  });
};

export const getSegmentsForItem = (item: DownloadedItem): SegmentBuckets => ({
  introSegments: item.introSegments || [],
  creditSegments: item.creditSegments || [],
  recapSegments: item.recapSegments || [],
  commercialSegments: item.commercialSegments || [],
  previewSegments: item.previewSegments || [],
});

/** Jellyfin 10.11+ unified MediaSegments API. Returns null so the caller can fall back. */
const fetchMediaSegments = async (
  itemId: string,
  api: Api,
): Promise<SegmentBuckets | null> => {
  try {
    const response = await getMediaSegmentsApi(api).getItemSegments({
      itemId,
      includeSegmentTypes: [
        MediaSegmentType.Intro,
        MediaSegmentType.Outro,
        MediaSegmentType.Recap,
        MediaSegmentType.Commercial,
        MediaSegmentType.Preview,
      ],
    });

    const buckets = emptyBuckets();
    for (const segment of response.data.Items ?? []) {
      if (segment.StartTicks == null || segment.EndTicks == null) continue;
      const timeSegment: MediaTimeSegment = {
        startTime: ticksToSeconds(segment.StartTicks),
        endTime: ticksToSeconds(segment.EndTicks),
        text: segment.Type ?? "",
      };

      switch (segment.Type) {
        case MediaSegmentType.Intro:
          buckets.introSegments.push(timeSegment);
          break;
        case MediaSegmentType.Outro:
          buckets.creditSegments.push(timeSegment);
          break;
        case MediaSegmentType.Recap:
          buckets.recapSegments.push(timeSegment);
          break;
        case MediaSegmentType.Commercial:
          buckets.commercialSegments.push(timeSegment);
          break;
        case MediaSegmentType.Preview:
          buckets.previewSegments.push(timeSegment);
          break;
      }
    }

    return buckets;
  } catch (error) {
    // Only fall back when the server genuinely lacks the endpoint. Treating any
    // failure as "pre-10.11" would send a transient 500 or an expired token off
    // to two legacy endpoints that do not exist on a modern server, turning a
    // recoverable error into silently missing segments.
    if (isEndpointUnavailable(error)) return null;
    console.error("[SEGMENTS] MediaSegments request failed", error);
    return emptyBuckets();
  }
};

/** True when the failure means "this server has no such endpoint". */
const isEndpointUnavailable = (error: unknown): boolean => {
  const status = (error as { response?: { status?: number } })?.response
    ?.status;
  return status === 404 || status === 501;
};

/** Pre-10.11 fallback: third-party intro-skipper / chapter-credits plugin endpoints. */
const fetchLegacySegments = async (
  itemId: string,
  api: Api,
): Promise<SegmentBuckets> => {
  const buckets = emptyBuckets();

  const [introRes, creditRes] = await Promise.allSettled([
    api.axiosInstance.get<IntroTimestamps>(
      `${api.basePath}/Episode/${itemId}/IntroTimestamps`,
      { headers: getAuthHeaders(api) },
    ),
    api.axiosInstance.get<CreditTimestamps>(
      `${api.basePath}/Episode/${itemId}/Timestamps`,
      { headers: getAuthHeaders(api) },
    ),
  ]);

  if (introRes.status === "fulfilled" && introRes.value.data.Valid) {
    buckets.introSegments.push({
      startTime: introRes.value.data.IntroStart,
      endTime: introRes.value.data.IntroEnd,
      text: "Intro",
    });
  }

  if (creditRes.status === "fulfilled" && creditRes.value.data.Credits.Valid) {
    buckets.creditSegments.push({
      startTime: creditRes.value.data.Credits.Start,
      endTime: creditRes.value.data.Credits.End,
      text: "Outro",
    });
  }

  return buckets;
};

export const fetchAndParseSegments = async (
  itemId: string,
  api: Api,
): Promise<SegmentBuckets> => {
  const newSegments = await fetchMediaSegments(itemId, api);
  return newSegments ?? fetchLegacySegments(itemId, api);
};

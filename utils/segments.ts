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

/**
 * Display name per segment type, mirroring jellyfin-web's `MediaSegmentType.*`
 * strings. Every player builds its button from these plus
 * `player.segment_skip_prompt` ("Skip {{segment}}"), the same way jellyfin-web
 * composes `MediaSegmentSkipPrompt`, so no player invents its own wording.
 */
export const SEGMENT_NAME_KEY = {
  Intro: "player.segment_intro",
  Outro: "player.segment_outro",
  Recap: "player.segment_recap",
  Commercial: "player.segment_commercial",
  Preview: "player.segment_preview",
} as const satisfies Record<string, string>;

export type SegmentTypeName = keyof typeof SEGMENT_NAME_KEY;

/**
 * Shape returned by the intro-skipper plugin's `GET /Episode/{id}/Timestamps`
 * (https://github.com/intro-skipper/intro-skipper). Times are in seconds from
 * the start of the file, and `Valid` is the plugin's own `End > 0` check.
 *
 * One call covers all five ranges. Recent plugin versions also publish into
 * Jellyfin's MediaSegments API, so this path only matters for servers where
 * that is off or unavailable.
 */
interface LegacySegment {
  Start: number;
  End: number;
  Valid: boolean;
}

interface LegacyTimestamps {
  Introduction?: LegacySegment;
  Credits?: LegacySegment;
  Recap?: LegacySegment;
  Preview?: LegacySegment;
  Commercial?: LegacySegment;
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

  try {
    const { data } = await api.axiosInstance.get<LegacyTimestamps>(
      `${api.basePath}/Episode/${itemId}/Timestamps`,
      { headers: getAuthHeaders(api) },
    );

    const push = (
      segment: LegacySegment | undefined,
      bucket: MediaTimeSegment[],
      text: string,
    ) => {
      if (!segment?.Valid) return;
      bucket.push({
        startTime: segment.Start,
        endTime: segment.End,
        text,
      });
    };

    push(data.Introduction, buckets.introSegments, "Intro");
    push(data.Credits, buckets.creditSegments, "Outro");
    push(data.Recap, buckets.recapSegments, "Recap");
    push(data.Commercial, buckets.commercialSegments, "Commercial");
    push(data.Preview, buckets.previewSegments, "Preview");
  } catch (error) {
    console.error("[SEGMENTS] Legacy timestamps request failed", error);
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

import { Api } from "@jellyfin/sdk";
import { useQuery } from "@tanstack/react-query";
import React from "react";
import { DownloadedItem, MediaTimeSegment } from "@/providers/Downloads/types";
import { getAuthHeaders } from "./jellyfin/jellyfin";

// New Jellyfin 10.11+ Media Segments API types
interface MediaSegmentDto {
  Id: string;
  ItemId: string;
  Type: "Intro" | "Outro" | "Recap" | "Commercial" | "Preview";
  StartTicks: number;
  EndTicks: number;
}

interface MediaSegmentsResponse {
  Items: MediaSegmentDto[];
}

// Legacy API types (for fallback)
interface IntroTimestamps {
  EpisodeId: string;
  HideSkipPromptAt: number;
  IntroEnd: number;
  IntroStart: number;
  ShowSkipPromptAt: number;
  Valid: boolean;
}

interface CreditTimestamps {
  Introduction: {
    Start: number;
    End: number;
    Valid: boolean;
  };
  Credits: {
    Start: number;
    End: number;
    Valid: boolean;
  };
}

const TICKS_PER_SECOND = 10000000;

export const useSegments = (
  itemId: string,
  isOffline: boolean,
  downloadedFiles: DownloadedItem[] | undefined,
  api: Api | null,
) => {
  // Memoize the lookup so the array is only traversed when dependencies change
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
    enabled: isOffline ? !!downloadedItem : !!api,
  });
};

export const getSegmentsForItem = (
  item: DownloadedItem,
): {
  introSegments: MediaTimeSegment[];
  creditSegments: MediaTimeSegment[];
} => {
  return {
    introSegments: item.introSegments || [],
    creditSegments: item.creditSegments || [],
  };
};

/**
 * Converts Jellyfin ticks to seconds
 */
const ticksToSeconds = (ticks: number): number => ticks / TICKS_PER_SECOND;

/**
 * Fetches segments using the new Jellyfin 10.11+ MediaSegments API
 */
const fetchMediaSegments = async (
  itemId: string,
  api: Api,
): Promise<{
  introSegments: MediaTimeSegment[];
  creditSegments: MediaTimeSegment[];
} | null> => {
  try {
    const response = await api.axiosInstance.get<MediaSegmentsResponse>(
      `${api.basePath}/MediaSegments/${itemId}`,
      {
        headers: getAuthHeaders(api),
        params: {
          includeSegmentTypes: ["Intro", "Outro"],
        },
      },
    );

    const introSegments: MediaTimeSegment[] = [];
    const creditSegments: MediaTimeSegment[] = [];

    response.data.Items.forEach((segment) => {
      const timeSegment: MediaTimeSegment = {
        startTime: ticksToSeconds(segment.StartTicks),
        endTime: ticksToSeconds(segment.EndTicks),
        text: segment.Type,
      };

      switch (segment.Type) {
        case "Intro":
          introSegments.push(timeSegment);
          break;
        case "Outro":
          creditSegments.push(timeSegment);
          break;
        // Optionally handle other types like Recap, Commercial, Preview
        default:
          break;
      }
    });

    return { introSegments, creditSegments };
  } catch (_error) {
    // Return null to indicate we should try legacy endpoints
    return null;
  }
};

/**
 * Fetches segments using legacy pre-10.11 endpoints
 */
const fetchLegacySegments = async (
  itemId: string,
  api: Api,
): Promise<{
  introSegments: MediaTimeSegment[];
  creditSegments: MediaTimeSegment[];
}> => {
  const introSegments: MediaTimeSegment[] = [];
  const creditSegments: MediaTimeSegment[] = [];

  try {
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
      introSegments.push({
        startTime: introRes.value.data.IntroStart,
        endTime: introRes.value.data.IntroEnd,
        text: "Intro",
      });
    }

    if (
      creditRes.status === "fulfilled" &&
      creditRes.value.data.Credits.Valid
    ) {
      creditSegments.push({
        startTime: creditRes.value.data.Credits.Start,
        endTime: creditRes.value.data.Credits.End,
        text: "Credits",
      });
    }
  } catch (error) {
    console.error("Failed to fetch legacy segments", error);
  }

  return { introSegments, creditSegments };
};

export const fetchAndParseSegments = async (
  itemId: string,
  api: Api,
): Promise<{
  introSegments: MediaTimeSegment[];
  creditSegments: MediaTimeSegment[];
}> => {
  // Try new API first (Jellyfin 10.11+)
  const newSegments = await fetchMediaSegments(itemId, api);
  if (newSegments) {
    return newSegments;
  }

  // Fallback to legacy endpoints
  return fetchLegacySegments(itemId, api);
};

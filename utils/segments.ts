import { Api } from "@jellyfin/sdk";
import { useQuery } from "@tanstack/react-query";
import { useAtom } from "jotai";
import { useDownload } from "@/providers/DownloadProvider";
import { DownloadedItem, MediaTimeSegment } from "@/providers/Downloads/types";
import { apiAtom } from "@/providers/JellyfinProvider";
import { getAuthHeaders } from "./jellyfin/jellyfin";

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

export const useSegments = (itemId: string, isOffline: boolean) => {
  const [api] = useAtom(apiAtom);
  const { downloadedFiles } = useDownload();
  const downloadedItem = downloadedFiles?.find(
    (d: DownloadedItem) => d.item.Id === itemId,
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
    enabled: !!api,
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

export const fetchAndParseSegments = async (
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
        {
          headers: getAuthHeaders(api),
        },
      ),
      api.axiosInstance.get<CreditTimestamps>(
        `${api.basePath}/Episode/${itemId}/Timestamps`,
        {
          headers: getAuthHeaders(api),
        },
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
    console.error("Failed to fetch segments", error);
  }

  return { introSegments, creditSegments };
};

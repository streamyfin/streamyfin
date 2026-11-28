import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { useQueries } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import {
  DOWNLOAD_DECISION_CONCURRENCY,
  DOWNLOAD_DECISION_STALE_MS,
} from "@/constants/Downloads";
import { markExpectedError } from "@/utils/errors";
import {
  type DownloadDecision,
  getDownloadDecision,
} from "@/utils/jellyfin/media/downloadDecision";
import type { DownloadRequestParams } from "@/utils/jellyfin/media/getStreamUrl";
import { createLimiter } from "@/utils/limitConcurrency";
import { writeToLog } from "@/utils/log";

// Not in the persisted families (utils/queryPersistence.ts): an answer is only
// worth keeping while the user is choosing.
export const DOWNLOAD_DECISION_QUERY_KEY = "downloadDecision";

export type ItemDecision = {
  item: BaseItemDto;
  status: "checking" | "done" | "failed";
  decision?: DownloadDecision;
};

export interface DownloadDecisions {
  items: ItemDecision[];
  total: number;
  checked: number;
  direct: number;
  transcode: number;
  failed: number;
}

// One for the app: two open sheets still share the server's patience.
const limit = createLimiter(DOWNLOAD_DECISION_CONCURRENCY);

/**
 * Asks the server, for each download request, whether it would send the
 * original file or a transcode. Answers are kept per item and choice, so
 * going back to an earlier choice reuses them.
 */
export function useDownloadDecisions(
  requests: DownloadRequestParams[],
  enabled: boolean,
): DownloadDecisions {
  const results = useQueries({
    queries: requests.map((request) => ({
      queryKey: [
        DOWNLOAD_DECISION_QUERY_KEY,
        request.item?.Id,
        request.mediaSourceId,
        request.audioStreamIndex,
        request.subtitleStreamIndex,
        request.maxStreamingBitrate,
        request.audioMode,
      ],
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        limit(() => getDownloadDecision(request, signal), signal).catch(
          (error: unknown) => {
            // Shown as unchecked, and the download still works: an outcome
            // of the server, not an app defect for the global reporting.
            if (!signal.aborted) {
              writeToLog("WARN", "Download decision check failed", {
                status: isAxiosError(error)
                  ? error.response?.status
                  : undefined,
              });
            }
            throw markExpectedError(error);
          },
        ),
      enabled,
      retry: false,
      staleTime: DOWNLOAD_DECISION_STALE_MS,
    })),
  });

  const items: ItemDecision[] = results.map((result, index) => ({
    item: requests[index].item ?? {},
    status: result.isError ? "failed" : result.data ? "done" : "checking",
    decision: result.data,
  }));
  const count = (test: (item: ItemDecision) => boolean) =>
    items.filter(test).length;

  return {
    items,
    total: items.length,
    checked: count((item) => item.status !== "checking"),
    direct: count((item) => item.decision?.kind === "direct"),
    transcode: count((item) => item.decision?.kind === "transcode"),
    failed: count((item) => item.status === "failed"),
  };
}

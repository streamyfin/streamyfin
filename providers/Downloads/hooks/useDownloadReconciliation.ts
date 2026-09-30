import { File, Paths } from "expo-file-system";
import { useEffect } from "react";
import { Platform } from "react-native";
import type { ActiveDownload } from "@/modules";
import BackgroundDownloader from "@/modules/background-downloader";
import { getHeadersForUrl } from "@/utils/customHeaders";
import { logAndCaptureError } from "@/utils/log";
import {
  enqueuePendingDownload,
  finalizePendingDownload,
  getPendingDownload,
  getPendingDownloads,
  type PendingDownload,
  removePendingDownload,
  updatePendingDownload,
} from "../pendingDownloads";
import type { JobStatus } from "../types";

interface UseDownloadReconciliationProps {
  setProcesses: (updater: (prev: JobStatus[]) => JobStatus[]) => void;
  onDataChange?: () => void;
}

// Once per JS runtime, not per provider mount — remounts must not re-enqueue anything.
let hasReconciled = false;

function jobFromRecord(
  record: PendingDownload,
  status: JobStatus["status"],
  native?: ActiveDownload,
): JobStatus {
  return {
    id: record.itemId,
    inputUrl: record.inputUrl,
    item: record.item,
    itemId: record.itemId,
    deviceId: record.deviceId,
    progress: Math.min(
      Math.max(Math.floor((native?.progress ?? 0) * 100), 0),
      99,
    ),
    status,
    timestamp: new Date(),
    mediaSource: record.mediaSource,
    maxBitrate: record.maxBitrate,
    bytesDownloaded: native?.bytesWritten ?? 0,
    estimatedTotalSizeBytes: record.activityMetadata?.estimatedTotalBytes,
    trickPlayData: record.trickPlayData,
    introSegments: record.introSegments,
    creditSegments: record.creditSegments,
    recapSegments: record.recapSegments,
    commercialSegments: record.commercialSegments,
    previewSegments: record.previewSegments,
    audioStreamIndex: record.audioStreamIndex,
    subtitleStreamIndex: record.subtitleStreamIndex,
    isMultiTrack: Boolean(record.multiTrack),
    error: record.error,
  };
}

/**
 * Hands a record back to the native queue, with the headers it has to be sent
 * with. Returns whether the record survived — a failed re-enqueue drops it.
 */
async function reEnqueue(
  record: PendingDownload,
  headers?: Record<string, string>,
): Promise<boolean> {
  try {
    await enqueuePendingDownload(record, headers);
    return true;
  } catch (error) {
    // Dropping the record permanently loses the download without any user
    // signal, so report it.
    logAndCaptureError("Re-enqueueing interrupted download failed", error, {
      itemType: record.item?.Type,
    });
    if (record.multiTrack) {
      updatePendingDownload(record.itemId, {
        status: "error",
        error: error instanceof Error ? error.message : String(error),
      });
    } else {
      removePendingDownload(record.itemId);
    }
    return false;
  }
}

/** Restores a bundle without confusing finished inputs with a published MKV. */
export async function reconcileMultiTrackRecord(
  record: PendingDownload,
  native?: ActiveDownload,
): Promise<JobStatus | undefined> {
  if (!record.multiTrack) {
    throw new Error("Expected a multi-track pending download");
  }
  if (native?.stage === "remuxing" && !native.error) {
    updatePendingDownload(record.itemId, {
      status: "preparing",
      taskId: native.taskId,
    });
    return jobFromRecord(record, "preparing", native);
  }
  if (native?.requiresHeaders) {
    const enqueued = await reEnqueue(
      record,
      getHeadersForUrl(record.inputUrl, {}),
    );
    const status = native.stage === "remuxing" ? "preparing" : "downloading";
    return jobFromRecord(
      getPendingDownload(record.itemId) ?? record,
      enqueued ? status : "error",
      native,
    );
  }
  if (native?.error) {
    updatePendingDownload(record.itemId, {
      status: "error",
      error: native.error,
    });
    return jobFromRecord({ ...record, error: native.error }, "error", native);
  }
  if (native?.state === "running") {
    updatePendingDownload(record.itemId, {
      status: "downloading",
      taskId: native.taskId,
    });
    return jobFromRecord(record, "downloading", native);
  }

  // Native only publishes this path after validating and closing the MKV.
  const file = new File(Paths.document, record.videoFileName);
  if (file.exists && file.size > 0) {
    finalizePendingDownload(record, file.size, true);
    return undefined;
  }
  if (record.status === "error") return jobFromRecord(record, "error", native);
  const enqueued = await reEnqueue(
    record,
    getHeadersForUrl(record.inputUrl, {}),
  );
  return jobFromRecord(
    getPendingDownload(record.itemId) ?? record,
    enqueued ? "queued" : "error",
    native,
  );
}

/**
 * Settles pending download records left behind by a previous JS runtime.
 *
 * The native layer keeps transferring after the app dies and moves the finished file into place on
 * relaunch — but it cannot write the downloads database. On startup each persisted record is
 * matched against reality:
 *
 * - task still running natively → resurrect the UI process; progress events flow again
 * - still queued natively (iOS persists its queue and re-arms it on launch) → resurrect the UI
 *   process as queued; native starts it when its turn comes. Custom proxy headers don't survive
 *   that persistence, so a download that needs them is re-queued with them
 * - never started (`queued`) and native lost it (Android process death) → re-enqueue as a backstop
 * - video file exists → the download finished while JS was dead; finalize it into the database
 * - started but no task and no file → genuinely lost (e.g. force-quit cancels background
 *   transfers); drop the record
 */
export function useDownloadReconciliation({
  setProcesses,
  onDataChange,
}: UseDownloadReconciliationProps) {
  useEffect(() => {
    if (Platform.isTV || hasReconciled) return;
    hasReconciled = true;

    (async () => {
      const pending = getPendingDownloads();
      if (pending.length === 0) return;

      let active: ActiveDownload[] = [];
      try {
        active = await BackgroundDownloader.getActiveDownloads();
      } catch (error) {
        // An empty list here makes the loop below misclassify every
        // in-flight download as lost or completed.
        logAndCaptureError("Querying native downloads failed", error);
        return;
      }
      const nativeByItemId = new Map(
        active
          .filter((download) => download.itemId)
          .map((download) => [download.itemId as string, download]),
      );

      const restored: JobStatus[] = [];

      for (const record of pending) {
        const nativeTask = nativeByItemId.get(record.itemId);

        if (record.multiTrack) {
          const process = await reconcileMultiTrackRecord(record, nativeTask);
          if (process) {
            restored.push(process);
          } else {
            onDataChange?.();
          }
          continue;
        }

        if (nativeTask?.state === "queued") {
          // A queued task hasn't sent its request yet, and the headers it was
          // enqueued with are gone (they must not be written to the App Group
          // container). Behind a gateway it would start and 403, so it is
          // re-armed with them; without headers it can simply carry on.
          const headers = getHeadersForUrl(record.inputUrl, {});
          if (!headers) {
            console.log(
              `[RECONCILE] Still queued natively: ${record.item.Name}`,
            );
            restored.push(jobFromRecord(record, "queued"));
            continue;
          }

          console.log(
            `[RECONCILE] Re-arming queued download with headers: ${record.item.Name}`,
          );
          BackgroundDownloader.cancelQueuedDownload(record.inputUrl);
          if (await reEnqueue(record, headers)) {
            restored.push(jobFromRecord(record, "queued"));
          }
          continue;
        }

        if (nativeTask) {
          console.log(`[RECONCILE] Still downloading: ${record.item.Name}`);
          updatePendingDownload(record.itemId, {
            status: "downloading",
            taskId: nativeTask.taskId,
          });
          restored.push(jobFromRecord(record, "downloading"));
          continue;
        }

        const file = new File(Paths.document, record.videoFileName);
        if (file.exists && (file.size ?? 0) > 0) {
          console.log(
            `[RECONCILE] Completed while app was dead: ${record.item.Name}`,
          );
          finalizePendingDownload(record, file.size ?? 0);
          onDataChange?.();
          continue;
        }

        if (record.status === "queued") {
          // Backstop: native lost the queued item (Android queue dies with the process; on iOS
          // this only fires if the persisted queue failed to restore).
          console.log(`[RECONCILE] Re-enqueueing: ${record.item.Name}`);
          if (await reEnqueue(record, getHeadersForUrl(record.inputUrl, {}))) {
            restored.push(jobFromRecord(record, "queued"));
          }
          continue;
        }

        console.log(`[RECONCILE] Lost download dropped: ${record.item.Name}`);
        removePendingDownload(record.itemId);
      }

      if (restored.length > 0) {
        setProcesses((prev) => {
          const known = new Set(prev.map((process) => process.id));
          return [
            ...prev,
            // A completion event may have finalized (and removed) a record while the native query
            // above was in flight — only restore processes whose record still exists.
            ...restored.filter(
              (process) =>
                !known.has(process.id) && getPendingDownload(process.id),
            ),
          ];
        });
      }
    })();
  }, [setProcesses, onDataChange]);
}

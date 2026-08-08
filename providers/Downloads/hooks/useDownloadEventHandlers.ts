import { File } from "expo-file-system";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import type {
  DownloadCompleteEvent,
  DownloadErrorEvent,
  DownloadProgressEvent,
  DownloadStartedEvent,
} from "@/modules";
import { BackgroundDownloader } from "@/modules";
import {
  getNotificationContent,
  sendDownloadNotification,
} from "../notifications";
import {
  finalizePendingDownload,
  getPendingDownload,
  removePendingDownload,
  updatePendingDownload,
} from "../pendingDownloads";
import type { JobStatus } from "../types";
import { filePathToUri } from "../utils";
import {
  addSpeedDataPoint,
  calculateWeightedSpeed,
  clearSpeedData,
} from "./useDownloadSpeedCalculator";

interface UseDownloadEventHandlersProps {
  processes: JobStatus[];
  updateProcess: (
    processId: string,
    updater: Partial<JobStatus> | ((current: JobStatus) => Partial<JobStatus>),
  ) => void;
  removeProcess: (id: string) => void;
  onSuccess?: () => void;
  onDataChange?: () => void;
}

/**
 * Hook to set up download event listeners (progress, complete, error, started).
 *
 * Events are correlated by the `itemId` native echoes back from the metadata passed at enqueue
 * time — no taskId bookkeeping in JS. Events without an `itemId` are not ours (e.g. AudioStorage
 * downloads, which keep their own taskId map) and are ignored. Completion is finalized from the
 * persisted pending record rather than in-memory state, so it also works when the download was
 * enqueued by a previous app session.
 */
export function useDownloadEventHandlers({
  processes,
  updateProcess,
  removeProcess,
  onSuccess,
  onDataChange,
}: UseDownloadEventHandlersProps) {
  const { t } = useTranslation();

  // Handle download started events
  useEffect(() => {
    const startedSub = BackgroundDownloader.addStartedListener(
      (event: DownloadStartedEvent) => {
        const itemId = event.itemId;
        if (!itemId || !getPendingDownload(itemId)) return;

        updatePendingDownload(itemId, {
          status: "downloading",
          taskId: event.taskId,
        });
        updateProcess(itemId, { status: "downloading", startTime: new Date() });
      },
    );

    return () => startedSub.remove();
  }, [updateProcess]);

  // Track last logged progress per process to avoid spam
  const lastLoggedProgress = useRef<Map<string, number>>(new Map());

  // Handle download progress events
  useEffect(() => {
    const progressSub = BackgroundDownloader.addProgressListener(
      (event: DownloadProgressEvent) => {
        const processId = event.itemId;
        if (!processId) {
          return;
        }

        // Validate event data before processing
        if (
          typeof event.bytesWritten !== "number" ||
          event.bytesWritten < 0 ||
          !Number.isFinite(event.bytesWritten)
        ) {
          return;
        }

        if (
          typeof event.progress !== "number" ||
          event.progress < 0 ||
          event.progress > 1 ||
          !Number.isFinite(event.progress)
        ) {
          return;
        }

        // Add data point and calculate speed (validation happens inside)
        addSpeedDataPoint(processId, event.bytesWritten);
        const speed = calculateWeightedSpeed(processId);

        // Determine if transcoding based on whether server provides total size
        const isTranscoding = !(
          event.totalBytes > 0 && Number.isFinite(event.totalBytes)
        );

        // Calculate total size - use actual from server or estimate from bitrate
        let estimatedTotalBytes: number | undefined;
        if (!isTranscoding) {
          // Server provided total size (direct download)
          estimatedTotalBytes = event.totalBytes;
        } else {
          // Transcoding - estimate from bitrate
          const process = processes.find((p) => p.id === processId);
          if (process?.maxBitrate.value && process.item.RunTimeTicks) {
            const { estimateDownloadSize } = require("@/utils/download");
            estimatedTotalBytes = estimateDownloadSize(
              process.maxBitrate.value,
              process.item.RunTimeTicks,
            );
          }
        }

        // Calculate progress - use native progress if available, otherwise calculate from bytes
        let progress: number;
        if (event.progress > 0) {
          // Server provided total size, use native progress
          progress = Math.min(Math.floor(event.progress * 100), 99);
        } else if (estimatedTotalBytes && event.bytesWritten > 0) {
          // Calculate progress from estimated size
          progress = Math.min(
            Math.floor((event.bytesWritten / estimatedTotalBytes) * 100),
            99,
          );
        } else {
          // No way to calculate progress
          progress = 0;
        }

        // Only log when crossing 10% milestones (not on every update at that milestone)
        const lastProgress = lastLoggedProgress.current.get(processId) ?? -1;
        const progressMilestone = Math.floor(progress / 10) * 10;
        const lastMilestone = Math.floor(lastProgress / 10) * 10;

        // Log when crossing a milestone, or when first hitting 99%
        const shouldLog =
          progressMilestone !== lastMilestone ||
          (progress === 99 && lastProgress < 99);

        if (shouldLog) {
          console.log(
            `[DPL] ${processId.slice(0, 8)}... ${progress}% (${(event.bytesWritten / 1024 / 1024).toFixed(0)}/${estimatedTotalBytes ? (estimatedTotalBytes / 1024 / 1024).toFixed(0) : "?"}MB @ ${speed ? (speed / 1024 / 1024).toFixed(1) : "?"}MB/s)`,
          );
          lastLoggedProgress.current.set(processId, progress);
        }

        // Update state (native layer already throttles events to every 500ms)
        updateProcess(processId, {
          progress,
          bytesDownloaded: event.bytesWritten,
          lastProgressUpdateTime: new Date(),
          speed,
          estimatedTotalSizeBytes: estimatedTotalBytes,
          isTranscoding,
        });
      },
    );

    return () => progressSub.remove();
  }, [updateProcess, processes]);

  // Handle download completion events
  useEffect(() => {
    const completeSub = BackgroundDownloader.addCompleteListener(
      async (event: DownloadCompleteEvent) => {
        const itemId = event.itemId;
        if (!itemId) return;

        const record = getPendingDownload(itemId);
        if (!record) return;

        try {
          const videoFile = new File(filePathToUri(event.filePath));
          const videoFileSize = videoFile.info().size || 0;

          console.log(
            `[COMPLETE] Video download complete (${videoFileSize} bytes) for ${record.item.Name}`,
          );

          // In-memory process may carry a live isTranscoding signal derived from progress events;
          // finalize falls back to the media source when it is gone (e.g. after a relaunch).
          const process = processes.find((p) => p.id === itemId);
          finalizePendingDownload(
            record,
            videoFileSize,
            process?.isTranscoding,
          );

          updateProcess(itemId, {
            status: "completed",
            progress: 100,
          });

          const notificationContent = getNotificationContent(
            record.item,
            true,
            t,
          );
          await sendDownloadNotification(
            notificationContent.title,
            notificationContent.body,
          );

          onSuccess?.();
          onDataChange?.();

          // Clean up speed data when download completes
          clearSpeedData(itemId);

          // Remove process after short delay
          setTimeout(() => {
            removeProcess(itemId);
          }, 2000);
        } catch (error) {
          console.error("Error handling download completion:", error);
          removePendingDownload(itemId);
          updateProcess(itemId, { status: "error" });
          clearSpeedData(itemId);
          removeProcess(itemId);
        }
      },
    );

    return () => completeSub.remove();
  }, [processes, updateProcess, removeProcess, onSuccess, onDataChange, t]);

  // Handle download error events
  useEffect(() => {
    const errorSub = BackgroundDownloader.addErrorListener(
      async (event: DownloadErrorEvent) => {
        const itemId = event.itemId;
        if (!itemId) return;

        const record = getPendingDownload(itemId);
        if (!record) return;

        console.error(`Download error for ${itemId}:`, event.error);

        removePendingDownload(itemId);
        updateProcess(itemId, { status: "error" });

        // Clean up speed data
        clearSpeedData(itemId);

        const notificationContent = getNotificationContent(
          record.item,
          false,
          t,
        );
        await sendDownloadNotification(
          notificationContent.title,
          notificationContent.body,
        );

        // Remove process after short delay
        setTimeout(() => {
          removeProcess(itemId);
        }, 3000);
      },
    );

    return () => errorSub.remove();
  }, [updateProcess, removeProcess, t]);
}

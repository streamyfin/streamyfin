import type { Api } from "@jellyfin/sdk";
import { File } from "expo-file-system";
import type { MutableRefObject } from "react";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import type {
  DownloadCompleteEvent,
  DownloadErrorEvent,
  DownloadProgressEvent,
  DownloadStartedEvent,
} from "@/modules";
import { BackgroundDownloader } from "@/modules";
import { addDownloadedItem } from "../database";
import {
  getNotificationContent,
  sendDownloadNotification,
} from "../notifications";
import type { DownloadedItem, JobStatus } from "../types";
import { filePathToUri, generateFilename } from "../utils";
import {
  addSpeedDataPoint,
  calculateWeightedSpeed,
  clearSpeedData,
} from "./useDownloadSpeedCalculator";

interface UseDownloadEventHandlersProps {
  taskMapRef: MutableRefObject<Map<number | string, string>>;
  processes: JobStatus[];
  updateProcess: (
    processId: string,
    updater: Partial<JobStatus> | ((current: JobStatus) => Partial<JobStatus>),
  ) => void;
  removeProcess: (id: string) => void;
  onSuccess?: () => void;
  onDataChange?: () => void;
  api?: Api;
}

/**
 * Hook to set up download event listeners (progress, complete, error, started)
 */
export function useDownloadEventHandlers({
  taskMapRef,
  processes,
  updateProcess,
  removeProcess,
  onSuccess,
  onDataChange,
  api,
}: UseDownloadEventHandlersProps) {
  const { t } = useTranslation();

  // Handle download started events
  useEffect(() => {
    const startedSub = BackgroundDownloader.addStartedListener(
      (event: DownloadStartedEvent) => {
        let processId = taskMapRef.current.get(event.taskId);

        // If no mapping exists, find by URL (for queued downloads)
        if (!processId && event.url) {
          // Check if we have a URL mapping (queued download)
          const urlKey = event.url;
          processId = taskMapRef.current.get(urlKey);

          if (!processId) {
            // Fallback: search by matching URL in processes
            const matchingProcess = processes.find(
              (p) => p.inputUrl === event.url,
            );
            if (matchingProcess) {
              processId = matchingProcess.id;
            }
          }

          if (processId) {
            // Create taskId mapping and remove URL mapping
            taskMapRef.current.set(event.taskId, processId);
            taskMapRef.current.delete(urlKey);
            console.log(
              `[DPL] Mapped queued download: taskId=${event.taskId} to processId=${processId.slice(0, 8)}...`,
            );
          }
        }

        if (processId) {
          updateProcess(processId, { startTime: new Date() });
        } else {
          console.warn(
            `[DPL] Started event for unknown download: taskId=${event.taskId}, url=${event.url}`,
          );
        }
      },
    );

    return () => startedSub.remove();
  }, [taskMapRef, updateProcess, processes]);

  // Track last logged progress per process to avoid spam
  const lastLoggedProgress = useRef<Map<string, number>>(new Map());

  // Handle download progress events
  useEffect(() => {
    const progressSub = BackgroundDownloader.addProgressListener(
      (event: DownloadProgressEvent) => {
        const processId = taskMapRef.current.get(event.taskId);
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
          console.log(
            `[DPL] Transcoding detected, looking for process ${processId}, found:`,
            process ? "yes" : "no",
          );
          if (process) {
            console.log(`[DPL] Process bitrate:`, {
              key: process.maxBitrate.key,
              value: process.maxBitrate.value,
              runTimeTicks: process.item.RunTimeTicks,
            });
            if (process.maxBitrate.value && process.item.RunTimeTicks) {
              const { estimateDownloadSize } = require("@/utils/download");
              estimatedTotalBytes = estimateDownloadSize(
                process.maxBitrate.value,
                process.item.RunTimeTicks,
              );
              console.log(
                `[DPL] Calculated estimatedTotalBytes:`,
                estimatedTotalBytes,
              );
            } else {
              console.log(
                `[DPL] Cannot estimate size - bitrate.value or RunTimeTicks missing`,
              );
            }
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
  }, [taskMapRef, updateProcess, processes]);

  // Handle download completion events
  useEffect(() => {
    const completeSub = BackgroundDownloader.addCompleteListener(
      async (event: DownloadCompleteEvent) => {
        const processId = taskMapRef.current.get(event.taskId);
        if (!processId) return;

        const process = processes.find((p) => p.id === processId);
        if (!process) return;

        try {
          const {
            item,
            mediaSource,
            trickPlayData,
            introSegments,
            creditSegments,
          } = process;
          const videoFile = new File(filePathToUri(event.filePath));
          const fileInfo = videoFile.info();
          const videoFileSize = fileInfo.size || 0;
          const filename = generateFilename(item);

          console.log(
            `[COMPLETE] Video download complete (${videoFileSize} bytes) for ${item.Name}`,
          );
          console.log(
            `[COMPLETE] Using pre-downloaded assets: trickplay=${!!trickPlayData}, intro=${!!introSegments}, credits=${!!creditSegments}`,
          );

          const downloadedItem: DownloadedItem = {
            item,
            mediaSource,
            videoFilePath: filePathToUri(event.filePath),
            videoFileSize,
            videoFileName: `${filename}.mp4`,
            trickPlayData,
            introSegments,
            creditSegments,
            userData: {
              audioStreamIndex: 0,
              subtitleStreamIndex: 0,
            },
          };

          addDownloadedItem(downloadedItem);

          updateProcess(processId, {
            status: "completed",
            progress: 100,
          });

          const notificationContent = getNotificationContent(item, true, t);
          await sendDownloadNotification(
            notificationContent.title,
            notificationContent.body,
          );

          onSuccess?.();
          onDataChange?.();

          // Clean up speed data when download completes
          clearSpeedData(processId);

          // Remove process after short delay
          setTimeout(() => {
            removeProcess(processId);
          }, 2000);
        } catch (error) {
          console.error("Error handling download completion:", error);
          updateProcess(processId, { status: "error" });
          clearSpeedData(processId);
          removeProcess(processId);
        }
      },
    );

    return () => completeSub.remove();
  }, [
    taskMapRef,
    processes,
    updateProcess,
    removeProcess,
    onSuccess,
    onDataChange,
    api,
    t,
  ]);

  // Handle download error events
  useEffect(() => {
    const errorSub = BackgroundDownloader.addErrorListener(
      async (event: DownloadErrorEvent) => {
        const processId = taskMapRef.current.get(event.taskId);
        if (!processId) return;

        const process = processes.find((p) => p.id === processId);
        if (!process) return;

        console.error(`Download error for ${processId}:`, event.error);

        updateProcess(processId, { status: "error" });

        // Clean up speed data
        clearSpeedData(processId);

        const notificationContent = getNotificationContent(
          process.item,
          false,
          t,
        );
        await sendDownloadNotification(
          notificationContent.title,
          notificationContent.body,
        );

        // Remove process after short delay
        setTimeout(() => {
          removeProcess(processId);
        }, 3000);
      },
    );

    return () => errorSub.remove();
  }, [taskMapRef, processes, updateProcess, removeProcess, t]);
}

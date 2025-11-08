import type { Api } from "@jellyfin/sdk";
import { File } from "expo-file-system";
import type { MutableRefObject } from "react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner-native";
import useImageStorage from "@/hooks/useImageStorage";
import type {
  DownloadCompleteEvent,
  DownloadErrorEvent,
  DownloadProgressEvent,
  DownloadStartedEvent,
} from "@/modules";
import { BackgroundDownloader } from "@/modules";
import useDownloadHelper from "@/utils/download";
import { downloadAdditionalAssets } from "../additionalDownloads";
import { addDownloadedItem } from "../database";
import {
  getNotificationContent,
  sendDownloadNotification,
} from "../notifications";
import type {
  DownloadedItem,
  JobStatus,
  MediaTimeSegment,
  TrickPlayData,
} from "../types";
import { generateFilename } from "../utils";
import {
  addSpeedDataPoint,
  calculateWeightedSpeed,
  clearSpeedData,
} from "./useDownloadSpeedCalculator";

interface UseDownloadEventHandlersProps {
  taskMapRef: MutableRefObject<Map<number, string>>;
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
  const { saveSeriesPrimaryImage } = useDownloadHelper();
  const { saveImage } = useImageStorage();

  // Handle download started events
  useEffect(() => {
    console.log("[DPL] Setting up started listener");

    const startedSub = BackgroundDownloader.addStartedListener(
      (event: DownloadStartedEvent) => {
        console.log("[DPL] Download started event received:", event);
      },
    );

    return () => {
      console.log("[DPL] Removing started listener");
      startedSub.remove();
    };
  }, []);

  // Handle download progress events
  useEffect(() => {
    console.log("[DPL] Setting up progress listener");

    const progressSub = BackgroundDownloader.addProgressListener(
      (event: DownloadProgressEvent) => {
        console.log("[DPL] Progress event received:", {
          taskId: event.taskId,
          progress: event.progress,
          bytesWritten: event.bytesWritten,
          totalBytes: event.totalBytes,
          taskMapSize: taskMapRef.current.size,
          taskMapKeys: Array.from(taskMapRef.current.keys()),
        });

        const processId = taskMapRef.current.get(event.taskId);
        if (!processId) {
          console.log(
            `[DPL] Progress event for unknown taskId: ${event.taskId}`,
            event,
          );
          return;
        }

        // Validate event data before processing
        if (
          typeof event.bytesWritten !== "number" ||
          event.bytesWritten < 0 ||
          !Number.isFinite(event.bytesWritten)
        ) {
          console.warn(
            `[DPL] Invalid bytesWritten for taskId ${event.taskId}: ${event.bytesWritten}`,
          );
          return;
        }

        if (
          typeof event.progress !== "number" ||
          event.progress < 0 ||
          event.progress > 1 ||
          !Number.isFinite(event.progress)
        ) {
          console.warn(
            `[DPL] Invalid progress for taskId ${event.taskId}: ${event.progress}`,
          );
          return;
        }

        const progress = Math.min(
          Math.floor(event.progress * 100),
          99, // Cap at 99% until completion
        );

        // Add data point and calculate speed (validation happens inside)
        addSpeedDataPoint(processId, event.bytesWritten);
        const speed = calculateWeightedSpeed(processId);

        console.log(
          `[DPL] Progress update for processId: ${processId}, taskId: ${event.taskId}, progress: ${progress}%, bytesWritten: ${event.bytesWritten}, speed: ${speed ? (speed / 1024 / 1024).toFixed(2) : "N/A"} MB/s`,
        );

        updateProcess(processId, {
          progress,
          bytesDownloaded: event.bytesWritten,
          lastProgressUpdateTime: new Date(),
          speed,
          estimatedTotalSizeBytes:
            event.totalBytes > 0 && Number.isFinite(event.totalBytes)
              ? event.totalBytes
              : undefined,
        });
      },
    );

    return () => {
      console.log("[DPL] Removing progress listener");
      progressSub.remove();
    };
  }, [taskMapRef, updateProcess]);

  // Handle download completion events
  useEffect(() => {
    const completeSub = BackgroundDownloader.addCompleteListener(
      async (event: DownloadCompleteEvent) => {
        const processId = taskMapRef.current.get(event.taskId);
        if (!processId) return;

        const process = processes.find((p) => p.id === processId);
        if (!process) return;

        try {
          const { item, mediaSource } = process;
          const videoFile = new File("", event.filePath);
          const fileInfo = videoFile.info();
          const videoFileSize = fileInfo.size || 0;
          const filename = generateFilename(item);

          console.log(
            `[COMPLETE] Video download complete (${videoFileSize} bytes), starting additional downloads for ${item.Name}`,
          );

          // Download additional assets (trickplay, subtitles, cover images, segments)
          let trickPlayData: TrickPlayData | undefined;
          let updatedMediaSource = mediaSource;
          let introSegments: MediaTimeSegment[] | undefined;
          let creditSegments: MediaTimeSegment[] | undefined;

          if (api) {
            const additionalAssets = await downloadAdditionalAssets({
              item,
              mediaSource,
              api,
              saveImageFn: saveImage,
              saveSeriesImageFn: saveSeriesPrimaryImage,
            });

            trickPlayData = additionalAssets.trickPlayData;
            updatedMediaSource = additionalAssets.updatedMediaSource;
            introSegments = additionalAssets.introSegments;
            creditSegments = additionalAssets.creditSegments;
          } else {
            console.warn(
              "[COMPLETE] API not available, skipping additional downloads",
            );
          }

          const downloadedItem: DownloadedItem = {
            item,
            mediaSource: updatedMediaSource,
            videoFilePath: event.filePath,
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

          toast.success(
            t("home.downloads.toasts.download_completed_for_item", {
              item: item.Name,
            }),
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
    saveImage,
    saveSeriesPrimaryImage,
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

        toast.error(
          t("home.downloads.toasts.download_failed_for_item", {
            item: process.item.Name,
          }),
          {
            description: event.error,
          },
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

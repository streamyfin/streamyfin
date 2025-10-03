import { File } from "expo-file-system";
import type { MutableRefObject } from "react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner-native";
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
import { generateFilename } from "../utils";

interface UseDownloadEventHandlersProps {
  taskMapRef: MutableRefObject<Map<number, string>>;
  processes: JobStatus[];
  updateProcess: (
    processId: string,
    updater: Partial<JobStatus> | ((current: JobStatus) => Partial<JobStatus>),
  ) => void;
  removeProcess: (id: string) => void;
  onSuccess?: () => void;
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
}: UseDownloadEventHandlersProps) {
  const { t } = useTranslation();

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

        const progress = Math.min(
          Math.floor(event.progress * 100),
          99, // Cap at 99% until completion
        );

        console.log(
          `[DPL] Progress update for processId: ${processId}, taskId: ${event.taskId}, progress: ${progress}%, bytesWritten: ${event.bytesWritten}`,
        );

        updateProcess(processId, {
          progress,
          bytesDownloaded: event.bytesWritten,
          lastProgressUpdateTime: new Date(),
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
          const videoFileSize = videoFile.size || 0;
          const filename = generateFilename(item);

          const downloadedItem: DownloadedItem = {
            item,
            mediaSource,
            videoFilePath: event.filePath,
            videoFileSize,
            videoFileName: `${filename}.mp4`,
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

          // Remove process after short delay
          setTimeout(() => {
            removeProcess(processId);
          }, 2000);
        } catch (error) {
          console.error("Error handling download completion:", error);
          updateProcess(processId, { status: "error" });
          removeProcess(processId);
        }
      },
    );

    return () => completeSub.remove();
  }, [taskMapRef, processes, updateProcess, removeProcess, onSuccess, t]);

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

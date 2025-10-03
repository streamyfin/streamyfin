import type {
  BaseItemDto,
  MediaSourceInfo,
} from "@jellyfin/sdk/lib/generated-client/models";
import { File, Paths } from "expo-file-system";
import type { MutableRefObject } from "react";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner-native";
import type { Bitrate } from "@/components/BitrateSelector";
import useImageStorage from "@/hooks/useImageStorage";
import { BackgroundDownloader } from "@/modules";
import { getOrSetDeviceId } from "@/utils/device";
import useDownloadHelper from "@/utils/download";
import { getItemImage } from "@/utils/getItemImage";
import {
  clearAllDownloadedItems,
  getAllDownloadedItems,
  removeDownloadedItem,
} from "../database";
import {
  calculateTotalDownloadedSize,
  deleteAllAssociatedFiles,
} from "../fileOperations";
import type { JobStatus } from "../types";
import { generateFilename, uriToFilePath } from "../utils";

interface UseDownloadOperationsProps {
  taskMapRef: MutableRefObject<Map<number, string>>;
  processes: JobStatus[];
  setProcesses: (updater: (prev: JobStatus[]) => JobStatus[]) => void;
  removeProcess: (id: string) => void;
  api: any;
  authHeader?: string;
}

/**
 * Hook providing download operation functions (start, cancel, delete)
 */
export function useDownloadOperations({
  taskMapRef,
  processes,
  setProcesses,
  removeProcess,
  api,
  authHeader,
}: UseDownloadOperationsProps) {
  const { t } = useTranslation();
  const { saveSeriesPrimaryImage } = useDownloadHelper();
  const { saveImage } = useImageStorage();

  const startBackgroundDownload = useCallback(
    async (
      url: string,
      item: BaseItemDto,
      mediaSource: MediaSourceInfo,
      maxBitrate: Bitrate,
    ) => {
      if (!api || !item.Id || !authHeader) {
        console.warn("startBackgroundDownload ~ Missing required params");
        throw new Error("startBackgroundDownload ~ Missing required params");
      }

      try {
        const deviceId = getOrSetDeviceId();
        const processId = item.Id;

        // Check if already downloading
        const existingProcess = processes.find((p) => p.id === processId);
        if (existingProcess) {
          toast.info(
            t("home.downloads.toasts.item_already_downloading", {
              item: item.Name,
            }),
          );
          return;
        }

        // Pre-download cover images before starting the video download
        console.log(`[DOWNLOAD] Pre-downloading cover images for ${item.Name}`);
        await saveSeriesPrimaryImage(item);
        const itemImage = getItemImage({
          item,
          api,
          variant: "Primary",
          quality: 90,
          width: 500,
        });
        await saveImage(item.Id, itemImage?.uri);

        // Create job status
        const jobStatus: JobStatus = {
          id: processId,
          inputUrl: url,
          item,
          itemId: item.Id,
          deviceId,
          progress: 0,
          status: "downloading",
          timestamp: new Date(),
          mediaSource,
          maxBitrate,
          bytesDownloaded: 0,
        };

        // Add to processes
        setProcesses((prev) => [...prev, jobStatus]);

        // Generate destination path
        const filename = generateFilename(item);
        const videoFile = new File(Paths.document, `${filename}.mp4`);
        const destinationPath = uriToFilePath(videoFile.uri);

        console.log(`[DOWNLOAD] Starting download for ${filename}`);
        console.log(`[DOWNLOAD] URL: ${url}`);
        console.log(`[DOWNLOAD] Destination: ${destinationPath}`);

        // Start the download (URL already contains api_key)
        const taskId = await BackgroundDownloader.startDownload(
          url,
          destinationPath,
        );

        console.log(
          `[DOWNLOAD] Got taskId: ${taskId} for processId: ${processId}`,
        );

        // Map task ID to process ID
        taskMapRef.current.set(taskId, processId);

        console.log(`[DOWNLOAD] TaskMap now contains:`, {
          size: taskMapRef.current.size,
          entries: Array.from(taskMapRef.current.entries()),
        });

        toast.success(
          t("home.downloads.toasts.download_started_for_item", {
            item: item.Name,
          }),
        );
      } catch (error) {
        console.error("Failed to start download:", error);
        toast.error(t("home.downloads.toasts.failed_to_start_download"), {
          description: error instanceof Error ? error.message : "Unknown error",
        });
        throw error;
      }
    },
    [api, authHeader, processes, setProcesses, taskMapRef, t],
  );

  const cancelDownload = useCallback(
    async (id: string) => {
      // Find the task ID for this process
      let taskId: number | undefined;
      for (const [tId, pId] of taskMapRef.current.entries()) {
        if (pId === id) {
          taskId = tId;
          break;
        }
      }

      if (taskId !== undefined) {
        BackgroundDownloader.cancelDownload(taskId);
      }

      removeProcess(id);
      toast.info(t("home.downloads.toasts.download_cancelled"));
    },
    [taskMapRef, removeProcess, t],
  );

  const deleteFile = useCallback(
    async (id: string) => {
      const itemToDelete = removeDownloadedItem(id);

      if (itemToDelete) {
        try {
          deleteAllAssociatedFiles(itemToDelete);
          toast.success(
            t("home.downloads.toasts.file_deleted", {
              item: itemToDelete.item.Name,
            }),
          );
        } catch (error) {
          console.error("Failed to delete files:", error);
        }
      }
    },
    [t],
  );

  const deleteItems = useCallback(
    async (ids: string[]) => {
      for (const id of ids) {
        await deleteFile(id);
      }
    },
    [deleteFile],
  );

  const deleteAllFiles = useCallback(async () => {
    const allItems = getAllDownloadedItems();

    for (const item of allItems) {
      try {
        deleteAllAssociatedFiles(item);
      } catch (error) {
        console.error("Failed to delete file:", error);
      }
    }

    clearAllDownloadedItems();
    toast.success(t("home.downloads.toasts.all_files_deleted"));
  }, [t]);

  const appSizeUsage = useCallback(async () => {
    const totalSize = calculateTotalDownloadedSize();

    return {
      total: 0,
      remaining: 0,
      appSize: totalSize,
    };
  }, []);

  return {
    startBackgroundDownload,
    cancelDownload,
    deleteFile,
    deleteItems,
    deleteAllFiles,
    appSizeUsage,
  };
}

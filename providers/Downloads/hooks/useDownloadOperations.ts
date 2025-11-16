import type {
  BaseItemDto,
  MediaSourceInfo,
} from "@jellyfin/sdk/lib/generated-client/models";
import { File, Paths } from "expo-file-system";
import type { MutableRefObject } from "react";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import DeviceInfo from "react-native-device-info";
import { toast } from "sonner-native";
import type { Bitrate } from "@/components/BitrateSelector";
import useImageStorage from "@/hooks/useImageStorage";
import { BackgroundDownloader } from "@/modules";
import { getOrSetDeviceId } from "@/utils/device";
import useDownloadHelper from "@/utils/download";
import { downloadAdditionalAssets } from "../additionalDownloads";
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
  taskMapRef: MutableRefObject<Map<number | string, string>>;
  processes: JobStatus[];
  setProcesses: (updater: (prev: JobStatus[]) => JobStatus[]) => void;
  removeProcess: (id: string) => void;
  api: any;
  authHeader?: string;
  onDataChange?: () => void;
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
  onDataChange,
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

        // Download all additional assets BEFORE starting native video download
        const additionalAssets = await downloadAdditionalAssets({
          item,
          mediaSource,
          api,
          saveImageFn: saveImage,
          saveSeriesImageFn: saveSeriesPrimaryImage,
        });

        // Ensure URL is absolute (not relative) before storing
        let downloadUrl = url;
        if (url.startsWith("/")) {
          const basePath = api.basePath || "";
          downloadUrl = `${basePath}${url}`;
          console.log(
            `[DOWNLOAD] Converted relative URL to absolute: ${downloadUrl}`,
          );
        }

        // Create job status with pre-downloaded assets
        const jobStatus: JobStatus = {
          id: processId,
          inputUrl: downloadUrl,
          item,
          itemId: item.Id,
          deviceId,
          progress: 0,
          status: "downloading",
          timestamp: new Date(),
          mediaSource: additionalAssets.updatedMediaSource,
          maxBitrate,
          bytesDownloaded: 0,
          trickPlayData: additionalAssets.trickPlayData,
          introSegments: additionalAssets.introSegments,
          creditSegments: additionalAssets.creditSegments,
        };

        // Add to processes
        setProcesses((prev) => [...prev, jobStatus]);

        // Generate destination path
        const filename = generateFilename(item);
        const videoFile = new File(Paths.document, `${filename}.mp4`);
        const destinationPath = uriToFilePath(videoFile.uri);

        console.log(`[DOWNLOAD] Starting video: ${item.Name}`);
        console.log(`[DOWNLOAD] Download URL: ${downloadUrl}`);

        // Start the download using enqueueDownload for sequential processing
        const taskId = await BackgroundDownloader.enqueueDownload(
          downloadUrl,
          destinationPath,
        );

        // Map task ID or URL for later cancellation
        if (taskId !== -1) {
          taskMapRef.current.set(taskId, processId);
        } else {
          // For queued downloads, store a negative mapping using URL hash
          // This allows us to cancel queued downloads by URL
          taskMapRef.current.set(downloadUrl, processId);
        }

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
      // Find the task ID or URL for this process
      let taskId: number | undefined;
      let downloadUrl: string | undefined;

      taskMapRef.current.forEach((pId, key) => {
        if (pId === id) {
          if (typeof key === "number") {
            taskId = key;
          } else {
            downloadUrl = key as string;
          }
        }
      });

      if (taskId !== undefined) {
        // Cancel active download by taskId
        BackgroundDownloader.cancelDownload(taskId);
        taskMapRef.current.delete(taskId);
      } else if (downloadUrl !== undefined) {
        // Cancel queued download by URL
        BackgroundDownloader.cancelQueuedDownload(downloadUrl);
        taskMapRef.current.delete(downloadUrl);
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
          onDataChange?.();
        } catch (error) {
          console.error("Failed to delete files:", error);
        }
      }
    },
    [t, onDataChange],
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
    onDataChange?.();
  }, [t, onDataChange]);

  const deleteFileByType = useCallback(
    async (itemType: string) => {
      const allItems = getAllDownloadedItems();
      const itemsToDelete = allItems.filter(
        (item) => item.item.Type === itemType,
      );

      if (itemsToDelete.length === 0) {
        console.log(`[DELETE] No items found with type: ${itemType}`);
        return;
      }

      console.log(
        `[DELETE] Deleting ${itemsToDelete.length} items of type: ${itemType}`,
      );

      for (const item of itemsToDelete) {
        try {
          deleteAllAssociatedFiles(item);
          removeDownloadedItem(item.item.Id || "");
        } catch (error) {
          console.error(
            `Failed to delete ${itemType} file ${item.item.Name}:`,
            error,
          );
        }
      }

      const itemLabel =
        itemType === "Movie"
          ? t("common.movies")
          : itemType === "Episode"
            ? t("common.episodes")
            : itemType;

      toast.success(
        t("home.downloads.toasts.files_deleted_by_type", {
          count: itemsToDelete.length,
          type: itemLabel,
          defaultValue: `${itemsToDelete.length} ${itemLabel} deleted`,
        }),
      );

      onDataChange?.();
    },
    [t, onDataChange],
  );

  const appSizeUsage = useCallback(async () => {
    const totalSize = calculateTotalDownloadedSize();

    try {
      const [freeDiskStorage, totalDiskCapacity] = await Promise.all([
        DeviceInfo.getFreeDiskStorage(),
        DeviceInfo.getTotalDiskCapacity(),
      ]);

      return {
        total: totalDiskCapacity,
        remaining: freeDiskStorage,
        appSize: totalSize,
      };
    } catch (error) {
      console.error("Failed to get disk storage info:", error);
      return {
        total: 0,
        remaining: 0,
        appSize: totalSize,
      };
    }
  }, []);

  return {
    startBackgroundDownload,
    cancelDownload,
    deleteFile,
    deleteItems,
    deleteAllFiles,
    deleteFileByType,
    appSizeUsage,
  };
}

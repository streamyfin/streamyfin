import type {
  BaseItemDto,
  MediaSourceInfo,
} from "@jellyfin/sdk/lib/generated-client/models";
import { File, Paths } from "expo-file-system";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import DeviceInfo from "react-native-device-info";
import { toast } from "sonner-native";
import type { Bitrate } from "@/components/BitrateSelector";
import useImageStorage from "@/hooks/useImageStorage";
import { BackgroundDownloader } from "@/modules";
import { getJellyfinHeadersForUrl } from "@/utils/customHeaders";
import { getOrSetDeviceId } from "@/utils/device";
import useDownloadHelper, { estimateDownloadSize } from "@/utils/download";
import { logAndCaptureError } from "@/utils/log";
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
import { buildDownloadActivityMetadata } from "../liveActivity";
import {
  getPendingDownload,
  removePendingDownload,
  savePendingDownload,
  updatePendingDownload,
} from "../pendingDownloads";
import type { JobStatus } from "../types";
import { generateFilename, uriToFilePath } from "../utils";

interface UseDownloadOperationsProps {
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
      audioStreamIndex?: number,
      subtitleStreamIndex?: number,
    ) => {
      if (!api || !item.Id || !authHeader) {
        console.warn("startBackgroundDownload ~ Missing required params");
        throw new Error("startBackgroundDownload ~ Missing required params");
      }

      try {
        const deviceId = getOrSetDeviceId();
        const processId = item.Id;

        // Check if already downloading — in-memory process or persisted pending record
        const existingProcess = processes.find((p) => p.id === processId);
        if (existingProcess || getPendingDownload(processId)) {
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
          recapSegments: additionalAssets.recapSegments,
          commercialSegments: additionalAssets.commercialSegments,
          previewSegments: additionalAssets.previewSegments,
          audioStreamIndex,
          subtitleStreamIndex,
        };

        // Add to processes
        setProcesses((prev) => [...prev, jobStatus]);

        // Generate destination path
        const filename = generateFilename(item);
        const videoFileName = `${filename}.mp4`;
        const videoFile = new File(Paths.document, videoFileName);
        const destinationPath = uriToFilePath(videoFile.uri);

        console.log(`[DOWNLOAD] Starting video: ${item.Name}`);
        console.log(`[DOWNLOAD] Download URL: ${downloadUrl}`);

        // Download metadata for native: drives the iOS Live Activity, and its itemId is echoed
        // back in every download event on both platforms — it is how events find their way back
        // here without any taskId bookkeeping. Poster staging can fail; itemId must not, so a
        // minimal payload is always produced.
        let activityMetadata: Awaited<
          ReturnType<typeof buildDownloadActivityMetadata>
        >;
        try {
          activityMetadata = await buildDownloadActivityMetadata({
            item,
            api,
            t,
            estimatedTotalBytes: maxBitrate.value
              ? estimateDownloadSize(maxBitrate.value, item.RunTimeTicks)
              : undefined,
          });
        } catch (error) {
          console.warn("[DOWNLOAD] Live Activity metadata failed:", error);
        }
        activityMetadata ??= {
          itemId: item.Id,
          title: item.Name ?? "",
          subtitle: "",
          labels: {},
        };

        // Persist the pending record BEFORE handing the download to native, so there is no window
        // where a transfer exists that a later app session cannot account for.
        savePendingDownload({
          itemId: processId,
          status: "queued",
          enqueuedAt: new Date().toISOString(),
          inputUrl: downloadUrl,
          videoFileName,
          item,
          mediaSource: additionalAssets.updatedMediaSource,
          maxBitrate,
          deviceId,
          trickPlayData: additionalAssets.trickPlayData,
          introSegments: additionalAssets.introSegments,
          creditSegments: additionalAssets.creditSegments,
          recapSegments: additionalAssets.recapSegments,
          commercialSegments: additionalAssets.commercialSegments,
          previewSegments: additionalAssets.previewSegments,
          audioStreamIndex,
          subtitleStreamIndex,
          activityMetadata,
        });

        // Start the download using enqueueDownload for sequential processing
        const taskId = await BackgroundDownloader.enqueueDownload(
          downloadUrl,
          destinationPath,
          activityMetadata,
          getJellyfinHeadersForUrl(downloadUrl, api?.basePath),
        );

        if (taskId !== -1) {
          updatePendingDownload(processId, {
            status: "downloading",
            taskId,
          });
        }

        toast.success(
          t("home.downloads.toasts.download_started_for_item", {
            item: item.Name,
          }),
        );
      } catch (error) {
        logAndCaptureError("Failed to start download", error, {
          itemType: item.Type,
        });
        if (item.Id) {
          removePendingDownload(item.Id);
          removeProcess(item.Id);
        }
        toast.error(t("home.downloads.toasts.failed_to_start_download"), {
          description: error instanceof Error ? error.message : "Unknown error",
        });
        throw error;
      }
    },
    [api, authHeader, processes, setProcesses, removeProcess, t],
  );

  const cancelDownload = useCallback(
    async (id: string) => {
      const record = getPendingDownload(id);

      if (record?.status === "downloading" && record.taskId !== undefined) {
        // Cancel active download by taskId
        BackgroundDownloader.cancelDownload(record.taskId);
      } else if (record) {
        // Still queued natively — cancel by URL
        BackgroundDownloader.cancelQueuedDownload(record.inputUrl);
      }

      removePendingDownload(id);
      removeProcess(id);
      toast.info(t("home.downloads.toasts.download_cancelled"));
    },
    [removeProcess, t],
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
    let totalSize = calculateTotalDownloadedSize();

    // Also count in-progress downloads (they write straight to their final
    // path) so the growing file shows up as app usage instead of drifting
    // into the generic device share until completion.
    for (const process of processes) {
      try {
        const file = new File(
          Paths.document,
          `${generateFilename(process.item)}.mp4`,
        );
        if (file.exists) {
          totalSize += file.size ?? 0;
        }
      } catch {
        // File not created yet — ignore.
      }
    }

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
  }, [processes]);

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

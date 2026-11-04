import type {
  BaseItemDto,
  MediaSourceInfo,
} from "@jellyfin/sdk/lib/generated-client/models";
import { File, Paths } from "expo-file-system";
import { useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import DeviceInfo from "react-native-device-info";
import { toast } from "sonner-native";
import type { Bitrate } from "@/components/BitrateSelector";
import { DOWNLOAD_EXTRAS_CONCURRENCY } from "@/constants/Downloads";
import useImageStorage from "@/hooks/useImageStorage";
import { BackgroundDownloader } from "@/modules";
import { getJellyfinHeadersForUrl } from "@/utils/customHeaders";
import { getOrSetDeviceId } from "@/utils/device";
import useDownloadHelper from "@/utils/download";
import { estimateDownloadActivitySize } from "@/utils/downloadSize";
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
  deletePendingDownloadFiles,
} from "../fileOperations";
import { buildDownloadActivityMetadata } from "../liveActivity";
import {
  type DownloadAssets,
  finalizeWhenReady,
  getPendingDownload,
  getPendingDownloads,
  type PendingDownload,
  removePendingDownload,
  savePendingDownload,
  storeDownloadAssets,
  updatePendingDownload,
} from "../pendingDownloads";
import type { JobStatus } from "../types";
import { generateFilename, uriToFilePath } from "../utils";

/**
 * Starts that have not finished handing their download to native yet, by item id.
 *
 * A start is in here from its first step, which is what keeps a second start of the same item
 * out while the first is still writing its subtitles and trickplay sheets: neither the card nor
 * the pending record exists yet at that point.
 *
 * It is also what a cancel goes by. The card, with its cancel button, is on screen before the
 * pending record that cancelDownload works from, and the record has no task id until native
 * answers. A cancel in that stretch removes what the start wrote, takes the start out of here so
 * the item can be started again, and leaves a mark for the start to stop at its next step.
 */
type StartInFlight = {
  cancelled: boolean;
  item: BaseItemDto;
  mediaSource: MediaSourceInfo;
};
const startsInFlight = new Map<string, StartInFlight>();

/**
 * Extras downloads in flight, by item id and enqueue time: a start of an item after a cancel is
 * another download, with extras of its own.
 */
const extrasInFlight = new Set<string>();
let extrasRunning = 0;
const extrasWaiting: Array<() => void> = [];

/** Waits for one of the DOWNLOAD_EXTRAS_CONCURRENCY slots. */
const takeExtrasSlot = () =>
  new Promise<void>((resolve) => {
    if (extrasRunning < DOWNLOAD_EXTRAS_CONCURRENCY) {
      extrasRunning++;
      resolve();
      return;
    }
    extrasWaiting.push(() => {
      extrasRunning++;
      resolve();
    });
  });

const giveExtrasSlot = () => {
  extrasRunning--;
  extrasWaiting.shift()?.();
};

/** What fetching the extras of a download needs to know about it. */
type ExtrasOwner = Pick<
  PendingDownload,
  "itemId" | "item" | "mediaSource" | "enqueuedAt"
>;

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

  /**
   * Fetches the extras of a download whose video native already has, and stores them in its
   * pending record. Whichever of the video and the extras finishes second finalizes the download.
   */
  const fetchExtras = useCallback(
    ({ itemId, item, mediaSource, enqueuedAt }: ExtrasOwner) => {
      const key = `${itemId}@${enqueuedAt}`;
      if (!api || extrasInFlight.has(key)) return;
      extrasInFlight.add(key);
      const isStillThisDownload = () =>
        getPendingDownload(itemId)?.enqueuedAt === enqueuedAt;

      (async () => {
        await takeExtrasSlot();
        try {
          // Cancelled while it waited for a slot.
          if (!isStillThisDownload()) return;

          let extras: DownloadAssets;
          try {
            extras = await downloadAdditionalAssets({
              item,
              mediaSource,
              api,
              saveImageFn: saveImage,
              saveSeriesImageFn: saveSeriesPrimaryImage,
            });
          } catch (error) {
            // The video plays offline without them, short of its scrubbing previews, sidecar
            // subtitles and skip buttons.
            logAndCaptureError(
              "Downloading the extras of a download failed",
              error,
              {
                itemType: item.Type,
              },
            );
            extras = { updatedMediaSource: mediaSource };
          }

          if (!isStillThisDownload()) {
            // Cancelled while they came in: cancelDownload removed what was there then, and these
            // landed after. They go too, unless the item has been started again and the names
            // are the new download's.
            if (!getPendingDownload(itemId) && !startsInFlight.has(itemId)) {
              deletePendingDownloadFiles({ itemId, item, mediaSource });
            }
            return;
          }

          let ready: PendingDownload | undefined;
          try {
            ready = storeDownloadAssets(itemId, extras);
          } catch (error) {
            // The record still waits for them, so the next run fetches them again.
            logAndCaptureError(
              "Storing the extras of a download failed",
              error,
              {
                itemType: item.Type,
              },
            );
            return;
          }
          if (!ready) return;
          try {
            finalizeWhenReady(ready);
          } catch (error) {
            // As a completion that cannot be finalized: the download goes, with its card, rather
            // than stay a record that no longer waits for anything.
            logAndCaptureError("Handling download completion failed", error, {
              itemType: item.Type,
            });
            // The card first: the storage that just failed can fail again.
            removeProcess(itemId);
            removePendingDownload(itemId);
          }
        } finally {
          giveExtrasSlot();
          extrasInFlight.delete(key);
        }
      })().catch((error) => {
        // Nothing above is meant to throw this far; a stray rejection is still reported.
        logAndCaptureError("Fetching the extras of a download failed", error, {
          itemType: item.Type,
        });
      });
    },
    [api, saveImage, saveSeriesPrimaryImage, removeProcess],
  );

  // A run can end before the extras of its downloads are in, while native keeps downloading the
  // videos. The next run fetches them.
  const fetchExtrasRef = useRef(fetchExtras);
  fetchExtrasRef.current = fetchExtras;
  useEffect(() => {
    if (!api) return;
    for (const record of getPendingDownloads()) {
      if (record.assetsPending) fetchExtrasRef.current(record);
    }
  }, [api]);

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

      const processId = item.Id;
      const start: StartInFlight = { cancelled: false, item, mediaSource };

      try {
        const deviceId = getOrSetDeviceId();

        // Check if already downloading — in-memory process, persisted pending record, or a
        // start that has produced neither yet
        const existingProcess = processes.find((p) => p.id === processId);
        if (
          existingProcess ||
          getPendingDownload(processId) ||
          startsInFlight.has(processId)
        ) {
          toast.info(
            t("home.downloads.toasts.item_already_downloading", {
              item: item.Name,
            }),
          );
          return;
        }
        startsInFlight.set(processId, start);

        // Ensure URL is absolute (not relative) before storing
        let downloadUrl = url;
        if (url.startsWith("/")) {
          const basePath = api.basePath || "";
          downloadUrl = `${basePath}${url}`;
          console.log(
            `[DOWNLOAD] Converted relative URL to absolute: ${downloadUrl}`,
          );
        }

        // The card shows at once. The extras (trickplay sheets, subtitles, segments, covers) come
        // in once the video is handed to native, and the download is finalized when both are.
        const jobStatus: JobStatus = {
          id: processId,
          inputUrl: downloadUrl,
          item,
          itemId: item.Id,
          deviceId,
          progress: 0,
          status: "downloading",
          timestamp: new Date(),
          mediaSource,
          maxBitrate,
          bytesDownloaded: 0,
          audioStreamIndex,
          subtitleStreamIndex,
        };

        // Add to processes. From here on the card, and its cancel button, is on screen.
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
            estimatedTotalBytes: estimateDownloadActivitySize(
              mediaSource,
              maxBitrate.value,
              item.RunTimeTicks,
            ),
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

        // cancelDownload has already taken the card down, removed what this start wrote and
        // told the user. Nothing is cleaned up here: the item may have been started again in
        // the meantime, and those files would be the new start's.
        if (start.cancelled) return;

        // Persist the pending record BEFORE handing the download to native, so there is no window
        // where a transfer exists that a later app session cannot account for.
        const enqueuedAt = new Date().toISOString();
        savePendingDownload({
          itemId: processId,
          status: "queued",
          enqueuedAt,
          inputUrl: downloadUrl,
          videoFileName,
          item,
          mediaSource,
          maxBitrate,
          deviceId,
          audioStreamIndex,
          subtitleStreamIndex,
          activityMetadata,
          assetsPending: true,
        });

        // Start the download using enqueueDownload for sequential processing
        const taskId = await BackgroundDownloader.enqueueDownload(
          downloadUrl,
          destinationPath,
          activityMetadata,
          getJellyfinHeadersForUrl(downloadUrl, api?.basePath),
        );

        // A cancel while native was taking the download found the record, so the files are
        // gone, but not the task id: it could only try the queue, where the download was not
        // yet, or no longer.
        if (start.cancelled) {
          if (taskId !== -1) {
            BackgroundDownloader.cancelDownload(taskId);
          } else {
            BackgroundDownloader.cancelQueuedDownload(downloadUrl);
          }
          return;
        }

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

        fetchExtras({ itemId: processId, item, mediaSource, enqueuedAt });
      } catch (error) {
        // The user cancelled this start and has been told so. cancelDownload cleaned up, and
        // the record and the files of the item may belong to a newer start by now.
        if (start.cancelled) {
          console.warn("[DOWNLOAD] Cancelled start failed afterwards:", error);
          return;
        }

        logAndCaptureError("Failed to start download", error, {
          itemType: item.Type,
        });
        if (item.Id) {
          const record = getPendingDownload(item.Id);
          removePendingDownload(item.Id);
          removeProcess(item.Id);
          // Nothing is written before the record is saved; after, the record says what.
          deletePendingDownloadFiles(
            record ?? { itemId: item.Id, item, mediaSource },
          );
        }
        toast.error(t("home.downloads.toasts.failed_to_start_download"), {
          description: error instanceof Error ? error.message : "Unknown error",
        });
        throw error;
      } finally {
        if (startsInFlight.get(processId) === start) {
          startsInFlight.delete(processId);
        }
      }
    },
    [api, authHeader, processes, setProcesses, removeProcess, t, fetchExtras],
  );

  const cancelDownload = useCallback(
    async (id: string) => {
      const start = startsInFlight.get(id);
      if (start) {
        start.cancelled = true;
        // Out of the map right away: the cancelled start may take a while to notice, and the
        // item can be started again before it does.
        startsInFlight.delete(id);
      }

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

      // The record knows which files the enqueue step wrote. A start cancelled before it saved
      // one is cleaned up here as well, not when it resumes: by then the same names may belong
      // to a new start of the item.
      if (record) {
        deletePendingDownloadFiles(record);
      } else if (start) {
        deletePendingDownloadFiles({
          itemId: id,
          item: start.item,
          mediaSource: start.mediaSource,
        });
      }
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

    // Out of the database first: downloads that share a file name would otherwise keep each
    // other's files alive.
    clearAllDownloadedItems();

    for (const item of allItems) {
      try {
        deleteAllAssociatedFiles(item);
      } catch (error) {
        console.error("Failed to delete file:", error);
      }
    }

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

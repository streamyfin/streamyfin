import type {
  BaseItemDto,
  MediaSourceInfo,
} from "@jellyfin/sdk/lib/generated-client/models";
import * as Application from "expo-application";
import { Directory, File, Paths } from "expo-file-system";
import * as Notifications from "expo-notifications";
import { atom, useAtom } from "jotai";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { Platform } from "react-native";
import { toast } from "sonner-native";
import { useHaptic } from "@/hooks/useHaptic";
import type {
  DownloadCompleteEvent,
  DownloadErrorEvent,
  DownloadProgressEvent,
} from "@/modules";
import { BackgroundDownloader } from "@/modules";
import { getOrSetDeviceId } from "@/utils/device";
import { storage } from "@/utils/mmkv";
import { Bitrate } from "../components/BitrateSelector";
import type {
  DownloadedItem,
  DownloadsDatabase,
  JobStatus,
} from "./Downloads/types";
import { apiAtom } from "./JellyfinProvider";

export const processesAtom = atom<JobStatus[]>([]);
const DOWNLOADS_DATABASE_KEY = "downloads.v2.json";

const DownloadContext = createContext<ReturnType<
  typeof useDownloadProvider
> | null>(null);

// Generate a safe filename from item metadata
const generateFilename = (item: BaseItemDto): string => {
  if (item.Type === "Episode") {
    const season = String(item.ParentIndexNumber || 0).padStart(2, "0");
    const episode = String(item.IndexNumber || 0).padStart(2, "0");
    const seriesName = (item.SeriesName || "Unknown")
      .replace(/[^a-z0-9]/gi, "_")
      .toLowerCase();
    return `${seriesName}_s${season}e${episode}`;
  } else if (item.Type === "Movie") {
    const movieName = (item.Name || "Unknown")
      .replace(/[^a-z0-9]/gi, "_")
      .toLowerCase();
    const year = item.ProductionYear || "";
    return `${movieName}_${year}`;
  }
  return `${item.Id}`;
};

function useDownloadProvider() {
  const { t } = useTranslation();
  const [api] = useAtom(apiAtom);
  const [processes, setProcesses] = useAtom<JobStatus[]>(processesAtom);
  const successHapticFeedback = useHaptic("success");

  // Track task ID to process ID mapping
  const [taskMap, setTaskMap] = useState<Map<number, string>>(new Map());

  const authHeader = useMemo(() => {
    return api?.accessToken;
  }, [api]);

  const APP_CACHE_DOWNLOAD_DIRECTORY = new Directory(
    Paths.cache,
    `${Application.applicationId}/Downloads/`,
  );

  // Database operations
  const getDownloadsDatabase = (): DownloadsDatabase => {
    const file = storage.getString(DOWNLOADS_DATABASE_KEY);
    if (file) {
      const db = JSON.parse(file) as DownloadsDatabase;
      return db;
    }
    return { movies: {}, series: {}, other: {} };
  };

  const saveDownloadsDatabase = (db: DownloadsDatabase) => {
    storage.set(DOWNLOADS_DATABASE_KEY, JSON.stringify(db));
  };

  const getDownloadedItems = useCallback((): DownloadedItem[] => {
    const db = getDownloadsDatabase();
    const items: DownloadedItem[] = [];

    for (const movie of Object.values(db.movies)) {
      items.push(movie);
    }

    for (const series of Object.values(db.series)) {
      for (const season of Object.values(series.seasons)) {
        for (const episode of Object.values(season.episodes)) {
          items.push(episode);
        }
      }
    }

    if (db.other) {
      for (const item of Object.values(db.other)) {
        items.push(item);
      }
    }

    return items;
  }, []);

  const getDownloadedItemById = (id: string): DownloadedItem | undefined => {
    const db = getDownloadsDatabase();

    if (db.movies[id]) {
      return db.movies[id];
    }

    for (const series of Object.values(db.series)) {
      for (const season of Object.values(series.seasons)) {
        for (const episode of Object.values(season.episodes)) {
          if (episode.item.Id === id) {
            return episode;
          }
        }
      }
    }

    if (db.other?.[id]) {
      return db.other[id];
    }

    return undefined;
  };

  // Generate notification content based on item type
  const getNotificationContent = useCallback(
    (item: BaseItemDto, isSuccess: boolean) => {
      if (item.Type === "Episode") {
        const season = item.ParentIndexNumber
          ? String(item.ParentIndexNumber).padStart(2, "0")
          : "??";
        const episode = item.IndexNumber
          ? String(item.IndexNumber).padStart(2, "0")
          : "??";
        const subtitle = `${item.Name} - [S${season}E${episode}] (${item.SeriesName})`;

        return {
          title: isSuccess ? "Download complete" : "Download failed",
          body: subtitle,
        };
      } else if (item.Type === "Movie") {
        const year = item.ProductionYear ? ` (${item.ProductionYear})` : "";
        const subtitle = `${item.Name}${year}`;

        return {
          title: isSuccess ? "Download complete" : "Download failed",
          body: subtitle,
        };
      }

      return {
        title: isSuccess
          ? t("home.downloads.toasts.download_completed_for_item", {
              item: item.Name,
            })
          : t("home.downloads.toasts.download_failed_for_item", {
              item: item.Name,
            }),
        body: item.Name || "Unknown item",
      };
    },
    [t],
  );

  // Send local notification for download events
  const sendDownloadNotification = useCallback(
    async (title: string, body: string, data?: Record<string, any>) => {
      if (Platform.isTV) return;

      try {
        await Notifications.scheduleNotificationAsync({
          content: {
            title,
            body,
            data,
            ...(Platform.OS === "android" && { channelId: "downloads" }),
          },
          trigger: null,
        });
      } catch (error) {
        console.error("Failed to send notification:", error);
      }
    },
    [],
  );

  const updateProcess = useCallback(
    (
      processId: string,
      updater:
        | Partial<JobStatus>
        | ((current: JobStatus) => Partial<JobStatus>),
    ) => {
      setProcesses((prev) =>
        prev.map((p) => {
          if (p.id !== processId) return p;
          const newStatus =
            typeof updater === "function" ? updater(p) : updater;
          return {
            ...p,
            ...newStatus,
          };
        }),
      );
    },
    [setProcesses],
  );

  const removeProcess = useCallback(
    (id: string) => {
      setProcesses((prev) => prev.filter((process) => process.id !== id));

      // Find and remove from task map
      setTaskMap((prev) => {
        const newMap = new Map(prev);
        for (const [taskId, processId] of newMap.entries()) {
          if (processId === id) {
            newMap.delete(taskId);
          }
        }
        return newMap;
      });
    },
    [setProcesses],
  );

  // Handle download progress events
  useEffect(() => {
    const progressSub = BackgroundDownloader.addProgressListener(
      (event: DownloadProgressEvent) => {
        const processId = taskMap.get(event.taskId);
        if (!processId) return;

        const progress = Math.min(
          Math.floor(event.progress * 100),
          99, // Cap at 99% until completion
        );

        updateProcess(processId, {
          progress,
          bytesDownloaded: event.bytesWritten,
          lastProgressUpdateTime: new Date(),
        });
      },
    );

    return () => progressSub.remove();
  }, [taskMap, updateProcess]);

  // Handle download completion events
  useEffect(() => {
    const completeSub = BackgroundDownloader.addCompleteListener(
      async (event: DownloadCompleteEvent) => {
        const processId = taskMap.get(event.taskId);
        if (!processId) return;

        const process = processes.find((p) => p.id === processId);
        if (!process) return;

        try {
          const db = getDownloadsDatabase();
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

          // Save to database based on item type
          if (item.Type === "Movie" && item.Id) {
            db.movies[item.Id] = downloadedItem;
          } else if (
            item.Type === "Episode" &&
            item.SeriesId &&
            item.ParentIndexNumber !== undefined &&
            item.ParentIndexNumber !== null &&
            item.IndexNumber !== undefined &&
            item.IndexNumber !== null
          ) {
            if (!db.series[item.SeriesId]) {
              const seriesInfo: Partial<BaseItemDto> = {
                Id: item.SeriesId,
                Name: item.SeriesName,
                Type: "Series",
              };
              db.series[item.SeriesId] = {
                seriesInfo: seriesInfo as BaseItemDto,
                seasons: {},
              };
            }

            const seasonNumber = item.ParentIndexNumber;
            if (!db.series[item.SeriesId].seasons[seasonNumber]) {
              db.series[item.SeriesId].seasons[seasonNumber] = {
                episodes: {},
              };
            }

            const episodeNumber = item.IndexNumber;
            db.series[item.SeriesId].seasons[seasonNumber].episodes[
              episodeNumber
            ] = downloadedItem;
          } else if (item.Id) {
            if (!db.other) db.other = {};
            db.other[item.Id] = downloadedItem;
          }

          saveDownloadsDatabase(db);

          updateProcess(processId, {
            status: "completed",
            progress: 100,
          });

          const notificationContent = getNotificationContent(item, true);
          await sendDownloadNotification(
            notificationContent.title,
            notificationContent.body,
          );

          toast.success(
            t("home.downloads.toasts.download_completed_for_item", {
              item: item.Name,
            }),
          );

          successHapticFeedback();

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
  }, [
    taskMap,
    processes,
    updateProcess,
    removeProcess,
    getNotificationContent,
    sendDownloadNotification,
    successHapticFeedback,
    t,
  ]);

  // Handle download error events
  useEffect(() => {
    const errorSub = BackgroundDownloader.addErrorListener(
      async (event: DownloadErrorEvent) => {
        const processId = taskMap.get(event.taskId);
        if (!processId) return;

        const process = processes.find((p) => p.id === processId);
        if (!process) return;

        console.error(`Download error for ${processId}:`, event.error);

        updateProcess(processId, { status: "error" });

        const notificationContent = getNotificationContent(process.item, false);
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
  }, [
    taskMap,
    processes,
    updateProcess,
    removeProcess,
    getNotificationContent,
    sendDownloadNotification,
    t,
  ]);

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
        const destinationPath = videoFile.uri;

        console.log(`[DOWNLOAD] Starting download for ${filename}`);
        console.log(`[DOWNLOAD] URL: ${url}`);
        console.log(`[DOWNLOAD] Destination: ${destinationPath}`);

        // Start the download with auth header
        const fullUrl = `${url}${url.includes("?") ? "&" : "?"}api_key=${authHeader}`;
        const taskId = await BackgroundDownloader.startDownload(
          fullUrl,
          destinationPath,
        );

        // Map task ID to process ID
        setTaskMap((prev) => new Map(prev).set(taskId, processId));

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
    [api, authHeader, processes, setProcesses, t],
  );

  const cancelDownload = useCallback(
    async (id: string) => {
      // Find the task ID for this process
      let taskId: number | undefined;
      for (const [tId, pId] of taskMap.entries()) {
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
    [taskMap, removeProcess, t],
  );

  const deleteFile = useCallback(
    async (id: string) => {
      const db = getDownloadsDatabase();
      let itemToDelete: DownloadedItem | undefined;

      // Find and remove from database
      if (db.movies[id]) {
        itemToDelete = db.movies[id];
        delete db.movies[id];
      } else {
        for (const seriesId in db.series) {
          const series = db.series[seriesId];
          for (const seasonNum in series.seasons) {
            const season = series.seasons[seasonNum];
            for (const episodeNum in season.episodes) {
              const episode = season.episodes[episodeNum];
              if (episode.item.Id === id) {
                itemToDelete = episode;
                delete season.episodes[episodeNum];

                // Clean up empty season
                if (Object.keys(season.episodes).length === 0) {
                  delete series.seasons[seasonNum];
                }

                // Clean up empty series
                if (Object.keys(series.seasons).length === 0) {
                  delete db.series[seriesId];
                }

                break;
              }
            }
          }
        }

        if (!itemToDelete && db.other?.[id]) {
          itemToDelete = db.other[id];
          delete db.other[id];
        }
      }

      if (itemToDelete) {
        // Delete the video file
        try {
          const videoFile = new File("", itemToDelete.videoFilePath);
          if (videoFile.exists) {
            videoFile.delete();
          }
        } catch (error) {
          console.error("Failed to delete video file:", error);
        }

        saveDownloadsDatabase(db);
        toast.success(
          t("home.downloads.toasts.file_deleted", {
            item: itemToDelete.item.Name,
          }),
        );
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
    const db = getDownloadsDatabase();
    const allItems = [
      ...Object.values(db.movies),
      ...Object.values(db.series).flatMap((series) =>
        Object.values(series.seasons).flatMap((season) =>
          Object.values(season.episodes),
        ),
      ),
      ...(db.other ? Object.values(db.other) : []),
    ];

    for (const item of allItems) {
      try {
        const videoFile = new File("", item.videoFilePath);
        if (videoFile.exists) {
          videoFile.delete();
        }
      } catch (error) {
        console.error("Failed to delete file:", error);
      }
    }

    saveDownloadsDatabase({ movies: {}, series: {}, other: {} });
    toast.success(t("home.downloads.toasts.all_files_deleted"));
  }, [t]);

  const getDownloadedItemSize = useCallback((id: string): number => {
    const item = getDownloadedItemById(id);
    return item?.videoFileSize || 0;
  }, []);

  const appSizeUsage = useCallback(async () => {
    const items = getDownloadedItems();
    const totalSize = items.reduce(
      (sum, item) => sum + (item.videoFileSize || 0),
      0,
    );

    return {
      total: 0,
      remaining: 0,
      appSize: totalSize,
    };
  }, [getDownloadedItems]);

  return {
    processes,
    startBackgroundDownload,
    getDownloadedItems,
    getDownloadsDatabase,
    deleteAllFiles,
    deleteFile,
    deleteItems,
    removeProcess,
    cancelDownload,
    getDownloadedItemSize,
    getDownloadedItemById,
    APP_CACHE_DOWNLOAD_DIRECTORY: APP_CACHE_DOWNLOAD_DIRECTORY.uri,
    appSizeUsage,
    // Deprecated/not implemented in simple version
    startDownload: async () => {},
    pauseDownload: async () => {},
    resumeDownload: async () => {},
    deleteFileByType: async () => {},
    cleanCacheDirectory: async () => {},
    updateDownloadedItem: () => {},
    dumpDownloadDiagnostics: async () => "",
  };
}

export function useDownload() {
  const context = useContext(DownloadContext);

  if (Platform.isTV) {
    return {
      processes: [],
      startBackgroundDownload: async () => {},
      getDownloadedItems: () => [],
      getDownloadsDatabase: () => ({ movies: {}, series: {}, other: {} }),
      deleteAllFiles: async () => {},
      deleteFile: async () => {},
      deleteItems: async () => {},
      removeProcess: () => {},
      cancelDownload: async () => {},
      startDownload: async () => {},
      pauseDownload: async () => {},
      resumeDownload: async () => {},
      deleteFileByType: async () => {},
      getDownloadedItemSize: () => 0,
      getDownloadedItemById: () => undefined,
      APP_CACHE_DOWNLOAD_DIRECTORY: "",
      cleanCacheDirectory: async () => {},
      updateDownloadedItem: () => {},
      appSizeUsage: async () => ({ total: 0, remaining: 0, appSize: 0 }),
      dumpDownloadDiagnostics: async () => "",
    };
  }

  if (context === null) {
    throw new Error("useDownload must be used within a DownloadProvider");
  }

  return context;
}

export function DownloadProvider({ children }: { children: React.ReactNode }) {
  const downloadUtils = useDownloadProvider();

  return (
    <DownloadContext.Provider value={downloadUtils}>
      {children}
    </DownloadContext.Provider>
  );
}

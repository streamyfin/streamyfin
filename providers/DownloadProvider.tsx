import type {
  BaseItemDto,
  MediaSourceInfo,
} from "@jellyfin/sdk/lib/generated-client/models";
import * as Application from "expo-application";
import * as FileSystem from "expo-file-system";
import { router } from "expo-router";
import { atom, useAtom } from "jotai";
import { throttle } from "lodash";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
} from "react";
import { useTranslation } from "react-i18next";
import { Platform } from "react-native";
import { toast } from "sonner-native";
import { useHaptic } from "@/hooks/useHaptic";
import useImageStorage from "@/hooks/useImageStorage";
import { useInterval } from "@/hooks/useInterval";
import { generateTrickplayUrl, getTrickplayInfo } from "@/hooks/useTrickplay";
import { useSettings } from "@/utils/atoms/settings";
import { getOrSetDeviceId } from "@/utils/device";
import useDownloadHelper from "@/utils/download";
import { getItemImage } from "@/utils/getItemImage";
import { writeToLog } from "@/utils/log";
import { storage } from "@/utils/mmkv";
import { fetchAndParseSegments } from "@/utils/segments";
import { Bitrate } from "../components/BitrateSelector";
import {
  DownloadedItem,
  DownloadsDatabase,
  JobStatus,
  TrickPlayData,
} from "./Downloads/types";
import { apiAtom } from "./JellyfinProvider";

const BackGroundDownloader = !Platform.isTV
  ? require("@kesha-antonov/react-native-background-downloader")
  : null;

const calculateEstimatedSize = (p: JobStatus): number => {
  let size = p.mediaSource.Size;
  const maxBitrate = p.maxBitrate.value;
  if (
    maxBitrate &&
    size &&
    p.mediaSource.Bitrate &&
    maxBitrate < p.mediaSource.Bitrate
  ) {
    size = (size / p.mediaSource.Bitrate) * maxBitrate;
  }
  // This function is for estimated size, so just return the adjusted size
  return size ?? 0;
};

// Helper to calculate download speed
const calculateSpeed = (
  process: JobStatus,
  newBytesDownloaded: number,
): number | undefined => {
  const { bytesDownloaded: oldBytes = 0, lastProgressUpdateTime } = process;
  const deltaBytes = newBytesDownloaded - oldBytes;

  if (lastProgressUpdateTime && deltaBytes > 0) {
    const deltaTimeInSeconds =
      (Date.now() - new Date(lastProgressUpdateTime).getTime()) / 1000;
    if (deltaTimeInSeconds > 0) {
      return deltaBytes / deltaTimeInSeconds;
    }
  }
  return undefined;
};

export const processesAtom = atom<JobStatus[]>([]);
const DOWNLOADS_DATABASE_KEY = "downloads.v2.json";

const DownloadContext = createContext<ReturnType<
  typeof useDownloadProvider
> | null>(null);

function useDownloadProvider() {
  const { t } = useTranslation();
  const [api] = useAtom(apiAtom);
  const { saveSeriesPrimaryImage } = useDownloadHelper();
  const { saveImage } = useImageStorage();
  const [processes, setProcesses] = useAtom<JobStatus[]>(processesAtom);
  const [settings] = useSettings();
  const successHapticFeedback = useHaptic("success");

  /// Cant use the background downloader callback. As its not triggered if size is unknown.
  const updateProgress = async () => {
    const tasks = await BackGroundDownloader.checkForExistingDownloads();
    if (!tasks) {
      return;
    }
    // check if processes are missing
    setProcesses((processes) => {
      const missingProcesses = tasks
        .filter((t) => t.metadata && !processes.some((p) => p.id === t.id))
        .map((t) => {
          return t.metadata as JobStatus;
        });

      const currentProcesses = [...processes, ...missingProcesses];
      const updatedProcesses = currentProcesses.map((p) => {
        // fallback. Doesn't really work for transcodes as they may be a lot smaller.
        // We make an wild guess by comparing bitrates
        const task = tasks.find((s) => s.id === p.id);
        if (task && p.status === "downloading") {
          const estimatedSize = calculateEstimatedSize(p);
          let progress = p.progress;
          if (estimatedSize > 0) {
            progress = (100 / estimatedSize) * task.bytesDownloaded;
          }
          if (progress >= 100) {
            progress = 99;
          }
          const speed = calculateSpeed(p, task.bytesDownloaded);
          return {
            ...p,
            progress,
            speed,
            bytesDownloaded: task.bytesDownloaded,
            lastProgressUpdateTime: new Date(),
            estimatedTotalSizeBytes: estimatedSize,
          };
        }
        return p;
      });

      return updatedProcesses;
    });
  };

  useInterval(updateProgress, 2000);

  const getDownloadedItemById = (id: string): DownloadedItem | undefined => {
    const db = getDownloadsDatabase();

    // Check movies first
    if (db.movies[id]) {
      return db.movies[id];
    }

    // If not in movies, check episodes
    for (const series of Object.values(db.series)) {
      for (const season of Object.values(series.seasons)) {
        for (const episode of Object.values(season.episodes)) {
          if (episode.item.Id === id) {
            return episode;
          }
        }
      }
    }

    return undefined;
  };

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

  const authHeader = useMemo(() => {
    return api?.accessToken;
  }, [api]);

  const APP_CACHE_DOWNLOAD_DIRECTORY = `${FileSystem.cacheDirectory}${Application.applicationId}/Downloads/`;

  const getDownloadsDatabase = (): DownloadsDatabase => {
    const file = storage.getString(DOWNLOADS_DATABASE_KEY);
    if (file) {
      return JSON.parse(file) as DownloadsDatabase;
    }
    return { movies: {}, series: {} };
  };

  const getDownloadedItems = () => {
    const db = getDownloadsDatabase();
    const allItems = [
      ...Object.values(db.movies),
      ...Object.values(db.series).flatMap((series) =>
        Object.values(series.seasons).flatMap((season) =>
          Object.values(season.episodes),
        ),
      ),
    ];
    return allItems;
  };

  const downloadedItems = getDownloadedItems();

  const saveDownloadsDatabase = (db: DownloadsDatabase) => {
    storage.set(DOWNLOADS_DATABASE_KEY, JSON.stringify(db));
  };

  /** Generates a filename for a given item */
  const generateFilename = (item: BaseItemDto): string => {
    let rawFilename = "";
    if (item.Type === "Movie" && item.Name) {
      rawFilename = `${item.Name}`;
    } else if (
      item.Type === "Episode" &&
      item.SeriesName &&
      item.ParentIndexNumber !== undefined &&
      item.IndexNumber !== undefined
    ) {
      const season = String(item.ParentIndexNumber).padStart(2, "0");
      const episode = String(item.IndexNumber).padStart(2, "0");
      rawFilename = `${item.SeriesName} S${season}E${episode} ${item.Name}`;
    } else {
      // Fallback to a unique name if data is missing
      rawFilename = `${item.Name || "video"} ${item.Id}`;
    }
    // Sanitize the entire string to remove illegal characters
    return rawFilename.replace(/[\\/:*?"<>|\s]/g, "_");
  };

  /**
   * Downloads the trickplay images for a given item.
   * @param item - The item to download the trickplay images for.
   * @returns The path to the trickplay images.
   */
  const downloadTrickplayImages = async (
    item: BaseItemDto,
  ): Promise<TrickPlayData | undefined> => {
    const trickplayInfo = getTrickplayInfo(item);
    if (!api || !trickplayInfo || !item.Id) {
      return undefined;
    }

    const filename = generateFilename(item);
    const trickplayDir = `${FileSystem.documentDirectory}${filename}_trickplay/`;
    await FileSystem.makeDirectoryAsync(trickplayDir, { intermediates: true });
    let totalSize = 0;

    for (let index = 0; index < trickplayInfo.totalImageSheets; index++) {
      const url = generateTrickplayUrl(item, index);
      if (!url) continue;
      const destination = `${trickplayDir}${index}.jpg`;
      try {
        await FileSystem.downloadAsync(url, destination);
        const fileInfo = await FileSystem.getInfoAsync(destination);
        if (fileInfo.exists) {
          totalSize += fileInfo.size;
        }
      } catch (e) {
        console.error(
          `Failed to download trickplay image ${index} for item ${item.Id}`,
          e,
        );
      }
    }

    return { path: trickplayDir, size: totalSize };
  };

  /**
   * Downloads and links external subtitles to the media source.
   * @param mediaSource - The media source to download the subtitles for.
   */
  const downloadAndLinkSubtitles = async (
    mediaSource: MediaSourceInfo,
    item: BaseItemDto,
  ) => {
    const externalSubtitles = mediaSource.MediaStreams?.filter(
      (stream) =>
        stream.Type === "Subtitle" && stream.DeliveryMethod === "External",
    );
    if (externalSubtitles && api) {
      await Promise.all(
        externalSubtitles.map(async (subtitle) => {
          const url = api.basePath + subtitle.DeliveryUrl;
          const filename = generateFilename(item);
          const destination = `${FileSystem.documentDirectory}${filename}_subtitle_${subtitle.Index}`;
          await FileSystem.downloadAsync(url, destination);
          subtitle.DeliveryUrl = destination;
        }),
      );
    }
  };

  /**
   * Starts a download for a given process.
   * @param process - The process to start the download for.
   */
  const startDownload = useCallback(
    async (process: JobStatus) => {
      if (!process?.item.Id || !authHeader) throw new Error("No item id");

      updateProcess(process.id, {
        speed: undefined,
        status: "downloading",
        progress: 0,
      });

      BackGroundDownloader?.setConfig({
        isLogsEnabled: false,
        progressInterval: 500,
        headers: {
          Authorization: authHeader,
        },
      });
      const filename = generateFilename(process.item);
      const videoFilePath = `${FileSystem.documentDirectory}${filename}.mp4`;
      BackGroundDownloader?.download({
        id: process.id,
        url: process.inputUrl,
        destination: videoFilePath,
        metadata: process,
      })
        .begin(() => {
          updateProcess(process.id, {
            status: "downloading",
            progress: 0,
            bytesDownloaded: 0,
            lastProgressUpdateTime: new Date(),
          });
        })
        .progress(
          throttle((data) => {
            updateProcess(process.id, (currentProcess) => {
              const percent = (data.bytesDownloaded / data.bytesTotal) * 100;
              return {
                speed: calculateSpeed(currentProcess, data.bytesDownloaded),
                status: "downloading",
                progress: percent,
                bytesDownloaded: data.bytesDownloaded,
                lastProgressUpdateTime: new Date(),
              };
            });
          }, 500),
        )
        .done(async () => {
          const trickPlayData = await downloadTrickplayImages(process.item);
          const videoFileInfo = await FileSystem.getInfoAsync(videoFilePath);
          if (!videoFileInfo.exists) {
            throw new Error("Downloaded file does not exist");
          }
          const videoFileSize = videoFileInfo.size;
          const db = getDownloadsDatabase();
          const { item, mediaSource } = process;
          // Only download external subtitles for non-transcoded streams.
          if (!mediaSource.TranscodingUrl) {
            await downloadAndLinkSubtitles(mediaSource, item);
          }
          const { introSegments, creditSegments } = await fetchAndParseSegments(
            item.Id!,
            api!,
          );
          const downloadedItem: DownloadedItem = {
            item,
            mediaSource,
            videoFilePath,
            videoFileSize,
            trickPlayData,
            userData: {
              audioStreamIndex: 0,
              subtitleStreamIndex: 0,
            },
            introSegments,
            creditSegments,
          };

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
          }
          await saveDownloadsDatabase(db);

          toast.success(
            t("home.downloads.toasts.download_completed_for_item", {
              item: process.item.Name,
            }),
          );
          removeProcess(process.id);
        })
        .error((error) => {
          console.error("Download error:", error);
          toast.error(
            t("home.downloads.toasts.download_failed_for_item", {
              item: process.item.Name,
            }),
          );
          removeProcess(process.id);
        });
    },
    [authHeader],
  );

  const manageDownloadQueue = useCallback(() => {
    const activeDownloads = processes.filter(
      (p) => p.status === "downloading",
    ).length;
    const concurrentLimit = settings?.remuxConcurrentLimit || 1;
    if (activeDownloads < concurrentLimit) {
      const queuedDownload = processes.find((p) => p.status === "queued");
      if (queuedDownload) {
        startDownload(queuedDownload);
      }
    }
  }, [processes, settings?.remuxConcurrentLimit, startDownload]);

  const removeProcess = useCallback(
    async (id: string) => {
      const tasks = await BackGroundDownloader.checkForExistingDownloads();
      const task = tasks?.find((t) => t.id === id);
      task?.stop();
      BackGroundDownloader.completeHandler(id);
      setProcesses((prev) => prev.filter((process) => process.id !== id));
      manageDownloadQueue();
    },
    [setProcesses, manageDownloadQueue],
  );

  useEffect(() => {
    manageDownloadQueue();
  }, [processes, manageDownloadQueue]);

  /**
   * Cleans the cache directory.
   */
  const cleanCacheDirectory = async (): Promise<void> => {
    try {
      await FileSystem.deleteAsync(APP_CACHE_DOWNLOAD_DIRECTORY, {
        idempotent: true,
      });
      await FileSystem.makeDirectoryAsync(APP_CACHE_DOWNLOAD_DIRECTORY, {
        intermediates: true,
      });
    } catch (_error) {
      toast.error(t("Failed to clean cache directory."));
    }
  };

  const startBackgroundDownload = useCallback(
    async (
      url: string,
      item: BaseItemDto,
      mediaSource: MediaSourceInfo,
      maxBitrate: Bitrate,
    ) => {
      if (!api || !item.Id || !authHeader)
        throw new Error("startBackgroundDownload ~ Missing required params");
      try {
        const deviceId = getOrSetDeviceId();
        await saveSeriesPrimaryImage(item);
        const itemImage = getItemImage({
          item,
          api,
          variant: "Primary",
          quality: 90,
          width: 500,
        });
        await saveImage(item.Id, itemImage?.uri);
        const job: JobStatus = {
          id: item.Id!,
          deviceId: deviceId,
          maxBitrate,
          inputUrl: url,
          item: item,
          itemId: item.Id!,
          mediaSource,
          progress: 0,
          status: "queued",
          timestamp: new Date(),
        };
        setProcesses((prev) => [...prev, job]);
        toast.success(
          t("home.downloads.toasts.download_stated_for_item", {
            item: item.Name,
          }),
          {
            action: {
              label: t("home.downloads.toasts.go_to_downloads"),
              onClick: () => {
                router.push("/downloads");
                toast.dismiss();
              },
            },
          },
        );
      } catch (error) {
        writeToLog("ERROR", "Error in startBackgroundDownload", error);
      }
    },
    [authHeader, startDownload],
  );

  const deleteFile = async (id: string, type: "Movie" | "Episode") => {
    const db = getDownloadsDatabase();
    let downloadedItem: DownloadedItem | undefined;

    if (type === "Movie") {
      downloadedItem = db.movies[id];
      if (downloadedItem) {
        delete db.movies[id];
      }
    } else if (type === "Episode") {
      const cleanUpEmptyParents = (
        series: any,
        seasonNumber: string,
        seriesId: string,
      ) => {
        if (!Object.keys(series.seasons[seasonNumber].episodes).length) {
          delete series.seasons[seasonNumber];
        }
        if (!Object.keys(series.seasons).length) {
          delete db.series[seriesId];
        }
      };

      for (const [seriesId, series] of Object.entries(db.series)) {
        for (const [seasonNumber, season] of Object.entries(series.seasons)) {
          for (const [episodeNumber, episode] of Object.entries(
            season.episodes,
          )) {
            if (episode.item.Id === id) {
              downloadedItem = episode;
              delete season.episodes[Number(episodeNumber)];
              cleanUpEmptyParents(series, seasonNumber, seriesId);
              break;
            }
          }
          if (downloadedItem) break;
        }
        if (downloadedItem) break;
      }
    }

    if (downloadedItem?.videoFilePath) {
      await FileSystem.deleteAsync(downloadedItem.videoFilePath, {
        idempotent: true,
      });
    }

    if (downloadedItem?.mediaSource?.MediaStreams) {
      for (const stream of downloadedItem.mediaSource.MediaStreams) {
        if (
          stream.Type === "Subtitle" &&
          stream.DeliveryMethod === "External"
        ) {
          await FileSystem.deleteAsync(stream.DeliveryUrl!, {
            idempotent: true,
          });
        }
      }
    }

    if (downloadedItem?.trickPlayData?.path) {
      await FileSystem.deleteAsync(downloadedItem.trickPlayData.path, {
        idempotent: true,
      });
    }

    await saveDownloadsDatabase(db);
    successHapticFeedback();
  };

  const deleteItems = async (items: BaseItemDto[]) => {
    for (const item of items) {
      if (item.Id && (item.Type === "Movie" || item.Type === "Episode")) {
        await deleteFile(item.Id, item.Type);
      }
    }
  };

  /** Deletes all files */
  const deleteAllFiles = async (): Promise<void> => {
    await deleteFileByType("Movie");
    await deleteFileByType("Episode");
    toast.success(
      t(
        "home.downloads.toasts.all_files_folders_and_jobs_deleted_successfully",
      ),
    );
  };

  /** Deletes all files of a given type. */
  const deleteFileByType = async (type: BaseItemDto["Type"]) => {
    const itemsToDelete = downloadedItems?.filter(
      (file) => file.item.Type === type,
    );
    if (itemsToDelete) await deleteItems(itemsToDelete.map((i) => i.item));
  };

  /** Returns the size of a downloaded item. */
  const getDownloadedItemSize = (itemId: string): number => {
    const downloadedItem = getDownloadedItemById(itemId);
    if (!downloadedItem) return 0;

    const trickplaySize = downloadedItem.trickPlayData?.size || 0;
    return downloadedItem.videoFileSize + trickplaySize;
  };

  /** Updates a downloaded item. */
  const updateDownloadedItem = (
    itemId: string,
    updatedItem: DownloadedItem,
  ) => {
    const db = getDownloadsDatabase();
    if (db.movies[itemId]) {
      db.movies[itemId] = updatedItem;
    } else {
      for (const series of Object.values(db.series)) {
        for (const season of Object.values(series.seasons)) {
          for (const episode of Object.values(season.episodes)) {
            if (episode.item.Id === itemId) {
              season.episodes[episode.item.IndexNumber as number] = updatedItem;
            }
          }
        }
      }
    }
    saveDownloadsDatabase(db);
  };

  /**
   * Returns the size of the app and the remaining space on the device.
   * @returns The size of the app and the remaining space on the device.
   */
  const appSizeUsage = async () => {
    const [total, remaining] = await Promise.all([
      FileSystem.getTotalDiskCapacityAsync(),
      FileSystem.getFreeDiskStorageAsync(),
    ]);

    let appSize = 0;
    const downloadedFiles = await FileSystem.readDirectoryAsync(
      `${FileSystem.documentDirectory!}`,
    );
    for (const file of downloadedFiles) {
      const fileInfo = await FileSystem.getInfoAsync(
        `${FileSystem.documentDirectory!}${file}`,
      );
      if (fileInfo.exists) {
        appSize += fileInfo.size;
      }
    }
    return { total, remaining, appSize: appSize };
  };

  return {
    processes,
    startBackgroundDownload,
    getDownloadedItems,
    getDownloadsDatabase,
    deleteAllFiles,
    deleteFile,
    deleteItems,
    removeProcess,
    startDownload,
    deleteFileByType,
    getDownloadedItemSize,
    getDownloadedItemById,
    APP_CACHE_DOWNLOAD_DIRECTORY,
    cleanCacheDirectory,
    updateDownloadedItem,
    appSizeUsage,
  };
}

export function useDownload() {
  const context = useContext(DownloadContext);

  if (Platform.isTV) {
    // Since tv doesn't do downloads, just return no-op functions for everything
    return {
      processes: [],
      startBackgroundDownload: async () => {},
      getDownloadedItems: () => [],
      getDownloadsDatabase: () => ({}),
      deleteAllFiles: async () => {},
      deleteFile: async () => {},
      deleteItems: async () => {},
      removeProcess: () => {},
      startDownload: async () => {},
      deleteFileByType: async () => {},
      getDownloadedItemSize: () => 0,
      getDownloadedItemById: () => undefined,
      APP_CACHE_DOWNLOAD_DIRECTORY: "",
      cleanCacheDirectory: async () => {},
      updateDownloadedItem: () => {},
      appSizeUsage: async () => ({ total: 0, remaining: 0, appSize: 0 }),
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

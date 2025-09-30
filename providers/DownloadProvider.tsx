import type {
  BaseItemDto,
  MediaSourceInfo,
} from "@jellyfin/sdk/lib/generated-client/models";
import * as Application from "expo-application";
import * as FileSystem from "expo-file-system";
import * as Notifications from "expo-notifications";
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
import { useSettings } from "@/utils/atoms/settings";
import { getOrSetDeviceId } from "@/utils/device";
import useDownloadHelper from "@/utils/download";
import { getItemImage } from "@/utils/getItemImage";
import { dumpDownloadDiagnostics, writeToLog } from "@/utils/log";
import { storage } from "@/utils/mmkv";
import { fetchAndParseSegments } from "@/utils/segments";
import { generateTrickplayUrl, getTrickplayInfo } from "@/utils/trickplay";
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

// Cap progress at 99% to avoid showing 100% before the download is actually complete
const MAX_PROGRESS_BEFORE_COMPLETION = 99;

// Estimate the total download size in bytes for a job. If the media source
// provides a Size, use that. Otherwise, if we have a bitrate and run time
// (RunTimeTicks), approximate size = (bitrate bits/sec * seconds) / 8.
const calculateEstimatedSize = (p: JobStatus): number => {
  const size = p.mediaSource?.Size || 0;
  const maxBitrate = p.maxBitrate?.value;
  const runTimeTicks = (p.item?.RunTimeTicks || 0) as number;

  if (!size && maxBitrate && runTimeTicks > 0) {
    // Jellyfin RunTimeTicks are in 10,000,000 ticks per second
    const seconds = runTimeTicks / 10000000;
    if (seconds > 0) {
      // maxBitrate is in bits per second; convert to bytes
      return Math.round((maxBitrate / 8) * seconds);
    }
  }

  return size || 0;
};

// Calculate download speed in bytes/sec based on a job's last update time
// and previously recorded bytesDownloaded.
const calculateSpeed = (
  p: JobStatus,
  currentBytesDownloaded?: number,
): number | undefined => {
  // Prefer session-only deltas when available: lastSessionBytes + lastSessionUpdateTime
  const now = Date.now();

  if (p.lastSessionUpdateTime && p.lastSessionBytes !== undefined) {
    const last = new Date(p.lastSessionUpdateTime).getTime();
    const deltaTime = (now - last) / 1000;
    if (deltaTime > 0) {
      const current =
        currentBytesDownloaded ?? p.bytesDownloaded ?? p.lastSessionBytes;
      const deltaBytes = current - p.lastSessionBytes;
      if (deltaBytes > 0) return deltaBytes / deltaTime;
    }
  }

  // Fallback to total-based deltas for compatibility
  if (!p.lastProgressUpdateTime || p.bytesDownloaded === undefined)
    return undefined;
  const last = new Date(p.lastProgressUpdateTime).getTime();
  const deltaTime = (now - last) / 1000;
  if (deltaTime <= 0) return undefined;
  const prev = p.bytesDownloaded || 0;
  const current = currentBytesDownloaded ?? prev;
  const deltaBytes = current - prev;
  if (deltaBytes <= 0) return undefined;
  return deltaBytes / deltaTime;
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
  const { settings } = useSettings();
  const successHapticFeedback = useHaptic("success");

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
      } else {
        // Fallback for other types
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
      }
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
          trigger: null, // Show immediately
        });
      } catch (error) {
        console.error("Failed to send notification:", error);
      }
    },
    [],
  );

  /// Cant use the background downloader callback. As its not triggered if size is unknown.
  const updateProgress = async () => {
    const tasks = await BackGroundDownloader.checkForExistingDownloads();
    if (!tasks) {
      return;
    }
    // check if processes are missing
    setProcesses((processes) => {
      const missingProcesses = tasks
        .filter((t: any) => t.metadata && !processes.some((p) => p.id === t.id))
        .map((t: any) => {
          return t.metadata as JobStatus;
        });

      const currentProcesses = [...processes, ...missingProcesses];
      const updatedProcesses = currentProcesses.map((p) => {
        // Enhanced filtering to prevent iOS zombie task interference
        // Only update progress for downloads that are actively downloading
        if (p.status !== "downloading") {
          return p;
        }

        // Find task for this process
        const task = tasks.find((s: any) => s.id === p.id);
        if (!task) {
          return p; // No task found, keep current state
        }

        /* 
        // TODO: Uncomment this block to re-enable iOS zombie task detection
        // iOS: Extra validation to prevent zombie task interference
        if (Platform.OS === "ios") {
          // Check if we have multiple tasks for same ID (zombie detection)
          const tasksForId = tasks.filter((t: any) => t.id === p.id);
          if (tasksForId.length > 1) {
            console.warn(
              `[UPDATE] Detected ${tasksForId.length} zombie tasks for ${p.id}, ignoring progress update`,
            );
            return p; // Don't update progress from potentially conflicting tasks
          }

          // If task state looks suspicious (e.g., iOS task stuck in background), be conservative
          if (
            task.state &&
            ["SUSPENDED", "PAUSED"].includes(task.state) &&
            p.status === "downloading"
          ) {
            console.warn(
              `[UPDATE] Task ${p.id} has suspicious state ${task.state}, ignoring progress update`,
            );
            return p;
          }
        }
        */

        if (task && p.status === "downloading") {
          const estimatedSize = calculateEstimatedSize(p);
          let progress = p.progress;

          // If we have a pausedProgress snapshot then merge current session
          // progress into it. We accept pausedProgress === 0 as valid because
          // users can pause immediately after starting.
          if (p.pausedProgress !== undefined) {
            const totalBytesDownloaded =
              (p.pausedBytes ?? 0) + task.bytesDownloaded;

            // Calculate progress based on total bytes downloaded vs estimated size
            progress =
              estimatedSize > 0
                ? (totalBytesDownloaded / estimatedSize) * 100
                : 0;

            // Use the total accounted bytes when computing speed so the
            // displayed speed and progress remain consistent after resume.
            const speed = calculateSpeed(p, totalBytesDownloaded);

            return {
              ...p,
              progress: Math.min(progress, MAX_PROGRESS_BEFORE_COMPLETION),
              speed,
              bytesDownloaded: totalBytesDownloaded,
              lastProgressUpdateTime: new Date(),
              estimatedTotalSizeBytes: estimatedSize,
              // Set session bytes to total bytes downloaded
              lastSessionBytes: totalBytesDownloaded,
              lastSessionUpdateTime: new Date(),
            };
          } else {
            if (estimatedSize > 0) {
              progress = (100 / estimatedSize) * task.bytesDownloaded;
            }
            if (progress >= 100) {
              progress = MAX_PROGRESS_BEFORE_COMPLETION;
            }
            const speed = calculateSpeed(p, task.bytesDownloaded);
            return {
              ...p,
              progress,
              speed,
              bytesDownloaded: task.bytesDownloaded,
              lastProgressUpdateTime: new Date(),
              estimatedTotalSizeBytes: estimatedSize,
              lastSessionBytes: task.bytesDownloaded,
              lastSessionUpdateTime: new Date(),
            };
          }
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

    // Check episodes
    for (const series of Object.values(db.series)) {
      for (const season of Object.values(series.seasons)) {
        for (const episode of Object.values(season.episodes)) {
          if (episode.item.Id === id) {
            return episode;
          }
        }
      }
    }

    // Check other media types
    if (db.other[id]) {
      return db.other[id];
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
    return { movies: {}, series: {}, other: {} }; // Initialize other media types storage
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
      ...Object.values(db.other), // Include other media types in results
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

      // Enhanced cleanup for existing tasks to prevent duplicates
      try {
        const allTasks = await BackGroundDownloader.checkForExistingDownloads();
        const existingTasks = allTasks?.filter((t: any) => t.id === process.id);

        if (existingTasks && existingTasks.length > 0) {
          console.log(
            `[START] Found ${existingTasks.length} existing task(s) for ${process.id}, cleaning up...`,
          );

          for (let i = 0; i < existingTasks.length; i++) {
            const existingTask = existingTasks[i];
            console.log(
              `[START] Cleaning up task ${i + 1}/${existingTasks.length} for ${process.id}`,
            );

            try {
              /* 
              // TODO: Uncomment this block to re-enable iOS-specific cleanup
              // iOS: More aggressive cleanup sequence
              if (Platform.OS === "ios") {
                try {
                  await existingTask.pause();
                  await new Promise((resolve) => setTimeout(resolve, 50));
                } catch (_pauseErr) {
                  // Ignore pause errors
                }

                await existingTask.stop();
                await new Promise((resolve) => setTimeout(resolve, 50));

                // Multiple complete handler calls to ensure cleanup
                BackGroundDownloader.completeHandler(process.id);
                await new Promise((resolve) => setTimeout(resolve, 25));
              } else {
              */

              // Simple cleanup for all platforms (currently Android only)
              await existingTask.stop();
              BackGroundDownloader.completeHandler(process.id);

              /* } // End of iOS block - uncomment when re-enabling iOS functionality */

              console.log(
                `[START] Successfully cleaned up task ${i + 1} for ${process.id}`,
              );
            } catch (taskError) {
              console.warn(
                `[START] Failed to cleanup task ${i + 1} for ${process.id}:`,
                taskError,
              );
            }
          }

          // Cleanup delay (simplified for Android)
          const cleanupDelay = 200; // Platform.OS === "ios" ? 500 : 200;
          await new Promise((resolve) => setTimeout(resolve, cleanupDelay));
          console.log(`[START] Cleanup completed for ${process.id}`);
        }
      } catch (error) {
        console.warn(
          `[START] Failed to check/cleanup existing tasks for ${process.id}:`,
          error,
        );
      }

      updateProcess(process.id, {
        speed: undefined,
        status: "downloading",
        progress: process.progress || 0, // Preserve existing progress for resume
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
            progress: process.progress || 0,
            bytesDownloaded: process.bytesDownloaded || 0,
            lastProgressUpdateTime: new Date(),
            lastSessionBytes: process.lastSessionBytes || 0,
            lastSessionUpdateTime: new Date(),
          });
        })
        .progress(
          throttle((data) => {
            updateProcess(process.id, (currentProcess) => {
              // If this is a resumed download, add the paused bytes to current session bytes
              const resumedBytes = currentProcess.pausedBytes || 0;
              const totalBytes = data.bytesDownloaded + resumedBytes;

              // Calculate progress based on total bytes if we have resumed bytes
              let percent: number;
              if (resumedBytes > 0 && data.bytesTotal > 0) {
                // For resumed downloads, calculate based on estimated total size
                const estimatedTotal =
                  currentProcess.estimatedTotalSizeBytes ||
                  data.bytesTotal + resumedBytes;
                percent = (totalBytes / estimatedTotal) * 100;
              } else {
                // For fresh downloads, use normal calculation
                percent = (data.bytesDownloaded / data.bytesTotal) * 100;
              }

              return {
                speed: calculateSpeed(currentProcess, totalBytes),
                status: "downloading",
                progress: Math.min(percent, MAX_PROGRESS_BEFORE_COMPLETION),
                bytesDownloaded: totalBytes,
                lastProgressUpdateTime: new Date(),
                // update session-only counters - use current session bytes only for speed calc
                lastSessionBytes: data.bytesDownloaded,
                lastSessionUpdateTime: new Date(),
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
          } else if (item.Id) {
            // Handle other media types
            db.other[item.Id] = downloadedItem;
          }
          await saveDownloadsDatabase(db);

          // Send native notification for successful download
          const successNotification = getNotificationContent(
            process.item,
            true,
          );
          await sendDownloadNotification(
            successNotification.title,
            successNotification.body,
            {
              itemId: process.item.Id,
              itemName: process.item.Name,
              type: "download_completed",
            },
          );

          toast.success(
            t("home.downloads.toasts.download_completed_for_item", {
              item: process.item.Name,
            }),
          );
          removeProcess(process.id);
        })
        .error(async (error: any) => {
          console.error("Download error:", error);

          // Send native notification for failed download
          const failureNotification = getNotificationContent(
            process.item,
            false,
          );
          await sendDownloadNotification(
            failureNotification.title,
            failureNotification.body,
            {
              itemId: process.item.Id,
              itemName: process.item.Name,
              type: "download_failed",
              error: error?.message || "Unknown error",
            },
          );

          toast.error(
            t("home.downloads.toasts.download_failed_for_item", {
              item: process.item.Name,
            }),
          );
          removeProcess(process.id);
        });
    },
    [authHeader, sendDownloadNotification, getNotificationContent],
  );

  const manageDownloadQueue = useCallback(() => {
    const activeDownloads = processes.filter(
      (p) => p.status === "downloading",
    ).length;
    const concurrentLimit = settings?.remuxConcurrentLimit || 1;
    if (activeDownloads < concurrentLimit) {
      const queuedDownload = processes.find((p) => p.status === "queued");
      if (queuedDownload) {
        // Reserve the slot immediately to avoid race where startDownload's
        // asynchronous begin callback hasn't executed yet and multiple
        // downloads are started, bypassing the concurrent limit.
        updateProcess(queuedDownload.id, { status: "downloading" });
        startDownload(queuedDownload).catch((error) => {
          console.error("Failed to start download:", error);
          updateProcess(queuedDownload.id, { status: "error" });
          toast.error(t("home.downloads.toasts.failed_to_start_download"), {
            description: error.message || "Unknown error",
          });
        });
      }
    }
  }, [processes, settings?.remuxConcurrentLimit, startDownload]);

  const removeProcess = useCallback(
    async (id: string) => {
      const tasks = await BackGroundDownloader.checkForExistingDownloads();
      const task = tasks?.find((t: any) => t.id === id);
      if (task) {
        // On iOS, suspended tasks need to be cancelled properly
        if (Platform.OS === "ios") {
          const state = task.state || task.state?.();
          if (
            state === "PAUSED" ||
            state === "paused" ||
            state === "SUSPENDED" ||
            state === "suspended"
          ) {
            // For suspended tasks, we need to resume first, then stop
            try {
              await task.resume();
              // Small delay to allow resume to take effect
              await new Promise((resolve) => setTimeout(resolve, 100));
            } catch (_resumeError) {
              // Resume might fail, continue with stop
            }
          }
        }

        try {
          task.stop();
        } catch (_err) {
          // ignore stop errors
        }
        try {
          BackGroundDownloader.completeHandler(id);
        } catch (_err) {
          // ignore
        }
      }
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
      toast.error(t("home.downloads.toasts.failed_to_clean_cache_directory"));
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
        setProcesses((prev) => {
          // Remove any existing processes for this item to prevent duplicates
          const filtered = prev.filter((p) => p.id !== item.Id);
          return [...filtered, job];
        });
        toast.success(
          t("home.downloads.toasts.download_started_for_item", {
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

  const deleteFile = async (id: string, type: BaseItemDto["Type"]) => {
    const db = getDownloadsDatabase();
    let downloadedItem: DownloadedItem | undefined;

    if (type === "Movie" && Object.entries(db.movies).length !== 0) {
      downloadedItem = db.movies[id];
      if (downloadedItem) {
        delete db.movies[id];
      }
    } else if (type === "Episode" && Object.entries(db.series).length !== 0) {
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
    } else {
      // Handle other media types
      downloadedItem = db.other[id];
      if (downloadedItem) {
        delete db.other[id];
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
      if (item.Id) {
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
    } else if (db.other[itemId]) {
      db.other[itemId] = updatedItem;
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

  const pauseDownload = useCallback(
    async (id: string) => {
      const process = processes.find((p) => p.id === id);
      if (!process) throw new Error("No active download");

      // TODO: iOS pause functionality temporarily disabled due to background task issues
      // Remove this check to re-enable iOS pause functionality in the future
      if (Platform.OS === "ios") {
        console.warn(
          `[PAUSE] Pause functionality temporarily disabled on iOS for ${id}`,
        );
        throw new Error("Pause functionality is currently disabled on iOS");
      }

      const tasks = await BackGroundDownloader.checkForExistingDownloads();
      const task = tasks?.find((t: any) => t.id === id);
      if (!task) throw new Error("No task found");

      // Get current progress before stopping
      const currentProgress = process.progress;
      const currentBytes = process.bytesDownloaded || task.bytesDownloaded || 0;

      console.log(
        `[PAUSE] Starting pause for ${id}. Current bytes: ${currentBytes}, Progress: ${currentProgress}%`,
      );

      try {
        /* 
        // TODO: Uncomment this block to re-enable iOS pause functionality
        // iOS-specific aggressive cleanup approach based on GitHub issue #26
        if (Platform.OS === "ios") {
          // Get ALL tasks for this ID - there might be multiple zombie tasks
          const allTasks =
            await BackGroundDownloader.checkForExistingDownloads();
          const tasksForId = allTasks?.filter((t: any) => t.id === id) || [];

          console.log(`[PAUSE] Found ${tasksForId.length} task(s) for ${id}`);

          // Stop ALL tasks for this ID to prevent zombie processes
          for (let i = 0; i < tasksForId.length; i++) {
            const taskToStop = tasksForId[i];
            console.log(
              `[PAUSE] Stopping task ${i + 1}/${tasksForId.length} for ${id}`,
            );

            try {
              // iOS: pause → stop sequence with delays (based on issue research)
              await taskToStop.pause();
              await new Promise((resolve) => setTimeout(resolve, 100));

              await taskToStop.stop();
              await new Promise((resolve) => setTimeout(resolve, 100));

              console.log(
                `[PAUSE] Successfully stopped task ${i + 1} for ${id}`,
              );
            } catch (taskError) {
              console.warn(
                `[PAUSE] Failed to stop task ${i + 1} for ${id}:`,
                taskError,
              );
            }
          }

          // Extra cleanup delay for iOS NSURLSession to fully stop
          await new Promise((resolve) => setTimeout(resolve, 500));
        } else {
        */

        // Android: simpler approach (currently the only active platform)
        await task.stop();

        /* } // End of iOS block - uncomment when re-enabling iOS functionality */

        // Clean up the native task handler
        try {
          BackGroundDownloader.completeHandler(id);
        } catch (_err) {
          console.warn(`[PAUSE] Handler cleanup warning for ${id}:`, _err);
        }

        // Update process state to paused
        updateProcess(id, {
          status: "paused",
          progress: currentProgress,
          bytesDownloaded: currentBytes,
          pausedAt: new Date(),
          pausedProgress: currentProgress,
          pausedBytes: currentBytes,
          lastSessionBytes: process.lastSessionBytes ?? currentBytes,
          lastSessionUpdateTime: process.lastSessionUpdateTime ?? new Date(),
        });

        console.log(`Download paused successfully: ${id}`);
      } catch (error) {
        console.error("Error pausing task:", error);
        throw error;
      }
    },
    [processes, updateProcess],
  );

  const resumeDownload = useCallback(
    async (id: string) => {
      const process = processes.find((p) => p.id === id);
      if (!process) throw new Error("No active download");

      // TODO: iOS resume functionality temporarily disabled due to background task issues
      // Remove this check to re-enable iOS resume functionality in the future
      if (Platform.OS === "ios") {
        console.warn(
          `[RESUME] Resume functionality temporarily disabled on iOS for ${id}`,
        );
        throw new Error("Resume functionality is currently disabled on iOS");
      }

      console.log(
        `[RESUME] Attempting to resume ${id}. Paused bytes: ${process.pausedBytes}, Progress: ${process.pausedProgress}%`,
      );

      /* 
      // TODO: Uncomment this block to re-enable iOS resume functionality
      // Enhanced cleanup for iOS based on GitHub issue research
      if (Platform.OS === "ios") {
        try {
          // Clean up any lingering zombie tasks first (critical for iOS)
          const allTasks =
            await BackGroundDownloader.checkForExistingDownloads();
          const existingTasks = allTasks?.filter((t: any) => t.id === id) || [];

          if (existingTasks.length > 0) {
            console.log(
              `[RESUME] Found ${existingTasks.length} lingering task(s), cleaning up...`,
            );

            for (const task of existingTasks) {
              try {
                await task.stop();
                BackGroundDownloader.completeHandler(id);
              } catch (cleanupError) {
                console.warn(`[RESUME] Cleanup error:`, cleanupError);
              }
            }

            // Wait for iOS cleanup to complete
            await new Promise((resolve) => setTimeout(resolve, 500));
          }
        } catch (error) {
          console.warn(`[RESUME] Pre-resume cleanup failed:`, error);
        }
      }
      */

      // Simple approach: always restart the download from where we left off
      // This works consistently across all platforms (currently Android only)
      if (
        process.pausedProgress !== undefined &&
        process.pausedBytes !== undefined
      ) {
        // We have saved pause state - restore it and restart
        updateProcess(id, {
          progress: process.pausedProgress,
          bytesDownloaded: process.pausedBytes,
          status: "downloading",
          // Reset session counters for proper speed calculation
          lastSessionBytes: process.pausedBytes,
          lastSessionUpdateTime: new Date(),
        });

        // Small delay to ensure any cleanup in startDownload completes
        await new Promise((resolve) => setTimeout(resolve, 100));

        const updatedProcess = processes.find((p) => p.id === id);
        await startDownload(updatedProcess || process);

        console.log(`Download resumed successfully: ${id}`);
      } else {
        // No pause state - start from beginning
        await startDownload(process);
      }
    },
    [processes, updateProcess, startDownload],
  );

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
    pauseDownload,
    resumeDownload,
    deleteFileByType,
    getDownloadedItemSize,
    getDownloadedItemById,
    APP_CACHE_DOWNLOAD_DIRECTORY,
    cleanCacheDirectory,
    updateDownloadedItem,
    appSizeUsage,
    dumpDownloadDiagnostics: async (id?: string) => {
      // Collect JS-side processes and native task info (best-effort)
      const tasks = BackGroundDownloader
        ? await BackGroundDownloader.checkForExistingDownloads()
        : [];
      const extra: any = {
        processes,
        nativeTasks: tasks || [],
      };
      if (id) {
        const p = processes.find((x) => x.id === id);
        extra.focusedProcess = p || null;
      }
      return dumpDownloadDiagnostics(extra);
    },
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
      pauseDownload: async () => {},
      resumeDownload: async () => {},
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

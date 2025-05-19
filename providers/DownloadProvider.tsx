import { useHaptic } from "@/hooks/useHaptic";
import useImageStorage from "@/hooks/useImageStorage";
import { useInterval } from "@/hooks/useInterval";
import { DownloadMethod, useSettings } from "@/utils/atoms/settings";
import { getOrSetDeviceId } from "@/utils/device";
import useDownloadHelper from "@/utils/download";
import { getItemImage } from "@/utils/getItemImage";
import { useLog, writeToLog } from "@/utils/log";
import { storage } from "@/utils/mmkv";
import {
  type JobStatus,
  cancelAllJobs,
  cancelJobById,
  deleteDownloadItemInfoFromDiskTmp,
  getAllJobsByDeviceId,
  getDownloadItemInfoFromDiskTmp,
} from "@/utils/optimize-server";
import type {
  BaseItemDto,
  MediaSourceInfo,
} from "@jellyfin/sdk/lib/generated-client/models";
import { getSessionApi } from "@jellyfin/sdk/lib/utils/api/session-api";
import BackGroundDownloader from "@kesha-antonov/react-native-background-downloader";
import { focusManager, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import * as Application from "expo-application";
import * as FileSystem from "expo-file-system";
import type { FileInfo } from "expo-file-system";
import Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { atom, useAtom } from "jotai";
import type React from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
} from "react";
import { useTranslation } from "react-i18next";
import { AppState, type AppStateStatus, Platform } from "react-native";
import { toast } from "sonner-native";
import { Bitrate } from "../components/BitrateSelector";
import { apiAtom } from "./JellyfinProvider";

export type DownloadedItem = {
  item: Partial<BaseItemDto>;
  mediaSource: MediaSourceInfo;
};

export const processesAtom = atom<JobStatus[]>([]);

function onAppStateChange(status: AppStateStatus) {
  focusManager.setFocused(status === "active");
}

const DownloadContext = createContext<ReturnType<
  typeof useDownloadProvider
> | null>(null);

function useDownloadProvider() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const [settings] = useSettings();
  const router = useRouter();
  const [api] = useAtom(apiAtom);
  const { logs } = useLog();

  const { saveSeriesPrimaryImage } = useDownloadHelper();
  const { saveImage } = useImageStorage();

  let [processes, setProcesses] = useAtom<JobStatus[]>(processesAtom);

  const successHapticFeedback = useHaptic("success");

  const authHeader = useMemo(() => {
    return api?.accessToken;
  }, [api]);

  const usingOptimizedServer = useMemo(
    () => settings?.downloadMethod === DownloadMethod.Optimized,
    [settings],
  );

  const getDownloadUrl = (process: JobStatus) => {
    return usingOptimizedServer
      ? `${settings.optimizedVersionsServerUrl}download/${process.id}`
      : process.inputUrl;
  };

  const { data: downloadedFiles, refetch } = useQuery({
    queryKey: ["downloadedItems"],
    queryFn: getAllDownloadedItems,
    staleTime: 0,
    refetchOnMount: true,
    refetchOnReconnect: true,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    const subscription = AppState.addEventListener("change", onAppStateChange);

    return () => subscription.remove();
  }, []);

  useQuery({
    queryKey: ["jobs"],
    queryFn: async () => {
      const deviceId = await getOrSetDeviceId();
      const url = settings?.optimizedVersionsServerUrl;

      if (
        settings?.downloadMethod !== DownloadMethod.Optimized ||
        !url ||
        !deviceId ||
        !authHeader
      )
        return [];

      const jobs = await getAllJobsByDeviceId({
        deviceId,
        authHeader,
        url,
      });

      const downloadingProcesses = processes
        .filter((p) => p.status === "downloading")
        .filter((p) => jobs.some((j) => j.id === p.id));

      const updatedProcesses = jobs.filter(
        (j) => !downloadingProcesses.some((p) => p.id === j.id),
      );

      setProcesses([...updatedProcesses, ...downloadingProcesses]);

      for (const job of jobs) {
        const process = processes.find((p) => p.id === job.id);
        if (
          process &&
          process.status === "optimizing" &&
          job.status === "completed"
        ) {
          if (settings.autoDownload) {
            startDownload(job);
          } else {
            toast.info(
              t("home.downloads.toasts.item_is_ready_to_be_downloaded", {
                item: job.item.Name,
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
            Notifications.scheduleNotificationAsync({
              content: {
                title: job.item.Name,
                body: `${job.item.Name} is ready to be downloaded`,
                data: {
                  url: "/downloads",
                },
              },
              trigger: null,
            });
          }
        }
      }

      return jobs;
    },
    staleTime: 0,
    refetchInterval: 2000,
    enabled: settings?.downloadMethod === DownloadMethod.Optimized,
  });

  /// Cant use the background downloader callback. As its not triggered if size is unknown.
  const updateProgress = async () => {
    if (settings?.downloadMethod === DownloadMethod.Optimized) {
      return;
    }

    // const response = await getSessionApi(api).getSessions({
    //   activeWithinSeconds: 300,
    // });

    const tasks = await BackGroundDownloader.checkForExistingDownloads();

    // check if processes are missing
    const missingProcesses = tasks
      .filter((t) => !processes.some((p) => p.id === t.id))
      .map((t) => {
        return t.metadata;
      });

    processes = [...processes, ...missingProcesses];

    const updatedProcesses = processes.map((p) => {
      // const result = response.data.find((s) => s.Id == p.sessionId);
      // if (result) {
      //   return {
      //     ...p,
      //     progress: result.TranscodingInfo?.CompletionPercentage,
      //   };
      // }

      // fallback. Doesn't really work for transcodes as they may be a lot smaller.
      // We make an wild guess by comparing bitrates
      const task = tasks.find((s) => s.id === p.id);
      if (task) {
        let progress = p.progress;
        let size = p.mediaSource.Size;
        const maxBitrate = p.maxBitrate.value;
        if (maxBitrate && maxBitrate < p.mediaSource.Bitrate) {
          size = (size / p.mediaSource.Bitrate) * maxBitrate;
        }
        progress = (100 / size) * task.bytesDownloaded;
        if (progress >= 100) {
          progress = 99;
        }

        return {
          ...p,
          progress,
        };
      }
      return p;
    });

    setProcesses(updatedProcesses);
  };

  useInterval(updateProgress, 2000);

  useEffect(() => {
    const checkIfShouldStartDownload = async () => {
      if (processes.length === 0) return;
      await BackGroundDownloader?.checkForExistingDownloads();
    };

    checkIfShouldStartDownload();
  }, [settings, processes]);

  const removeProcess = useCallback(
    async (id: string) => {
      const deviceId = await getOrSetDeviceId();
      if (!deviceId || !authHeader) return;

      if (usingOptimizedServer) {
        try {
          await cancelJobById({
            authHeader,
            id,
            url: settings?.optimizedVersionsServerUrl,
          });
        } catch (error) {
          console.error(error);
        }
      }

      setProcesses((prev: any[]) => {
        return prev.filter(
          (process: { itemId: string | undefined }) => process.id !== id,
        );
      });
    },
    [settings?.optimizedVersionsServerUrl, authHeader],
  );

  const APP_CACHE_DOWNLOAD_DIRECTORY = `${FileSystem.cacheDirectory}${Application.applicationId}/Downloads/`;

  const startDownload = useCallback(
    async (process: JobStatus) => {
      if (!process?.item.Id || !authHeader) throw new Error("No item id");

      setProcesses((prev) =>
        prev.map((p) =>
          p.id === process.id
            ? {
                ...p,
                speed: undefined,
                status: "downloading",
                progress: 0,
              }
            : p,
        ),
      );

      BackGroundDownloader?.setConfig({
        isLogsEnabled: true,
        progressInterval: 500,
        headers: {
          Authorization: authHeader,
        },
      });

      toast.info(
        t("home.downloads.toasts.download_stated_for_item", {
          item: process.item.Name,
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

      const baseDirectory = FileSystem.documentDirectory;

      BackGroundDownloader?.download({
        id: process.id,
        url: getDownloadUrl(process),
        destination: `${baseDirectory}/${process.item.Id}.mp4`,
        metadata: process,
      })
        .begin(() => {
          setProcesses((prev) =>
            prev.map((p) =>
              p.id === process.id
                ? {
                    ...p,
                    speed: undefined,
                    status: "downloading",
                    progress: 0,
                  }
                : p,
            ),
          );
        })
        .progress((data) => {
          if (!usingOptimizedServer) {
            return;
          }
          const percent = (data.bytesDownloaded / data.bytesTotal) * 100;
          setProcesses((prev) =>
            prev.map((p) =>
              p.id === process.id
                ? {
                    ...p,
                    speed: undefined,
                    status: "downloading",
                    progress: percent,
                  }
                : p,
            ),
          );
        })
        .done(async (doneHandler) => {
          await saveDownloadedItemInfo(
            process.item,
            doneHandler.bytesDownloaded,
          );
          toast.success(
            t("home.downloads.toasts.download_completed_for_item", {
              item: process.item.Name,
            }),
            {
              duration: 3000,
              action: {
                label: t("home.downloads.toasts.go_to_downloads"),
                onClick: () => {
                  router.push("/downloads");
                  toast.dismiss();
                },
              },
            },
          );
          setTimeout(() => {
            BackGroundDownloader.completeHandler(process.id);
            removeProcess(process.id);
          }, 1000);
        })
        .error(async (error) => {
          removeProcess(process.id);
          BackGroundDownloader.completeHandler(process.id);
          let errorMsg = "";
          if (error.errorCode === 1000) {
            errorMsg = "No space left";
          }
          if (error.errorCode === 404) {
            errorMsg = "File not found on server";
          }
          toast.error(
            t("home.downloads.toasts.download_failed_for_item", {
              item: process.item.Name,
              error: errorMsg,
            }),
          );
          writeToLog("ERROR", `Download failed for ${process.item.Name}`, {
            error,
            processDetails: {
              id: process.id,
              itemName: process.item.Name,
              itemId: process.item.Id,
            },
          });
          console.error("Error details:", {
            errorCode: error.errorCode,
          });
        });
    },
    [queryClient, settings?.optimizedVersionsServerUrl, authHeader],
  );

  const startBackgroundDownload = useCallback(
    async (
      url: string,
      item: BaseItemDto,
      mediaSource: MediaSourceInfo,
      maxBitrate?: Bitrate,
    ) => {
      if (!api || !item.Id || !authHeader)
        throw new Error("startBackgroundDownload ~ Missing required params");

      try {
        const fileExtension = mediaSource.TranscodingContainer;
        const deviceId = await getOrSetDeviceId();

        await saveSeriesPrimaryImage(item);
        const itemImage = getItemImage({
          item,
          api,
          variant: "Primary",
          quality: 90,
          width: 500,
        });
        await saveImage(item.Id, itemImage?.uri);
        if (usingOptimizedServer) {
          const response = await axios.post(
            `${settings?.optimizedVersionsServerUrl}optimize-version`,
            {
              url,
              fileExtension,
              deviceId,
              itemId: item.Id,
              item,
            },
            {
              headers: {
                "Content-Type": "application/json",
                Authorization: authHeader,
              },
            },
          );

          if (response.status !== 201) {
            throw new Error("Failed to start optimization job");
          }
        } else {
          const job: JobStatus = {
            id: item.Id!,
            deviceId: deviceId,
            inputUrl: url,
            item: item,
            itemId: item.Id!,
            mediaSource,
            progress: 0,
            maxBitrate,
            status: "downloading",
            timestamp: new Date(),
          };
          setProcesses([...processes, job]);
          startDownload(job);
        }

        toast.success(
          t("home.downloads.toasts.queued_item_for_optimization", {
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
        console.error("Error in startBackgroundDownload:", error);
        if (axios.isAxiosError(error)) {
          console.error("Axios error details:", {
            message: error.message,
            response: error.response?.data,
            status: error.response?.status,
            headers: error.response?.headers,
          });
          toast.error(
            t("home.downloads.toasts.failed_to_start_download_for_item", {
              item: item.Name,
              message: error.message,
            }),
          );
          if (error.response) {
            toast.error(
              t("home.downloads.toasts.server_responded_with_status", {
                statusCode: error.response.status,
              }),
            );
          } else if (error.request) {
            t("home.downloads.toasts.no_response_received_from_server");
          } else {
            toast.error("Error setting up the request");
          }
        } else {
          console.error("Non-Axios error:", error);
          toast.error(
            t(
              "home.downloads.toasts.failed_to_start_download_for_item_unexpected_error",
              { item: item.Name },
            ),
          );
        }
      }
    },
    [settings?.optimizedVersionsServerUrl, authHeader],
  );

  const deleteAllFiles = async (): Promise<void> => {
    Promise.all([
      deleteLocalFiles(),
      removeDownloadedItemsFromStorage(),
      cancelAllServerJobs(),
      queryClient.invalidateQueries({ queryKey: ["downloadedItems"] }),
    ])
      .then(() =>
        toast.success(
          t(
            "home.downloads.toasts.all_files_folders_and_jobs_deleted_successfully",
          ),
        ),
      )
      .catch((reason) => {
        console.error("Failed to delete all files, folders, and jobs:", reason);
        toast.error(
          t(
            "home.downloads.toasts.an_error_occured_while_deleting_files_and_jobs",
          ),
        );
      });
  };

  const forEveryDocumentDirFile = async (
    includeMMKV: boolean,
    ignoreList: string[],
    callback: (file: FileInfo) => void,
  ) => {
    const baseDirectory = FileSystem.documentDirectory;
    if (!baseDirectory) {
      throw new Error("Base directory not found");
    }

    const dirContents = await FileSystem.readDirectoryAsync(baseDirectory);
    for (const item of dirContents) {
      // Exclude mmkv directory.
      // Deleting this deletes all user information as well. Logout should handle this.
      if (
        (item === "mmkv" && !includeMMKV) ||
        ignoreList.some((i) => item.includes(i))
      ) {
        continue;
      }
      await FileSystem.getInfoAsync(`${baseDirectory}${item}`)
        .then((itemInfo) => {
          if (itemInfo.exists && !itemInfo.isDirectory) {
            callback(itemInfo);
          }
        })
        .catch((e) => console.error(e));
    }
  };

  const deleteLocalFiles = async (): Promise<void> => {
    await forEveryDocumentDirFile(false, [], (file) => {
      console.warn("Deleting file", file.uri);
      FileSystem.deleteAsync(file.uri, { idempotent: true });
    });
  };

  const removeDownloadedItemsFromStorage = async () => {
    // delete any saved images first
    Promise.all([deleteFileByType("Movie"), deleteFileByType("Episode")])
      .then(() => storage.delete("downloadedItems"))
      .catch((reason) => {
        console.error("Failed to remove downloadedItems from storage:", reason);
        throw reason;
      });
  };

  const cancelAllServerJobs = async (): Promise<void> => {
    if (!authHeader) {
      throw new Error("No auth header available");
    }
    if (!settings?.optimizedVersionsServerUrl) {
      console.error("No server URL configured");
      return;
    }

    const deviceId = await getOrSetDeviceId();
    if (!deviceId) {
      throw new Error("Failed to get device ID");
    }

    try {
      await cancelAllJobs({
        authHeader,
        url: settings.optimizedVersionsServerUrl,
        deviceId,
      });
    } catch (error) {
      console.error("Failed to cancel all server jobs:", error);
      throw error;
    }
  };

  const deleteFile = async (id: string): Promise<void> => {
    if (!id) {
      console.error("Invalid file ID");
      return;
    }

    try {
      const directory = FileSystem.documentDirectory;

      if (!directory) {
        console.error("Document directory not found");
        return;
      }
      const dirContents = await FileSystem.readDirectoryAsync(directory);

      for (const item of dirContents) {
        const itemNameWithoutExtension = item.split(".")[0];
        if (itemNameWithoutExtension === id) {
          const filePath = `${directory}${item}`;
          await FileSystem.deleteAsync(filePath, { idempotent: true });
          break;
        }
      }

      const downloadedItems = storage.getString("downloadedItems");
      if (downloadedItems) {
        let items = JSON.parse(downloadedItems) as DownloadedItem[];
        items = items.filter((item) => item.item.Id !== id);
        storage.set("downloadedItems", JSON.stringify(items));
      }

      queryClient.invalidateQueries({ queryKey: ["downloadedItems"] });
    } catch (error) {
      console.error(
        `Failed to delete file and storage entry for ID ${id}:`,
        error,
      );
    }
  };

  const deleteItems = async (items: BaseItemDto[]) => {
    Promise.all(
      items.map((i) => {
        if (i.Id) return deleteFile(i.Id);
        return;
      }),
    ).then(() => successHapticFeedback());
  };

  const cleanCacheDirectory = async () => {
    const cacheDir = await FileSystem.getInfoAsync(
      APP_CACHE_DOWNLOAD_DIRECTORY,
    );
    if (cacheDir.exists) {
      const cachedFiles = await FileSystem.readDirectoryAsync(
        APP_CACHE_DOWNLOAD_DIRECTORY,
      );
      let position = 0;
      const batchSize = 3;

      // batching promise.all to avoid OOM
      while (position < cachedFiles.length) {
        const itemsForBatch = cachedFiles.slice(position, position + batchSize);
        await Promise.all(
          itemsForBatch.map(async (file) => {
            const info = await FileSystem.getInfoAsync(
              `${APP_CACHE_DOWNLOAD_DIRECTORY}${file}`,
            );
            if (info.exists) {
              await FileSystem.deleteAsync(info.uri, { idempotent: true });
              return Promise.resolve(file);
            }
            return Promise.reject();
          }),
        );

        position += batchSize;
      }
    }
  };

  const deleteFileByType = async (type: BaseItemDto["Type"]) => {
    await Promise.all(
      downloadedFiles
        ?.filter((file) => file.item.Type === type)
        ?.flatMap((file) => {
          const promises = [];
          if (type === "Episode" && file.item.SeriesId)
            promises.push(deleteFile(file.item.SeriesId));
          promises.push(deleteFile(file.item.Id!));
          return promises;
        }) || [],
    );
  };

  const appSizeUsage = useMemo(async () => {
    const sizes: number[] =
      downloadedFiles?.map((d) => {
        return getDownloadedItemSize(d.item.Id!);
      }) || [];

    await forEveryDocumentDirFile(
      true,
      getAllDownloadedItems().map((d) => d.item.Id!),
      (file) => {
        if (file.exists) {
          sizes.push(file.size);
        }
      },
    ).catch((e) => {
      console.error(e);
    });

    return sizes.reduce((sum, size) => sum + size, 0);
  }, [logs, downloadedFiles, forEveryDocumentDirFile]);

  function getDownloadedItem(itemId: string): DownloadedItem | null {
    try {
      const downloadedItems = storage.getString("downloadedItems");
      if (downloadedItems) {
        const items: DownloadedItem[] = JSON.parse(downloadedItems);
        const item = items.find((i) => i.item.Id === itemId);
        return item || null;
      }
      return null;
    } catch (error) {
      console.error(`Failed to retrieve item with ID ${itemId}:`, error);
      return null;
    }
  }

  function getAllDownloadedItems(): DownloadedItem[] {
    try {
      const downloadedItems = storage.getString("downloadedItems");
      if (downloadedItems) {
        return JSON.parse(downloadedItems) as DownloadedItem[];
      }
      return [];
    } catch (error) {
      console.error("Failed to retrieve downloaded items:", error);
      return [];
    }
  }

  function saveDownloadedItemInfo(item: BaseItemDto, size = 0) {
    try {
      const downloadedItems = storage.getString("downloadedItems");
      const items: DownloadedItem[] = downloadedItems
        ? JSON.parse(downloadedItems)
        : [];

      const existingItemIndex = items.findIndex((i) => i.item.Id === item.Id);

      const data = getDownloadItemInfoFromDiskTmp(item.Id!);

      if (!data?.mediaSource)
        throw new Error(
          "Media source not found in tmp storage. Did you forget to save it before starting download?",
        );

      const newItem = { item, mediaSource: data.mediaSource };

      if (existingItemIndex !== -1) {
        items[existingItemIndex] = newItem;
      } else {
        items.push(newItem);
      }

      deleteDownloadItemInfoFromDiskTmp(item.Id!);

      storage.set("downloadedItems", JSON.stringify(items));
      storage.set(`downloadedItemSize-${item.Id}`, size.toString());

      queryClient.invalidateQueries({ queryKey: ["downloadedItems"] });
      refetch();
    } catch (error) {
      console.error(
        "Failed to save downloaded item information with media source:",
        error,
      );
    }
  }

  function getDownloadedItemSize(itemId: string): number {
    const size = storage.getString(`downloadedItemSize-${itemId}`);
    return size ? Number.parseInt(size) : 0;
  }

  return {
    processes,
    startBackgroundDownload,
    downloadedFiles,
    deleteAllFiles,
    deleteFile,
    deleteItems,
    saveDownloadedItemInfo,
    removeProcess,
    setProcesses,
    startDownload,
    getDownloadedItem,
    deleteFileByType,
    appSizeUsage,
    getDownloadedItemSize,
    APP_CACHE_DOWNLOAD_DIRECTORY,
    cleanCacheDirectory,
  };
}

export function DownloadProvider({ children }: { children: React.ReactNode }) {
  const downloadProviderValue = useDownloadProvider();

  return (
    <DownloadContext.Provider value={downloadProviderValue}>
      {children}
    </DownloadContext.Provider>
  );
}

export function useDownload() {
  const context = useContext(DownloadContext);
  if (context === null) {
    throw new Error("useDownload must be used within a DownloadProvider");
  }
  if (Platform.isTV) {
    throw new Error("useDownload is not supported on TVOS");
  }
  return context;
}

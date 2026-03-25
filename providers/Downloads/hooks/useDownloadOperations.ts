import type {
  BaseItemDto,
  MediaSourceInfo,
} from "@jellyfin/sdk/lib/generated-client/models";
import { File, Paths } from "expo-file-system";
import { FFmpegKit, FFprobeKit, ReturnCode } from "ffmpeg-kit-react-native";
import { useAtom } from "jotai";
import type { MutableRefObject } from "react";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Platform } from "react-native";
import DeviceInfo from "react-native-device-info";
import { toast } from "sonner-native";
import type { Bitrate } from "@/components/BitrateSelector";
import { BITRATES } from "@/components/BitrateSelector";
import useImageStorage from "@/hooks/useImageStorage";
import { BackgroundDownloader } from "@/modules";
import { userAtom } from "@/providers/JellyfinProvider";
import { useSettings } from "@/utils/atoms/settings";
import { getOrSetDeviceId } from "@/utils/device";
import useDownloadHelper from "@/utils/download";
import { getDownloadUrl } from "@/utils/jellyfin/media/getDownloadUrl";
import { downloadAdditionalAssets } from "../additionalDownloads";
import { chunkCoordinator } from "../chunkCoordinator";
import {
  addDownloadedItem,
  clearAllDownloadedItems,
  getAllDownloadedItems,
  removeDownloadedItem,
} from "../database";
import {
  calculateTotalDownloadedSize,
  deleteAllAssociatedFiles,
} from "../fileOperations";
import {
  getAllResumeStates,
  getResumeState,
  removeResumeState,
  saveResumeState,
} from "../resumeState";
import type { DownloadedItem, JobStatus } from "../types";
import { filePathToUri, generateFilename, uriToFilePath } from "../utils";

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
 * Hook providing download operation functions (start, cancel, delete, pause, resume, retry)
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
  const { settings } = useSettings();
  const [user] = useAtom(userAtom);

  const handleDownloadSuccess = useCallback(
    async (processId: string, filePath: string) => {
      // Use the explicit MMKV state since the `processes` array in this closure may be completely stale if called from a fresh download session.
      const process =
        getResumeState(processId)?.jobStatus ||
        processes.find((p) => p.id === processId);
      if (!process) return;

      const commitToDatabase = (
        finalFilePath: string,
        isTranscoded: boolean,
      ) => {
        try {
          const videoFile = new File(filePathToUri(finalFilePath));
          const fileInfo = videoFile.info();
          const videoFileSize = fileInfo.size || 0;
          const filename = generateFilename(process.item);

          const downloadedItem: DownloadedItem = {
            item: process.item,
            mediaSource: process.mediaSource,
            videoFilePath: filePathToUri(finalFilePath),
            videoFileSize,
            videoFileName: `${filename}.mp4`,
            trickPlayData: process.trickPlayData,
            introSegments: process.introSegments,
            creditSegments: process.creditSegments,
            userData: {
              audioStreamIndex: process.audioStreamIndex ?? 0,
              subtitleStreamIndex: process.subtitleStreamIndex ?? -1,
              isTranscoded,
            },
          };

          addDownloadedItem(downloadedItem);
          console.log(
            `[DOWNLOAD] Committed ${process.item.Name} to local database.`,
          );
        } catch (e) {
          console.error(`[DOWNLOAD] Failed to commit to database:`, e);
        }
      };

      if (process.localTranscodeState?.isLocal) {
        const outputPath = filePath.replace(".mp4", "_transcoded.mp4");
        const bitrate = process.localTranscodeState.targetBitratebps || 8000000;
        const codec = process.localTranscodeState.targetCodec || "libx265";

        let durationMs = (process.item.RunTimeTicks || 0) / 10000;

        if (durationMs === 0) {
          try {
            const infoSession = await FFprobeKit.getMediaInformation(filePath);
            const info = infoSession.getMediaInformation();
            const durationSec = info?.getDuration();
            if (durationSec && !Number.isNaN(Number(durationSec))) {
              durationMs = Number(durationSec) * 1000;
            }
          } catch (_e) {}
        }

        // Set initially to transcoding so UI updates and resume state knows it's transcoding
        setProcesses((prev) =>
          prev.map((p) =>
            p.id === processId
              ? {
                  ...p,
                  status: "transcoding",
                  localTranscodeState: {
                    ...p.localTranscodeState!,
                    isLocal: true,
                    targetBitratebps: bitrate,
                    targetCodec: codec,
                    progress: 0,
                    timeInMs: 0,
                    durationMs: durationMs,
                    speed: 0,
                  },
                }
              : p,
          ),
        );
        const state = getResumeState(processId);
        if (state) {
          saveResumeState({
            ...state,
            jobStatus: { ...state.jobStatus, status: "transcoding" },
          });
        }

        // Map software GPL libraries to Apple's native hardware VideoToolbox Encoders automatically.
        let targetVCodec = codec === "libx265" ? "libx265" : "libx264";
        if (Platform.OS === "ios") {
          targetVCodec =
            codec === "libx265" ? "hevc_videotoolbox" : "h264_videotoolbox";
        }

        // By omitting -c:a copy, we safely let FFmpeg implicitly resolve AAC for MP4, preventing 'ReturnCode 1' crashes on invalid or missing audio tracks.
        const command = `-i "${filePath}" -c:v ${targetVCodec} -b:v ${bitrate} -preset ultrafast -y "${outputPath}"`;

        try {
          FFmpegKit.executeAsync(
            command,
            async (session) => {
              const returnCode = await session.getReturnCode();

              if (ReturnCode.isSuccess(returnCode)) {
                const oldFile = new File(filePathToUri(filePath));
                try {
                  oldFile.delete();
                } catch (_e) {}

                const transcodedFile = new File(filePathToUri(outputPath));
                try {
                  transcodedFile.move(new File(filePathToUri(filePath)));
                } catch (e) {
                  console.log("move err", e);
                }

                commitToDatabase(filePath, true);

                setProcesses((prev) =>
                  prev.map((p) =>
                    p.id === processId
                      ? { ...p, status: "completed", progress: 100 }
                      : p,
                  ),
                );
                removeResumeState(processId);
              } else {
                const _logs = await session.getLogsAsString();
                setProcesses((prev) =>
                  prev.map((p) =>
                    p.id === processId ? { ...p, status: "error" } : p,
                  ),
                );
              }
            },
            undefined,
            (statistics) => {
              if (durationMs > 0) {
                const timeInMs = statistics.getTime();
                const progress = Math.max(
                  0,
                  Math.min(Math.round((timeInMs / durationMs) * 100), 100),
                );
                const speed = statistics.getSpeed();

                setProcesses((prev) =>
                  prev.map((p) =>
                    p.id === processId && p.localTranscodeState
                      ? {
                          ...p,
                          localTranscodeState: {
                            ...p.localTranscodeState,
                            progress,
                            timeInMs,
                            durationMs,
                            speed,
                          },
                        }
                      : p,
                  ),
                );
              }
            },
          );
        } catch (e) {
          console.error(`[DOWNLOAD] Local transcode exception:`, e);
          setProcesses((prev) =>
            prev.map((p) =>
              p.id === processId ? { ...p, status: "error" } : p,
            ),
          );
        }
      } else {
        commitToDatabase(filePath, process.isTranscoding ?? false);
        setProcesses((prev: JobStatus[]) =>
          prev.map((p) =>
            p.id === processId
              ? { ...p, status: "completed", progress: 100 }
              : p,
          ),
        );
        removeResumeState(processId);
      }
    },
    [processes, setProcesses],
  );
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

        const isLocalTranscode = settings.localTranscodingEnabled;
        const actualBitrate = isLocalTranscode
          ? BITRATES.find((b) => b.key === "Max")!
          : maxBitrate;

        // Construct download URL
        const downloadDetails = await getDownloadUrl({
          api,
          item,
          userId: user?.Id || "",
          mediaSource,
          audioStreamIndex: audioStreamIndex ?? -1,
          subtitleStreamIndex: subtitleStreamIndex ?? -1,
          maxBitrate: actualBitrate,
          deviceId,
          audioMode: settings.audioTranscodeMode,
          isLocalTranscode,
        });

        const rawDownloadUrl = downloadDetails?.url || url;

        // Ensure URL is absolute
        let finalDownloadUrl = rawDownloadUrl;
        if (rawDownloadUrl.startsWith("/")) {
          finalDownloadUrl = `${api.basePath}${rawDownloadUrl}`;
        }

        // Generate destination path
        const filename = generateFilename(item);
        const destinationFile = new File(Paths.document, `${filename}.mp4`);
        const destinationPath = uriToFilePath(destinationFile.uri);

        // Create job status
        const jobStatus: JobStatus = {
          id: processId,
          inputUrl: finalDownloadUrl,
          item,
          itemId: item.Id,
          deviceId,
          progress: 0,
          status: "downloading",
          isResumable: true,
          timestamp: new Date(),
          mediaSource: additionalAssets.updatedMediaSource,
          maxBitrate: actualBitrate,
          bytesDownloaded: 0,
          trickPlayData: additionalAssets.trickPlayData,
          introSegments: additionalAssets.introSegments,
          creditSegments: additionalAssets.creditSegments,
          audioStreamIndex,
          subtitleStreamIndex,
          partialFilePath: destinationPath,
          localTranscodeState: isLocalTranscode
            ? {
                isLocal: true,
                targetBitratebps:
                  settings.localTranscodingBitrate.value || 8000000,
                targetCodec: settings.localTranscodingCodec,
                progress: 0,
              }
            : undefined,
        };

        // Save immediately to mmkv
        saveResumeState({
          processId,
          url: finalDownloadUrl,
          destinationPath,
          bytesDownloaded: 0,
          jobStatus,
          pausedAt: new Date().toISOString(),
        });

        // Add to processes
        setProcesses((prev) => [...prev, jobStatus]);

        console.log(
          `[DOWNLOAD] Starting download for ${item.Name} (Local Transcoding: ${isLocalTranscode})`,
        );

        // Step 1: Resolve content length
        let contentLength = 0;
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 10000);
          const headResponse = await fetch(finalDownloadUrl, {
            method: "HEAD",
            headers: authHeader ? { Authorization: authHeader } : undefined,
            signal: controller.signal,
          });
          clearTimeout(timeoutId);
          const headLength = headResponse.headers.get("Content-Length");
          contentLength = parseInt(headLength || "0", 10);
        } catch (_e) {}

        if (contentLength === 0) {
          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);
            const probeResponse = await fetch(finalDownloadUrl, {
              method: "GET",
              headers: authHeader
                ? { Authorization: authHeader, Range: "bytes=0-0" }
                : { Range: "bytes=0-0" },
              signal: controller.signal,
            });
            clearTimeout(timeoutId);
            const contentRange = probeResponse.headers.get("Content-Range");
            if (contentRange) {
              const match = contentRange.match(/\/(\d+)/);
              if (match) contentLength = parseInt(match[1], 10);
            }
          } catch (_e) {}
        }

        const isChunkable = contentLength > 0;

        if (isChunkable) {
          console.log(
            `[DOWNLOAD] Using JS Chunk-Based downloading for ${processId} (${contentLength} bytes)`,
          );

          const updatedJobStatus = {
            ...jobStatus,
            estimatedTotalSizeBytes: contentLength,
          };

          setProcesses((prev) =>
            prev.map((p) => (p.id === processId ? updatedJobStatus : p)),
          );

          saveResumeState({
            processId,
            url: finalDownloadUrl,
            destinationPath,
            bytesDownloaded: 0,
            jobStatus: updatedJobStatus,
            pausedAt: new Date().toISOString(),
          });

          taskMapRef.current.set(finalDownloadUrl, processId);

          chunkCoordinator.startLoop(
            processId,
            finalDownloadUrl,
            destinationPath,
            contentLength,
            0,
            (bytesWritten: number) => {
              // We rely on useDownloadEventHandlers for progress if using Native,
              // but for chunking we need to emit or manually update progress here!
              // For simplicity, we can emit a fake progress event or just update the process.
              setProcesses((prev: JobStatus[]) =>
                prev.map((p) =>
                  p.id === processId
                    ? {
                        ...p,
                        bytesDownloaded: bytesWritten,
                        progress: Math.floor(
                          (bytesWritten / contentLength) * 100,
                        ),
                      }
                    : p,
                ),
              );
            },
            (filePath: string) => {
              chunkCoordinator.cancelLoop(processId);
              handleDownloadSuccess(processId, filePath);
            },
            (errorMsg: string) => {
              console.error("[DOWNLOAD] Chunk loop failed", errorMsg);
              setProcesses((prev: JobStatus[]) =>
                prev.map((p) =>
                  p.id === processId ? { ...p, status: "error" } : p,
                ),
              );
            },
          );
        } else {
          console.log(
            `[DOWNLOAD] Transcoding/Unknown length. Using OS background downloader.`,
          );
          const taskId = await BackgroundDownloader.enqueueDownload(
            finalDownloadUrl,
            destinationPath,
          );

          if (taskId !== -1) {
            taskMapRef.current.set(taskId, processId);
          } else {
            taskMapRef.current.set(finalDownloadUrl, processId);
          }
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

  const pauseDownload = useCallback(
    async (id: string) => {
      // Pause chunk loop if active
      chunkCoordinator.pauseLoop(id);

      // Find the task ID for this process (OS background downloader)
      let taskId: number | undefined;

      taskMapRef.current.forEach((pId, key) => {
        if (pId === id && typeof key === "number") {
          taskId = key;
        }
      });

      const process = processes.find((p) => p.id === id);

      if (taskId !== undefined) {
        BackgroundDownloader.pauseDownload(taskId);
      }

      if (process) {
        saveResumeState({
          processId: id,
          url: process.inputUrl,
          destinationPath: process.partialFilePath || "",
          bytesDownloaded: process.bytesDownloaded || 0,
          jobStatus: process,
          pausedAt: new Date().toISOString(),
        });
        setProcesses((prev) =>
          prev.map((p) => (p.id === id ? { ...p, status: "paused" } : p)),
        );
      }

      toast.info(t("home.downloads.toasts.download_paused"));
    },
    [taskMapRef, processes, setProcesses, t],
  );

  const resumeDownload = useCallback(
    async (id: string) => {
      const process = processes.find((p) => p.id === id);
      if (!process) {
        return;
      }

      // Update UI state
      setProcesses((prev) =>
        prev.map((p) => (p.id === id ? { ...p, status: "resuming" } : p)),
      );

      // Step 1: Try cached size first
      let contentLength = process.estimatedTotalSizeBytes || 0;

      if (contentLength > 0) {
      }

      // Step 2: If no cached size, try HEAD request
      if (contentLength === 0) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

          const headResponse = await fetch(process.inputUrl, {
            method: "HEAD",
            headers: authHeader ? { Authorization: authHeader } : undefined,
            signal: controller.signal,
          });
          clearTimeout(timeoutId);
          const cl = headResponse.headers.get("Content-Length");
          if (cl) {
            contentLength = parseInt(cl, 10);
          }
        } catch (_e) {}
      }

      // Step 3: If still no size, do a Range: bytes=0-0 request to read Content-Range total
      if (contentLength === 0) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

          const rangeResponse = await fetch(process.inputUrl, {
            method: "GET",
            headers: {
              ...(authHeader ? { Authorization: authHeader } : {}),
              Range: "bytes=0-0",
            },
            signal: controller.signal,
          });
          clearTimeout(timeoutId);
          // Content-Range: bytes 0-0/TOTAL
          const contentRange = rangeResponse.headers.get("Content-Range");
          if (contentRange) {
            const match = contentRange.match(/\/(\d+)$/);
            if (match) {
              contentLength = parseInt(match[1], 10);
            }
          }
          // Also check raw Content-Length from this partial response
          if (contentLength === 0) {
            const cl = rangeResponse.headers.get("Content-Length");
            if (cl) contentLength = parseInt(cl, 10);
          }
          // Drain body to avoid connection leak
          try {
            await rangeResponse.body?.cancel();
          } catch {}
        } catch (_e) {}
      }

      if (contentLength > 0) {
        // Cache the discovered size back into the process so future resumes are instant
        saveResumeState({
          processId: id,
          url: process.inputUrl,
          destinationPath: process.partialFilePath || "",
          bytesDownloaded: process.bytesDownloaded || 0,
          jobStatus: { ...process, estimatedTotalSizeBytes: contentLength },
          pausedAt: new Date().toISOString(),
        });
        setProcesses((prev) =>
          prev.map((p) =>
            p.id === id ? { ...p, estimatedTotalSizeBytes: contentLength } : p,
          ),
        );

        chunkCoordinator.startLoop(
          id,
          process.inputUrl,
          process.partialFilePath || "",
          contentLength,
          process.bytesDownloaded || 0,
          (bytesWritten: number) => {
            setProcesses((prev: JobStatus[]) =>
              prev.map((p) =>
                p.id === id
                  ? {
                      ...p,
                      status: "downloading",
                      bytesDownloaded: bytesWritten,
                      progress: Math.floor(
                        (bytesWritten / contentLength) * 100,
                      ),
                    }
                  : p,
              ),
            );
          },
          (filePath: string) => {
            chunkCoordinator.cancelLoop(id);
            handleDownloadSuccess(id, filePath);
          },
          (errorMsg: string) => {
            console.error(
              "[DOWNLOAD] Chunk loop failed during resume",
              errorMsg,
            );
            setProcesses((prev: JobStatus[]) =>
              prev.map((p) => (p.id === id ? { ...p, status: "error" } : p)),
            );
          },
        );
        toast.info(t("home.downloads.toasts.download_resumed"));
        return;
      }

      // Step 4: If ALL size probes failed, cannot resume as chunk-based — show error
      setProcesses((prev) =>
        prev.map((p) => (p.id === id ? { ...p, status: "error" } : p)),
      );
      toast.error(
        "Could not determine file size to resume download. Please retry from the server.",
      );

      // Find the task ID for OS background process
      let taskId: number | undefined;

      taskMapRef.current.forEach((pId, key) => {
        if (pId === id && typeof key === "number") {
          taskId = key;
        }
      });

      if (taskId !== undefined) {
        try {
          const newTaskId = await BackgroundDownloader.resumeDownload(taskId);
          taskMapRef.current.delete(taskId);
          taskMapRef.current.set(newTaskId, id);
          removeResumeState(id);
          toast.info(t("home.downloads.toasts.download_resumed"));
        } catch (_error) {
          toast.error(t("home.downloads.toasts.failed_to_resume_download"));
        }
      } else {
        console.warn(`[DOWNLOAD] No task found to resume for process ${id}`);
      }
    },
    [taskMapRef, processes, setProcesses, authHeader, t],
  );

  const retryDownload = useCallback(
    async (id: string) => {
      const process = processes.find((p) => p.id === id);
      if (!process) return;

      // Update status to resuming
      setProcesses((prev) =>
        prev.map((p) =>
          p.id === id ? { ...p, status: "resuming" as const } : p,
        ),
      );

      try {
        // If we have a task mapping, try native resume
        let taskId: number | undefined;
        taskMapRef.current.forEach((pId, key) => {
          if (pId === id && typeof key === "number") {
            taskId = key;
          }
        });

        if (taskId !== undefined) {
          const newTaskId = await BackgroundDownloader.resumeDownload(taskId);
          taskMapRef.current.delete(taskId);
          taskMapRef.current.set(newTaskId, id);
          removeResumeState(id);
          toast.info(t("home.downloads.toasts.download_resumed"));
        } else {
          // No native task — restart the download from scratch
          // Remove the failed process first
          removeProcess(id);
          removeResumeState(id);

          // Re-start with original parameters if available
          if (process.inputUrl && process.item && process.mediaSource) {
            await startBackgroundDownload(
              process.inputUrl,
              process.item,
              process.mediaSource,
              process.maxBitrate,
              process.audioStreamIndex,
              process.subtitleStreamIndex,
            );
          }
        }
      } catch (error) {
        console.error("Failed to retry download:", error);
        setProcesses((prev) =>
          prev.map((p) =>
            p.id === id ? { ...p, status: "error" as const } : p,
          ),
        );
        toast.error(t("home.downloads.toasts.failed_to_resume_download"));
      }
    },
    [
      processes,
      setProcesses,
      taskMapRef,
      removeProcess,
      startBackgroundDownload,
      t,
    ],
  );

  /**
   * Recover paused downloads from MMKV on app startup.
   * Returns the processes that should be restored.
   */
  const recoverPausedDownloads = useCallback(() => {
    const resumeStates = getAllResumeStates();

    if (resumeStates.length === 0) return;

    console.log(
      `[DOWNLOAD] Found ${resumeStates.length} paused downloads to recover`,
    );

    const recoveredProcesses: JobStatus[] = resumeStates.map((state) => ({
      ...state.jobStatus,
      status: "paused" as const,
      isResumable: true,
      timestamp: new Date(state.pausedAt),
    }));

    if (recoveredProcesses.length > 0) {
      setProcesses((prev) => {
        // Don't add duplicates
        const existingIds = new Set(prev.map((p) => p.id));
        const newProcesses = recoveredProcesses.filter(
          (p) => !existingIds.has(p.id),
        );
        return [...prev, ...newProcesses];
      });
    }
  }, [setProcesses]);

  const cancelDownload = useCallback(
    async (id: string) => {
      chunkCoordinator.cancelLoop(id);

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
        BackgroundDownloader.cancelDownload(taskId);
        taskMapRef.current.delete(taskId);
      } else if (downloadUrl !== undefined) {
        BackgroundDownloader.cancelQueuedDownload(downloadUrl);
        taskMapRef.current.delete(downloadUrl);
      }

      removeResumeState(id);
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
    pauseDownload,
    resumeDownload,
    retryDownload,
    recoverPausedDownloads,
    deleteFile,
    deleteItems,
    deleteAllFiles,
    deleteFileByType,
    appSizeUsage,
  };
}

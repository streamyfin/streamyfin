import * as Application from "expo-application";
import { Directory, Paths } from "expo-file-system";
import { atom, useAtom } from "jotai";
import { createContext, useCallback, useContext, useMemo, useRef } from "react";
import { Platform } from "react-native";
import { useHaptic } from "@/hooks/useHaptic";
import {
  getAllDownloadedItems,
  getDownloadedItemById,
  getDownloadsDatabase,
} from "./Downloads/database";
import { getDownloadedItemSize } from "./Downloads/fileOperations";
import { useDownloadEventHandlers } from "./Downloads/hooks/useDownloadEventHandlers";
import { useDownloadOperations } from "./Downloads/hooks/useDownloadOperations";
import type { JobStatus } from "./Downloads/types";
import { apiAtom } from "./JellyfinProvider";

export const processesAtom = atom<JobStatus[]>([]);
export const downloadsRefreshAtom = atom<number>(0);

const DownloadContext = createContext<ReturnType<
  typeof useDownloadProvider
> | null>(null);

function useDownloadProvider() {
  const [api] = useAtom(apiAtom);
  const [processes, setProcesses] = useAtom<JobStatus[]>(processesAtom);
  const [refreshKey, setRefreshKey] = useAtom(downloadsRefreshAtom);
  const successHapticFeedback = useHaptic("success");

  // Track task ID to process ID mapping
  const taskMapRef = useRef<Map<number, string>>(new Map());

  // Reactive downloaded items that updates when refreshKey changes
  const downloadedItems = useMemo(() => {
    return getAllDownloadedItems();
  }, [refreshKey]);

  // Trigger refresh of download lists
  const triggerRefresh = useCallback(() => {
    setRefreshKey((prev) => prev + 1);
  }, [setRefreshKey]);

  const authHeader = useMemo(() => {
    return api?.accessToken;
  }, [api]);

  const APP_CACHE_DOWNLOAD_DIRECTORY = new Directory(
    Paths.cache,
    `${Application.applicationId}/Downloads/`,
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
      taskMapRef.current.forEach((processId, taskId) => {
        if (processId === id) {
          taskMapRef.current.delete(taskId);
        }
      });
    },
    [setProcesses],
  );

  // Set up download event handlers
  useDownloadEventHandlers({
    taskMapRef,
    processes,
    updateProcess,
    removeProcess,
    onSuccess: successHapticFeedback,
    onDataChange: triggerRefresh,
    api: api || undefined,
  });

  // Get download operation functions
  const {
    startBackgroundDownload,
    cancelDownload,
    deleteFile,
    deleteItems,
    deleteAllFiles,
    deleteFileByType,
    appSizeUsage,
  } = useDownloadOperations({
    taskMapRef,
    processes,
    setProcesses,
    removeProcess,
    api,
    authHeader,
    onDataChange: triggerRefresh,
  });

  return {
    processes,
    startBackgroundDownload,
    downloadedItems, // Reactive value that auto-updates
    getDownloadedItems: getAllDownloadedItems, // Keep for backward compatibility
    getDownloadsDatabase,
    deleteAllFiles,
    deleteFile,
    deleteItems,
    deleteFileByType,
    removeProcess,
    cancelDownload,
    getDownloadedItemSize,
    getDownloadedItemById,
    triggerRefresh,
    APP_CACHE_DOWNLOAD_DIRECTORY: APP_CACHE_DOWNLOAD_DIRECTORY.uri,
    appSizeUsage,
    // Deprecated/not implemented in simple version
    startDownload: async () => {},
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
      downloadedItems: [],
      getDownloadedItems: () => [],
      getDownloadsDatabase: () => ({ movies: {}, series: {}, other: {} }),
      deleteAllFiles: async () => {},
      deleteFile: async () => {},
      deleteItems: async () => {},
      deleteFileByType: async () => {},
      removeProcess: () => {},
      cancelDownload: async () => {},
      triggerRefresh: () => {},
      startDownload: async () => {},
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

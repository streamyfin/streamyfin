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

const DownloadContext = createContext<ReturnType<
  typeof useDownloadProvider
> | null>(null);

function useDownloadProvider() {
  const [api] = useAtom(apiAtom);
  const [processes, setProcesses] = useAtom<JobStatus[]>(processesAtom);
  const successHapticFeedback = useHaptic("success");

  // Track task ID to process ID mapping
  const taskMapRef = useRef<Map<number, string>>(new Map());

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
      for (const [taskId, processId] of taskMapRef.current.entries()) {
        if (processId === id) {
          taskMapRef.current.delete(taskId);
        }
      }
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
    api: api || undefined,
  });

  // Get download operation functions
  const {
    startBackgroundDownload,
    cancelDownload,
    deleteFile,
    deleteItems,
    deleteAllFiles,
    appSizeUsage,
  } = useDownloadOperations({
    taskMapRef,
    processes,
    setProcesses,
    removeProcess,
    api,
    authHeader,
  });

  return {
    processes,
    startBackgroundDownload,
    getDownloadedItems: getAllDownloadedItems,
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

import { storage } from "@/utils/mmkv";
import type { JobStatus } from "@/utils/optimize-server";
import type {
  BaseItemDto,
  MediaSourceInfo,
} from "@jellyfin/sdk/lib/generated-client/models";
import * as Application from "expo-application";
import * as FileSystem from "expo-file-system";
import { atom, useAtom } from "jotai";
import type React from "react";
import { createContext, useCallback, useContext, useMemo } from "react";

export type DownloadedItem = {
  item: Partial<BaseItemDto>;
  mediaSource: MediaSourceInfo;
};

export const processesAtom = atom<JobStatus[]>([]);

const DownloadContext = createContext<ReturnType<
  typeof useDownloadProvider
> | null>(null);

/**
 * Dummy download provider for tvOS
 */
function useDownloadProvider() {
  const [processes, setProcesses] = useAtom<JobStatus[]>(processesAtom);

  const downloadedFiles: DownloadedItem[] = [];

  const removeProcess = useCallback(async (id: string) => {}, []);

  const startDownload = useCallback(async (process: JobStatus) => {
    return null;
  }, []);

  const startBackgroundDownload = useCallback(
    async (url: string, item: BaseItemDto, mediaSource: MediaSourceInfo) => {
      return null;
    },
    [],
  );

  const deleteAllFiles = async (): Promise<void> => {};

  const deleteFile = async (id: string): Promise<void> => {};

  const deleteItems = async (items: BaseItemDto[]) => {};

  const cleanCacheDirectory = async () => {};

  const deleteFileByType = async (type: BaseItemDto["Type"]) => {};

  const appSizeUsage = useMemo(async () => {
    return 0;
  }, []);

  function getDownloadedItem(itemId: string): DownloadedItem | null {
    return null;
  }

  function saveDownloadedItemInfo(item: BaseItemDto, size = 0) {}

  function getDownloadedItemSize(itemId: string): number {
    const size = storage.getString("downloadedItemSize-" + itemId);
    return size ? Number.parseInt(size) : 0;
  }

  const APP_CACHE_DOWNLOAD_DIRECTORY = `${FileSystem.cacheDirectory}${Application.applicationId}/Downloads/`;

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
  return context;
}

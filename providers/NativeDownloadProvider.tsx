import useImageStorage from "@/hooks/useImageStorage";
import {
  addCompleteListener,
  addErrorListener,
  addProgressListener,
  checkForExistingDownloads,
  downloadHLSAsset,
  cancelDownload,
} from "@/modules/hls-downloader";
import {
  DownloadInfo,
  DownloadMetadata,
} from "@/modules/hls-downloader/src/HlsDownloader.types";
import { getItemImage } from "@/utils/getItemImage";
import { getStreamUrl } from "@/utils/jellyfin/media/getStreamUrl";
import { rewriteM3U8Files } from "@/utils/movpkg-to-vlc/tools";
import download from "@/utils/profiles/download";
import {
  BaseItemDto,
  MediaSourceInfo,
} from "@jellyfin/sdk/lib/generated-client/models";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as FileSystem from "expo-file-system";
import { useAtomValue } from "jotai";
import { createContext, useContext, useEffect, useState } from "react";
import { toast } from "sonner-native";
import { apiAtom, userAtom } from "./JellyfinProvider";

type DownloadOptionsData = {
  selectedAudioStream: number;
  selectedSubtitleStream: number;
  selectedMediaSource: MediaSourceInfo;
  maxBitrate?: number;
};

type DownloadContextType = {
  downloads: Record<string, DownloadInfo>;
  startDownload: (
    item: BaseItemDto,
    url: string,
    {
      selectedAudioStream,
      selectedSubtitleStream,
      selectedMediaSource,
      maxBitrate,
    }: DownloadOptionsData
  ) => Promise<void>;
  getDownloadedItem: (id: string) => Promise<DownloadMetadata | null>;
  cancelDownload: (id: string) => Promise<void>;
  activeDownloads: DownloadInfo[];
  downloadedFiles: DownloadedFileInfo[];
  refetchDownloadedFiles: () => void;
};

const DownloadContext = createContext<DownloadContextType | undefined>(
  undefined
);

/**
 * Marks a file as done by creating a file with the same name in the downloads directory.
 * @param doneFile - The name of the file to mark as done.
 */
const markFileAsDone = async (id: string) => {
  await FileSystem.writeAsStringAsync(
    `${FileSystem.documentDirectory}downloads/${id}-done`,
    "done"
  );
};

/**
 * Checks if a file is marked as done by checking if a file with the same name exists in the downloads directory.
 * @param doneFile - The name of the file to check.
 * @returns True if the file is marked as done, false otherwise.
 */
const isFileMarkedAsDone = async (id: string) => {
  const fileUri = `${FileSystem.documentDirectory}downloads/${id}-done`;
  const fileInfo = await FileSystem.getInfoAsync(fileUri);
  return fileInfo.exists;
};

export type DownloadedFileInfo = {
  id: string;
  path: string;
  metadata: DownloadMetadata;
};

const getDownloadedFiles = async (): Promise<DownloadedFileInfo[]> => {
  const downloaded: DownloadedFileInfo[] = [];

  const downloadsDir = FileSystem.documentDirectory + "downloads/";
  const dirInfo = await FileSystem.getInfoAsync(downloadsDir);

  if (!dirInfo.exists) return [];

  const files = await FileSystem.readDirectoryAsync(downloadsDir);

  for (let file of files) {
    const fileInfo = await FileSystem.getInfoAsync(downloadsDir + file);
    if (fileInfo.isDirectory) continue;
    if (!file.endsWith(".json")) continue;

    const fileContent = await FileSystem.readAsStringAsync(downloadsDir + file);

    // Check that fileContent is actually DownloadMetadata
    if (!fileContent) continue;
    if (!fileContent.includes("mediaSource")) continue;
    if (!fileContent.includes("item")) continue;

    downloaded.push({
      id: file.replace(".json", ""),
      path: downloadsDir + file.replace(".json", ""),
      metadata: JSON.parse(fileContent) as DownloadMetadata,
    });
  }
  return downloaded;
};

const getDownloadedFile = async (id: string) => {
  const downloadsDir = FileSystem.documentDirectory + "downloads/";
  const fileInfo = await FileSystem.getInfoAsync(downloadsDir + id + ".json");
  if (!fileInfo.exists) return null;
  const fileContent = await FileSystem.readAsStringAsync(
    downloadsDir + id + ".json"
  );
  return JSON.parse(fileContent) as DownloadMetadata;
};

export const NativeDownloadProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const [downloads, setDownloads] = useState<Record<string, DownloadInfo>>({});
  const { saveImage } = useImageStorage();
  const queryClient = useQueryClient();

  const user = useAtomValue(userAtom);
  const api = useAtomValue(apiAtom);

  const { data: downloadedFiles, refetch: refetchDownloadedFiles } = useQuery({
    queryKey: ["downloadedFiles"],
    queryFn: getDownloadedFiles,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
    refetchOnReconnect: true,
    staleTime: 0,
  });

  useEffect(() => {
    // const initializeDownloads = async () => {
    //   const hlsDownloads = await checkForExistingDownloads();
    //   const hlsDownloadStates = hlsDownloads.reduce(
    //     (acc, download) => ({
    //       ...acc,
    //       [download.id]: {
    //         id: download.id,
    //         progress: download.progress,
    //         state: download.state,
    //         secondsDownloaded: download.secondsDownloaded,
    //         secondsTotal: download.secondsTotal,
    //         metadata: download.metadata,
    //         startTime: download?.startTime,
    //       },
    //     }),
    //     {}
    //   );

    //   setDownloads({ ...hlsDownloadStates });
    // };

    // initializeDownloads();

    const progressListener = addProgressListener((download) => {
      if (!download.metadata) throw new Error("No metadata found in download");

      console.log(
        "[HLS] Download progress:",
        download.metadata.item.Id,
        download.progress,
        download.state
      );

      setDownloads((prev) => ({
        ...prev,
        [download.id]: {
          id: download.id,
          progress: download.progress,
          state: download.state,
          secondsDownloaded: download.secondsDownloaded,
          secondsTotal: download.secondsTotal,
          metadata: download.metadata,
          startTime: download?.startTime,
        },
      }));
    });

    const completeListener = addCompleteListener(async (payload) => {
      try {
        // await rewriteM3U8Files(payload.location);
        // await markFileAsDone(payload.id);
        console.log("completeListener", payload.id);

        setDownloads((prev) => {
          const newDownloads = { ...prev };
          delete newDownloads[payload.id];
          return newDownloads;
        });

        if (payload.state === "DONE") toast.success("Download complete ✅");

        refetchDownloadedFiles();
      } catch (error) {
        console.error("Failed to download file:", error);
        toast.error("Failed to download ❌");
      }
    });

    const errorListener = addErrorListener((error) => {
      setDownloads((prev) => {
        const newDownloads = { ...prev };
        delete newDownloads[error.id];
        return newDownloads;
      });

      if (error.state === "CANCELLED") toast.info("Download cancelled 🟡");
      else {
        toast.error("Download failed ❌");
        console.error("Download error:", error);
      }
    });

    return () => {
      progressListener.remove();
      completeListener.remove();
      errorListener.remove();
    };
  }, []);

  const startDownload = async (
    item: BaseItemDto,
    url: string,
    data: DownloadOptionsData
  ) => {
    if (!item.Id || !item.Name) throw new Error("Item ID or Name is missing");
    const jobId = item.Id;

    const itemImage = getItemImage({
      item,
      api: api!,
      variant: "Primary",
      quality: 90,
      width: 500,
    });

    const res = await getStreamUrl({
      api,
      item,
      startTimeTicks: 0,
      userId: user?.Id,
      audioStreamIndex: data.selectedAudioStream,
      maxStreamingBitrate: data.maxBitrate,
      mediaSourceId: data.selectedMediaSource.Id,
      subtitleStreamIndex: data.selectedSubtitleStream,
      deviceProfile: download,
    });

    if (!res) throw new Error("Failed to get stream URL");
    const { mediaSource } = res;
    if (!mediaSource) throw new Error("Failed to get media source");

    await saveImage(item.Id, itemImage?.uri);

    if (!url.includes("master.m3u8"))
      throw new Error("Only HLS downloads are supported");

    downloadHLSAsset(jobId, url, {
      item,
      mediaSource,
    });
  };

  return (
    <DownloadContext.Provider
      value={{
        downloads,
        startDownload,
        downloadedFiles: downloadedFiles ?? [],
        getDownloadedItem: getDownloadedFile,
        activeDownloads: Object.values(downloads),
        cancelDownload: cancelDownload,
        refetchDownloadedFiles,
      }}
    >
      {children}
    </DownloadContext.Provider>
  );
};

export const useNativeDownloads = () => {
  const context = useContext(DownloadContext);
  if (context === undefined) {
    throw new Error(
      "useDownloads must be used within a NativeDownloadProvider"
    );
  }
  return context;
};

import useImageStorage from "@/hooks/useImageStorage";
import {
  addCompleteListener,
  addErrorListener,
  addProgressListener,
  checkForExistingDownloads,
  downloadHLSAsset,
} from "@/modules/hls-downloader";
import {
  DownloadInfo,
  DownloadMetadata,
} from "@/modules/hls-downloader/src/HlsDownloader.types";
import { getItemImage } from "@/utils/getItemImage";
import { rewriteM3U8Files } from "@/utils/movpkg-to-vlc/tools";
import {
  BaseItemDto,
  MediaSourceInfo,
} from "@jellyfin/sdk/lib/generated-client/models";
import RNBackgroundDownloader from "@kesha-antonov/react-native-background-downloader";
import * as FileSystem from "expo-file-system";
import { useAtomValue } from "jotai";
import { createContext, useContext, useEffect, useState } from "react";
import { toast } from "sonner-native";
import { apiAtom, userAtom } from "./JellyfinProvider";
import { getStreamUrl } from "@/utils/jellyfin/media/getStreamUrl";
import download from "@/utils/profiles/download";
import { useQuery } from "@tanstack/react-query";

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
  cancelDownload: (id: string) => void;
  getDownloadedItem: (id: string) => Promise<DownloadMetadata | null>;
  activeDownloads: DownloadInfo[];
  downloadedFiles: DownloadedFileInfo[];
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

const listDownloadedFiles = async (): Promise<DownloadedFileInfo[]> => {
  const downloadsDir = FileSystem.documentDirectory + "downloads/";
  const dirInfo = await FileSystem.getInfoAsync(downloadsDir);
  if (!dirInfo.exists) return [];
  const files = await FileSystem.readDirectoryAsync(downloadsDir);
  const downloaded: DownloadedFileInfo[] = [];

  for (const file of files) {
    const fileInfo = await FileSystem.getInfoAsync(downloadsDir + file);
    if (fileInfo.isDirectory) continue;

    console.log(file);

    const doneFile = await isFileMarkedAsDone(file.replace(".json", ""));
    if (!doneFile) continue;

    const fileContent = await FileSystem.readAsStringAsync(
      downloadsDir + file.replace("-done", "")
    );

    downloaded.push({
      id: file.replace(".json", ""),
      path: downloadsDir + file.replace(".json", ""),
      metadata: JSON.parse(fileContent) as DownloadMetadata,
    });
  }
  console.log(downloaded);
  return downloaded;
};

const getDownloadedItem = async (id: string) => {
  const downloadsDir = FileSystem.documentDirectory + "downloads/";
  const fileInfo = await FileSystem.getInfoAsync(downloadsDir + id + ".json");
  if (!fileInfo.exists) return null;
  const doneFile = await isFileMarkedAsDone(id);
  if (!doneFile) return null;
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

  const user = useAtomValue(userAtom);
  const api = useAtomValue(apiAtom);

  const { data: downloadedFiles } = useQuery({
    queryKey: ["downloadedFiles"],
    queryFn: listDownloadedFiles,
  });

  useEffect(() => {
    // Initialize downloads from both HLS and regular downloads
    const initializeDownloads = async () => {
      // Check HLS downloads
      const hlsDownloads = await checkForExistingDownloads();
      const hlsDownloadStates = hlsDownloads.reduce(
        (acc, download) => ({
          ...acc,
          [download.id]: {
            id: download.id,
            progress: download.progress,
            state: download.state,
            bytesDownloaded: download.bytesDownloaded,
            bytesTotal: download.bytesTotal,
          },
        }),
        {}
      );

      // Check regular downloads
      const regularDownloads =
        await RNBackgroundDownloader.checkForExistingDownloads();
      const regularDownloadStates = regularDownloads.reduce(
        (acc, download) => ({
          ...acc,
          [download.id]: {
            id: download.id,
            progress: download.bytesDownloaded / download.bytesTotal,
            state: download.state,
            bytesDownloaded: download.bytesDownloaded,
            bytesTotal: download.bytesTotal,
          },
        }),
        {}
      );

      setDownloads({ ...hlsDownloadStates, ...regularDownloadStates });
    };

    initializeDownloads();

    // Set up HLS download listeners
    const progressListener = addProgressListener((download) => {
      console.log("[HLS] Download progress:", download);
      setDownloads((prev) => ({
        ...prev,
        [download.id]: {
          id: download.id,
          progress: download.progress,
          state: download.state,
          bytesDownloaded: download.bytesDownloaded,
          bytesTotal: download.bytesTotal,
        },
      }));
    });

    const completeListener = addCompleteListener(async (payload) => {
      if (!payload?.id) throw new Error("No id found in payload");

      try {
        rewriteM3U8Files(payload.location);
        markFileAsDone(payload.id);
        toast.success("Download complete ✅");
      } catch (error) {
        console.error("Failed to persist file:", error);
        toast.error("Failed to download ❌");
      }

      setDownloads((prev) => {
        const newDownloads = { ...prev };
        delete newDownloads[payload.id];
        return newDownloads;
      });
    });

    const errorListener = addErrorListener((error) => {
      console.error("Download error:", error);
      if (error.id) {
        setDownloads((prev) => {
          const newDownloads = { ...prev };
          delete newDownloads[error.id];
          return newDownloads;
        });
      }
    });

    return () => {
      progressListener.remove();
      completeListener.remove();
      errorListener.remove();
    };
  }, []);

  useEffect(() => {
    // Go through all the files in the folder downloads, check for the file id.json and id-done.json, if the id.json exists but id-done.json does not exist, then the download is still in done but not parsed. Parse it.
    const checkForUnparsedDownloads = async () => {
      let found = false;
      const downloadsFolder = await FileSystem.getInfoAsync(
        FileSystem.documentDirectory + "downloads"
      );
      if (!downloadsFolder.exists) return;
      const files = await FileSystem.readDirectoryAsync(
        FileSystem.documentDirectory + "downloads"
      );
      for (const file of files) {
        if (file.endsWith(".json")) {
          const id = file.replace(".json", "");
          const doneFile = await FileSystem.getInfoAsync(
            FileSystem.documentDirectory + "downloads/" + id + "-done"
          );
          if (!doneFile.exists) {
            console.log("Found unparsed download:", id);

            const p = async () => {
              await markFileAsDone(id);
              rewriteM3U8Files(
                FileSystem.documentDirectory + "downloads/" + id
              );
            };
            toast.promise(p(), {
              error: () => "Failed to download ❌",
              loading: "Finishing up download...",
              success: () => "Download complete ✅",
            });
            found = true;
          }
        }
      }
    };
    checkForUnparsedDownloads();
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

    if (url.includes("master.m3u8")) {
      // HLS download
      downloadHLSAsset(jobId, url, {
        item,
        mediaSource,
      });
    } else {
      // Regular download
      try {
        const task = RNBackgroundDownloader.download({
          id: jobId,
          url: url,
          destination: `${FileSystem.documentDirectory}${jobId}/${item.Name}.mkv`,
        });

        task.begin(({ expectedBytes }) => {
          setDownloads((prev) => ({
            ...prev,
            [jobId]: {
              id: jobId,
              progress: 0,
              state: "DOWNLOADING",
            },
          }));
        });

        task.progress(({ bytesDownloaded, bytesTotal }) => {
          console.log(
            "[Normal] Download progress:",
            bytesDownloaded,
            bytesTotal
          );
          setDownloads((prev) => ({
            ...prev,
            [jobId]: {
              id: jobId,
              progress: bytesDownloaded / bytesTotal,
              state: "DOWNLOADING",
            },
          }));
        });

        task.done(() => {
          setDownloads((prev) => {
            const newDownloads = { ...prev };
            delete newDownloads[jobId];
            return newDownloads;
          });
        });

        task.error(({ error }) => {
          console.error("Download error:", error);
          setDownloads((prev) => {
            const newDownloads = { ...prev };
            delete newDownloads[jobId];
            return newDownloads;
          });
        });
      } catch (error) {
        console.error("Error starting download:", error);
      }
    }
  };

  const cancelDownload = (id: string) => {
    // Implement cancel logic here
    setDownloads((prev) => {
      const newDownloads = { ...prev };
      delete newDownloads[id];
      return newDownloads;
    });
  };

  return (
    <DownloadContext.Provider
      value={{
        downloads,
        startDownload,
        cancelDownload,
        downloadedFiles,
        getDownloadedItem: getDownloadedItem,
        activeDownloads: Object.values(downloads),
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

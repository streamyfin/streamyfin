import { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import RNBackgroundDownloader, {
  DownloadTaskState,
} from "@kesha-antonov/react-native-background-downloader";
import { createContext, useContext, useEffect, useState } from "react";
import {
  addCompleteListener,
  addErrorListener,
  addProgressListener,
  checkForExistingDownloads,
  downloadHLSAsset,
} from "@/modules/hls-downloader";
import * as FileSystem from "expo-file-system";
import { DownloadInfo } from "@/modules/hls-downloader/src/HlsDownloader.types";
import { processStream } from "@/utils/hls/av-file-parser";

type DownloadContextType = {
  downloads: Record<string, DownloadInfo>;
  startDownload: (item: BaseItemDto, url: string) => Promise<void>;
  cancelDownload: (id: string) => void;
};

const DownloadContext = createContext<DownloadContextType | undefined>(
  undefined
);

const persistDownloadedFile = async (
  originalLocation: string,
  fileName: string
) => {
  const destinationDir = `${FileSystem.documentDirectory}downloads/`;
  const newLocation = `${destinationDir}${fileName}`;

  try {
    // Ensure the downloads directory exists
    await FileSystem.makeDirectoryAsync(destinationDir, {
      intermediates: true,
    });

    // Move the file to its final destination
    await FileSystem.moveAsync({
      from: originalLocation,
      to: newLocation,
    });

    return newLocation;
  } catch (error) {
    console.error("Error persisting file:", error);
    throw error;
  }
};

export const NativeDownloadProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const [downloads, setDownloads] = useState<Record<string, DownloadInfo>>({});

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
        },
      }));
    });

    const completeListener = addCompleteListener(async (payload) => {
      if (typeof payload === "string") {
        // Handle string ID (old HLS downloads)
        setDownloads((prev) => {
          const newDownloads = { ...prev };
          delete newDownloads[payload];
          return newDownloads;
        });
      } else {
        // Handle OnCompleteEventPayload (with location)
        console.log("Download complete event received:", payload);
        console.log("Original download location:", payload.location);

        try {
          if (payload?.metadata?.Name) {
            const newLocation = await persistDownloadedFile(
              payload.location,
              payload.metadata.Name
            );
            console.log("File successfully persisted to:", newLocation);

            processStream(newLocation);
          } else {
            console.log(
              "No filename in metadata, using original location",
              payload
            );
          }
        } catch (error) {
          console.error("Failed to persist file:", error);
        }

        setDownloads((prev) => {
          const newDownloads = { ...prev };
          delete newDownloads[payload.id];
          return newDownloads;
        });
      }
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

  const startDownload = async (item: BaseItemDto, url: string) => {
    if (!item.Id || !item.Name) throw new Error("Item ID or Name is missing");
    const jobId = item.Id;

    if (url.includes("master.m3u8")) {
      // HLS download
      downloadHLSAsset(jobId, url, item.Name, {
        Name: item.Name,
      });
    } else {
      // Regular download
      try {
        const task = RNBackgroundDownloader.download({
          id: jobId,
          url: url,
          destination: `${FileSystem.documentDirectory}${jobId}`,
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
      value={{ downloads, startDownload, cancelDownload }}
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

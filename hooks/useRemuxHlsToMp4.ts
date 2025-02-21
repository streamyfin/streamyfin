import { useDownload } from "@/providers/DownloadProvider";
import { apiAtom } from "@/providers/JellyfinProvider";
import { getItemImage } from "@/utils/getItemImage";
import { writeErrorLog, writeInfoLog, writeToLog } from "@/utils/log";
import {
  BaseItemDto,
  MediaSourceInfo,
} from "@jellyfin/sdk/lib/generated-client/models";
import { useQueryClient } from "@tanstack/react-query";
import * as FileSystem from "expo-file-system";
import { useRouter } from "expo-router";

// import { FFmpegKit, FFmpegSession, Statistics } from "ffmpeg-kit-react-native";
const FFMPEGKitReactNative = !Platform.isTV
  ? require("ffmpeg-kit-react-native")
  : null;
import { useAtomValue } from "jotai";
import { useCallback } from "react";
import { toast } from "sonner-native";
import useImageStorage from "./useImageStorage";
import useDownloadHelper from "@/utils/download";
import { Api } from "@jellyfin/sdk";
import { useSettings } from "@/utils/atoms/settings";
import { JobStatus } from "@/utils/optimize-server";
import { Platform } from "react-native";
import { useTranslation } from "react-i18next";

type FFmpegSession = typeof FFMPEGKitReactNative.FFmpegSession;
type Statistics = typeof FFMPEGKitReactNative.Statistics;
const FFmpegKit = Platform.isTV
  ? null
  : (FFMPEGKitReactNative.FFmpegKit as typeof FFMPEGKitReactNative.FFmpegKit);
const createFFmpegCommand = (url: string, output: string) => [
  "-y", // overwrite output files without asking
  "-thread_queue_size 512", // https://ffmpeg.org/ffmpeg.html#toc-Advanced-options

  // region ffmpeg protocol commands                    // https://ffmpeg.org/ffmpeg-protocols.html
  "-protocol_whitelist file,http,https,tcp,tls,crypto", // whitelist
  "-multiple_requests 1", // http
  "-tcp_nodelay 1", // http
  // endregion ffmpeg protocol commands

  "-fflags +genpts", // format flags
  `-i ${url}`, // infile
  "-map 0:v -map 0:a", // select all streams for video & audio
  "-c copy", // streamcopy, preventing transcoding
  "-bufsize 25M", // amount of data processed before calculating current bitrate
  "-max_muxing_queue_size 4096", // sets the size of stream buffer in packets for output
  output,
];

/**
 * Custom hook for remuxing HLS to MP4 using FFmpeg.
 *
 * @param url - The URL of the HLS stream
 * @param item - The BaseItemDto object representing the media item
 * @returns An object with remuxing-related functions
 */
export const useRemuxHlsToMp4 = () => {
  const api = useAtomValue(apiAtom);
  const router = useRouter();
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  const [settings] = useSettings();
  const { saveImage } = useImageStorage();
  const { saveSeriesPrimaryImage } = useDownloadHelper();
  const {
    saveDownloadedItemInfo,
    setProcesses,
    processes,
    APP_CACHE_DOWNLOAD_DIRECTORY,
  } = useDownload();

  const onSaveAssets = async (api: Api, item: BaseItemDto) => {
    await saveSeriesPrimaryImage(item);
    const itemImage = getItemImage({
      item,
      api,
      variant: "Primary",
      quality: 90,
      width: 500,
    });

    await saveImage(item.Id, itemImage?.uri);
  };

  const completeCallback = useCallback(
    async (session: FFmpegSession, item: BaseItemDto) => {
      try {
        console.log("completeCallback");
        const returnCode = await session.getReturnCode();

        if (returnCode.isValueSuccess()) {
          const stat = await session.getLastReceivedStatistics();
          await FileSystem.moveAsync({
            from: `${APP_CACHE_DOWNLOAD_DIRECTORY}${item.Id}.mp4`,
            to: `${FileSystem.documentDirectory}${item.Id}.mp4`,
          });
          await queryClient.invalidateQueries({
            queryKey: ["downloadedItems"],
          });
          saveDownloadedItemInfo(item, stat.getSize());
          toast.success(t("home.downloads.toasts.download_completed"));
        }

        setProcesses((prev: any[]) => {
          return prev.filter(
            (process: { itemId: string | undefined }) =>
              process.itemId !== item.Id
          );
        });
      } catch (e) {
        console.error(e);
      }

      console.log("completeCallback ~ end");
    },
    [processes, setProcesses]
  );

  const statisticsCallback = useCallback(
    (statistics: Statistics, item: BaseItemDto) => {
      const videoLength =
        (item.MediaSources?.[0]?.RunTimeTicks || 0) / 10000000; // In seconds
      const fps = item.MediaStreams?.[0]?.RealFrameRate || 25;
      const totalFrames = videoLength * fps;
      const processedFrames = statistics.getVideoFrameNumber();
      const speed = statistics.getSpeed();

      const percentage =
        totalFrames > 0 ? Math.floor((processedFrames / totalFrames) * 100) : 0;

      if (!item.Id) throw new Error("Item is undefined");
      setProcesses((prev: any[]) => {
        return prev.map((process: { itemId: string | undefined }) => {
          if (process.itemId === item.Id) {
            return {
              ...process,
              id: statistics.getSessionId().toString(),
              progress: percentage,
              speed: Math.max(speed, 0),
            };
          }
          return process;
        });
      });
    },
    [setProcesses, completeCallback]
  );

  const startRemuxing = useCallback(
    async (item: BaseItemDto, url: string, mediaSource: MediaSourceInfo) => {
      const cacheDir = await FileSystem.getInfoAsync(
        APP_CACHE_DOWNLOAD_DIRECTORY
      );
      if (!cacheDir.exists) {
        await FileSystem.makeDirectoryAsync(APP_CACHE_DOWNLOAD_DIRECTORY, {
          intermediates: true,
        });
      }

      const output = APP_CACHE_DOWNLOAD_DIRECTORY + `${item.Id}.mp4`;

      if (!api) throw new Error("API is not defined");
      if (!item.Id) throw new Error("Item must have an Id");

      // First lets save any important assets we want to present to the user offline
      await onSaveAssets(api, item);

      toast.success(
        t("home.downloads.toasts.download_started_for", { item: item.Name }),
        {
          action: {
            label: "Go to download",
            onClick: () => {
              router.push("/downloads");
              toast.dismiss();
            },
          },
        }
      );

      try {
        const job: JobStatus = {
          id: "",
          deviceId: "",
          inputUrl: url,
          item: item,
          itemId: item.Id!,
          outputPath: output,
          progress: 0,
          status: "downloading",
          timestamp: new Date(),
        };

        writeInfoLog(`useRemuxHlsToMp4 ~ startRemuxing for item ${item.Name}`);
        setProcesses((prev: any) => [...prev, job]);

        await FFmpegKit.executeAsync(
          createFFmpegCommand(url, output).join(" "),
          (session: any) => completeCallback(session, item),
          undefined,
          (s: any) => statisticsCallback(s, item)
        );
      } catch (e) {
        const error = e as Error;
        console.error("Failed to remux:", error);
        writeErrorLog(
          `useRemuxHlsToMp4 ~ remuxing failed for item: ${item.Name}, 
          Error: ${error.message}, Stack: ${error.stack}`
        );
        setProcesses((prev: any[]) => {
          return prev.filter(
            (process: { itemId: string | undefined }) =>
              process.itemId !== item.Id
          );
        });
        throw error; // Re-throw the error to propagate it to the caller
      }
    },
    [settings, processes, setProcesses, completeCallback, statisticsCallback]
  );

  const cancelRemuxing = useCallback(() => {
    FFmpegKit.cancel();
    setProcesses([]);
  }, []);

  return { startRemuxing, cancelRemuxing };
};

import { useDownload } from "@/providers/DownloadProvider";
import { apiAtom } from "@/providers/JellyfinProvider";
import { getItemImage } from "@/utils/getItemImage";
import { writeToLog } from "@/utils/log";
import {
  BaseItemDto,
  MediaSourceInfo,
} from "@jellyfin/sdk/lib/generated-client/models";
import { useQueryClient } from "@tanstack/react-query";
import * as FileSystem from "expo-file-system";
import { useRouter } from "expo-router";
import { FFmpegKit, FFmpegKitConfig } from "ffmpeg-kit-react-native";
import { useAtomValue } from "jotai";
import { useCallback } from "react";
import { toast } from "sonner-native";
import useImageStorage from "./useImageStorage";
import useDownloadHelper from "@/utils/download";

/**
 * Custom hook for remuxing HLS to MP4 using FFmpeg.
 *
 * @param url - The URL of the HLS stream
 * @param item - The BaseItemDto object representing the media item
 * @returns An object with remuxing-related functions
 */
export const useRemuxHlsToMp4 = () => {
  const api = useAtomValue(apiAtom);
  const queryClient = useQueryClient();
  const { saveDownloadedItemInfo, setProcesses } = useDownload();
  const router = useRouter();
  const { saveImage } = useImageStorage();
  const { saveSeriesPrimaryImage } = useDownloadHelper();

  const startRemuxing = useCallback(
    async (item: BaseItemDto, url: string, mediaSource: MediaSourceInfo) => {
      const output = `${FileSystem.documentDirectory}${item.Id}.mp4`;
      if (!api) throw new Error("API is not defined");
      if (!item.Id) throw new Error("Item must have an Id");

      await saveSeriesPrimaryImage(item);
      const itemImage = getItemImage({
        item,
        api,
        variant: "Primary",
        quality: 90,
        width: 500,
      });

      await saveImage(item.Id, itemImage?.uri);

      toast.success(`Download started for ${item.Name}`, {
        action: {
          label: "Go to download",
          onClick: () => {
            router.push("/downloads");
            toast.dismiss();
          },
        },
      });

      const command = `-y -thread_queue_size 512 -protocol_whitelist file,http,https,tcp,tls,crypto -multiple_requests 1 -tcp_nodelay 1 -fflags +genpts -i ${url} -map 0:v -map 0:a -c copy -bufsize 50M -max_muxing_queue_size 4096 ${output}`;

      writeToLog(
        "INFO",
        `useRemuxHlsToMp4 ~ startRemuxing for item ${item.Name}`
      );

      try {
        setProcesses((prev) => [
          ...prev,
          {
            id: "",
            deviceId: "",
            inputUrl: "",
            item: item,
            itemId: item.Id!,
            outputPath: "",
            progress: 0,
            status: "downloading",
            timestamp: new Date(),
          },
        ]);

        FFmpegKitConfig.enableStatisticsCallback((statistics) => {
          const videoLength =
            (item.MediaSources?.[0]?.RunTimeTicks || 0) / 10000000; // In seconds
          const fps = item.MediaStreams?.[0]?.RealFrameRate || 25;
          const totalFrames = videoLength * fps;
          const processedFrames = statistics.getVideoFrameNumber();
          const speed = statistics.getSpeed();

          const percentage =
            totalFrames > 0
              ? Math.floor((processedFrames / totalFrames) * 100)
              : 0;

          if (!item.Id) throw new Error("Item is undefined");
          setProcesses((prev) => {
            return prev.map((process) => {
              if (process.itemId === item.Id) {
                return {
                  ...process,
                  progress: percentage,
                  speed: Math.max(speed, 0),
                };
              }
              return process;
            });
          });
        });

        // Await the execution of the FFmpeg command and ensure that the callback is awaited properly.
        await new Promise<void>((resolve, reject) => {
          FFmpegKit.executeAsync(command, async (session) => {
            try {
              const returnCode = await session.getReturnCode();
              const startTime = new Date();

              let endTime;
              if (returnCode.isValueSuccess()) {
                endTime = new Date();
                writeToLog(
                  "INFO",
                  `useRemuxHlsToMp4 ~ remuxing completed successfully for item: ${
                    item.Name
                  }, start time: ${startTime.toISOString()}, end time: ${endTime.toISOString()}, duration: ${
                    (endTime.getTime() - startTime.getTime()) / 1000
                  }s`
                );
                if (!item) throw new Error("Item is undefined");
                await saveDownloadedItemInfo(item);
                toast.success("Download completed");
                await queryClient.invalidateQueries({
                  queryKey: ["downloadedItems"],
                });
                resolve();
              } else if (returnCode.isValueError()) {
                endTime = new Date();
                const allLogs = session.getAllLogsAsString();
                writeToLog(
                  "ERROR",
                  `useRemuxHlsToMp4 ~ remuxing failed for item: ${
                    item.Name
                  }, start time: ${startTime.toISOString()}, end time: ${endTime.toISOString()}, duration: ${
                    (endTime.getTime() - startTime.getTime()) / 1000
                  }s. All logs: ${allLogs}`
                );
                reject(new Error("Remuxing failed"));
              } else if (returnCode.isValueCancel()) {
                endTime = new Date();
                writeToLog(
                  "INFO",
                  `useRemuxHlsToMp4 ~ remuxing was canceled for item: ${
                    item.Name
                  }, start time: ${startTime.toISOString()}, end time: ${endTime.toISOString()}, duration: ${
                    (endTime.getTime() - startTime.getTime()) / 1000
                  }s`
                );
                resolve();
              }

              setProcesses((prev) => {
                return prev.filter((process) => process.itemId !== item.Id);
              });
            } catch (e) {
              const error = e as Error;
              const errorLog = `Error: ${error.message}, Stack: ${error.stack}`;
              writeToLog(
                "ERROR",
                `useRemuxHlsToMp4 ~ Exception during remuxing for item: ${item.Name}, ${errorLog}`
              );
              reject(error);
            }
          });
        });
      } catch (e) {
        const error = e as Error;
        const errorLog = `Error: ${error.message}, Stack: ${error.stack}`;
        console.error("Failed to remux:", error);
        writeToLog(
          "ERROR",
          `useRemuxHlsToMp4 ~ remuxing failed for item: ${item.Name}, ${errorLog}`
        );
        setProcesses((prev) => {
          return prev.filter((process) => process.itemId !== item.Id);
        });
        throw error; // Re-throw the error to propagate it to the caller
      }
    },
    []
  );

  const cancelRemuxing = useCallback(() => {
    FFmpegKit.cancel();
    setProcesses([]);
  }, []);

  return { startRemuxing, cancelRemuxing };
};

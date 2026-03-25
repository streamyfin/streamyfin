import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { t } from "i18next";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  TouchableOpacity,
  type TouchableOpacityProps,
  View,
} from "react-native";
import { toast } from "sonner-native";
import { Text } from "@/components/common/Text";
import useRouter from "@/hooks/useAppRouter";
import { useNetworkAwareQueryClient } from "@/hooks/useNetworkAwareQueryClient";
import { useDownload } from "@/providers/DownloadProvider";
import { calculateSmoothedETA } from "@/providers/Downloads/hooks/useDownloadSpeedCalculator";
import { JobStatus } from "@/providers/Downloads/types";
import { estimateDownloadSize } from "@/utils/download";
import { storage } from "@/utils/mmkv";
import { formatTimeString } from "@/utils/time";

const bytesToMB = (bytes: number) => {
  return bytes / 1024 / 1024;
};

const formatBytes = (bytes: number): string => {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
};

interface DownloadCardProps extends TouchableOpacityProps {
  process: JobStatus;
}

export const DownloadCard = ({ process, ...props }: DownloadCardProps) => {
  const { cancelDownload, pauseDownload, resumeDownload, retryDownload } =
    useDownload();
  const router = useRouter();
  const queryClient = useNetworkAwareQueryClient();
  const [showDebug, setShowDebug] = useState(false);

  const handleCancel = async (id: string) => {
    try {
      await cancelDownload(id);
      queryClient.invalidateQueries({ queryKey: ["downloads"] });
    } catch (error) {
      console.error("Error cancelling download:", error);
      toast.error(t("home.downloads.toasts.could_not_delete_download"));
    }
  };

  const handlePause = async (id: string) => {
    try {
      await pauseDownload(id);
    } catch (error) {
      console.error("Error pausing download:", error);
    }
  };

  const handleResume = async (id: string) => {
    try {
      await resumeDownload(id);
    } catch (error) {
      console.error("Error resuming download:", error);
    }
  };

  const handleRetry = async (id: string) => {
    try {
      await retryDownload(id);
    } catch (error) {
      console.error("Error retrying download:", error);
    }
  };

  const eta = useMemo(() => {
    if (!process?.estimatedTotalSizeBytes || !process?.bytesDownloaded) {
      return null;
    }

    const secondsRemaining = calculateSmoothedETA(
      process.id,
      process.bytesDownloaded,
      process.estimatedTotalSizeBytes,
    );

    if (!secondsRemaining || secondsRemaining <= 0) {
      return null;
    }

    return formatTimeString(secondsRemaining, "s");
  }, [process?.id, process?.bytesDownloaded, process?.estimatedTotalSizeBytes]);

  const estimatedSize = useMemo(() => {
    if (process?.estimatedTotalSizeBytes)
      return process.estimatedTotalSizeBytes;

    // Calculate from bitrate + duration (only if bitrate value is defined)
    if (process?.maxBitrate?.value && process?.item?.RunTimeTicks) {
      return estimateDownloadSize(
        process.maxBitrate.value,
        process.item.RunTimeTicks,
      );
    }

    return undefined;
  }, [
    process?.maxBitrate?.value,
    process?.item?.RunTimeTicks,
    process?.estimatedTotalSizeBytes,
  ]);

  const isTranscoding = process?.isTranscoding || false;
  const isPaused = process?.status === "paused";
  const isResuming = process?.status === "resuming";
  const isError = process?.status === "error";
  const isResumable = process?.isResumable ?? false;
  const isDownloading = process?.status === "downloading";
  const isTranscodingLocal = process?.status === "transcoding";

  const downloadedAmount = useMemo(() => {
    if (!process?.bytesDownloaded) return null;
    return formatBytes(process.bytesDownloaded);
  }, [process?.bytesDownloaded]);

  const base64Image = useMemo(() => {
    try {
      const itemId = process?.item?.Id;
      if (!itemId) return undefined;
      return storage.getString(itemId);
    } catch {
      return undefined;
    }
  }, [process?.item?.Id]);

  // Sanitize progress to ensure it's within valid bounds
  const sanitizedProgress = useMemo(() => {
    if (
      isTranscodingLocal &&
      process?.localTranscodeState?.progress !== undefined
    ) {
      return Math.max(0, Math.min(100, process.localTranscodeState.progress));
    }
    if (
      typeof process?.progress !== "number" ||
      Number.isNaN(process.progress)
    ) {
      return 0;
    }
    return Math.max(0, Math.min(100, process.progress));
  }, [
    process?.progress,
    process?.localTranscodeState?.progress,
    isTranscodingLocal,
  ]);

  // Return null after all hooks have been called
  if (!process || !process.item || !process.item.Id) {
    return null;
  }

  // Determine progress bar color based on status
  const progressBarColor = isPaused
    ? "bg-yellow-500"
    : isResuming
      ? "bg-blue-500"
      : isError
        ? "bg-red-500"
        : isTranscodingLocal
          ? "bg-cyan-500"
          : "bg-purple-600";

  return (
    <TouchableOpacity
      onPress={() => router.push(`/(auth)/items/page?id=${process.item.Id}`)}
      className='relative bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden'
      {...props}
    >
      {(isDownloading || isPaused || isResuming || isTranscodingLocal) && (
        <View
          className={`${progressBarColor} h-1 absolute bottom-0 left-0 ${isTranscodingLocal || (isTranscoding && isDownloading) ? "animate-pulse" : ""}`}
          style={{
            width:
              sanitizedProgress > 0
                ? `${Math.max(5, sanitizedProgress)}%`
                : "5%",
          }}
        />
      )}

      {/* Action buttons in bottom right corner */}
      <View className='absolute bottom-2 right-2 flex flex-row items-center gap-x-1 z-10'>
        {/* Debug button */}
        <TouchableOpacity
          onPress={() => setShowDebug(!showDebug)}
          className='p-2 bg-neutral-800 rounded-full'
        >
          <Ionicons name='bug-outline' size={18} color='#9ca3af' />
        </TouchableOpacity>

        {/* Pause/Resume button */}
        {isDownloading && (
          <TouchableOpacity
            onPress={() => handlePause(process.id)}
            className='p-2 bg-neutral-800 rounded-full'
          >
            <Ionicons name='pause' size={18} color='#facc15' />
          </TouchableOpacity>
        )}

        {/* Resume button for paused downloads */}
        {isPaused && isResumable && (
          <TouchableOpacity
            onPress={() => handleResume(process.id)}
            className='p-2 bg-neutral-800 rounded-full'
          >
            <Ionicons name='play' size={18} color='#22c55e' />
          </TouchableOpacity>
        )}

        {/* Retry button for failed resumable downloads */}
        {isError && isResumable && (
          <TouchableOpacity
            onPress={() => handleRetry(process.id)}
            className='p-2 bg-neutral-800 rounded-full'
          >
            <Ionicons name='refresh' size={18} color='#3b82f6' />
          </TouchableOpacity>
        )}

        {/* Cancel button */}
        <TouchableOpacity
          onPress={() => handleCancel(process.id)}
          className='p-2 bg-neutral-800 rounded-full'
        >
          <Ionicons name='close' size={20} color='red' />
        </TouchableOpacity>
      </View>

      <View className='px-3 py-1.5 flex flex-col w-full'>
        <View className='flex flex-row items-center w-full'>
          {base64Image && (
            <View className='w-14 aspect-[10/15] rounded-lg overflow-hidden mr-4'>
              <Image
                source={{
                  uri: `data:image/jpeg;base64,${base64Image}`,
                }}
                style={{
                  width: "100%",
                  height: "100%",
                }}
                contentFit='cover'
              />
            </View>
          )}
          <View className='shrink mb-1 flex-1 pr-16'>
            <Text className='text-xs opacity-50'>{process.item.Type}</Text>
            <Text className='font-semibold shrink'>{process.item.Name}</Text>
            <Text className='text-xs opacity-50'>
              {process.item.ProductionYear}
            </Text>

            {/* Status badges */}
            <View className='flex flex-row gap-x-1 mt-1'>
              {(isTranscoding || isTranscodingLocal) && (
                <View className='bg-purple-600/20 px-2 py-0.5 rounded-md self-start'>
                  <Text className='text-xs text-purple-400'>
                    {isTranscodingLocal ? "Transcoding Locally" : "Transcoding"}
                  </Text>
                </View>
              )}
              {isPaused && (
                <View className='bg-yellow-500/20 px-2 py-0.5 rounded-md self-start'>
                  <Text className='text-xs text-yellow-400'>
                    {t("home.downloads.paused", { defaultValue: "Paused" })}
                  </Text>
                </View>
              )}
              {isResuming && (
                <View className='bg-blue-500/20 px-2 py-0.5 rounded-md self-start'>
                  <Text className='text-xs text-blue-400'>
                    {t("home.downloads.resuming", {
                      defaultValue: "Resuming...",
                    })}
                  </Text>
                </View>
              )}
              {isError && (
                <View className='bg-red-500/20 px-2 py-0.5 rounded-md self-start'>
                  <Text className='text-xs text-red-400'>
                    {isResumable
                      ? t("home.downloads.error_resumable", {
                          defaultValue: "Error - Tap to retry",
                        })
                      : t("home.downloads.error", {
                          defaultValue: "Failed",
                        })}
                  </Text>
                </View>
              )}
            </View>

            {/* Row 1: Progress + Downloaded/Total */}
            <View className='flex flex-row items-center gap-x-2 mt-1.5'>
              {sanitizedProgress === 0 && isDownloading ? (
                <ActivityIndicator size={"small"} color={"white"} />
              ) : (
                <Text className='text-xs font-semibold'>
                  {sanitizedProgress.toFixed(0)}%
                </Text>
              )}
              {downloadedAmount && (
                <Text className='text-xs opacity-75'>
                  {downloadedAmount}
                  {estimatedSize
                    ? ` / ${isTranscoding ? "~" : ""}${formatBytes(estimatedSize)}`
                    : ""}
                </Text>
              )}
            </View>

            {/* Row 2: Speed + ETA (only when actively downloading) */}
            {(isDownloading || isTranscodingLocal) && (
              <View className='flex flex-row items-center gap-x-2 mt-0.5'>
                {isDownloading && process.speed && process.speed > 0 && (
                  <Text className='text-xs text-purple-400'>
                    {bytesToMB(process.speed).toFixed(2)} MB/s
                  </Text>
                )}
                {isTranscodingLocal && (
                  <View className='flex flex-row items-center gap-x-2'>
                    <ActivityIndicator size={"small"} color={"#2dd4bf"} />
                    {process.localTranscodeState?.speed !== undefined && (
                      <Text className='text-xs text-cyan-400 font-mono'>
                        {process.localTranscodeState.speed.toFixed(2)}x
                      </Text>
                    )}
                    {process.localTranscodeState?.timeInMs !== undefined &&
                      process.localTranscodeState?.durationMs !== undefined && (
                        <Text className='text-[10px] text-neutral-400 font-mono'>
                          {formatTimeString(
                            process.localTranscodeState.timeInMs,
                          )}{" "}
                          /{" "}
                          {formatTimeString(
                            process.localTranscodeState.durationMs,
                          )}
                        </Text>
                      )}
                  </View>
                )}
                {eta && isDownloading && (
                  <Text className='text-xs text-green-400'>
                    {t("home.downloads.eta", { eta: eta })}
                  </Text>
                )}
              </View>
            )}
          </View>
        </View>

        {showDebug && (
          <View className='mt-2 p-2 bg-black/40 rounded-lg'>
            <Text className='text-[10px] font-mono text-neutral-400'>
              ID: {process.id}
              {"\n"}
              Status: {process.status}
              {"\n"}
              Transcoding: {String(process.isTranscoding)}
              {"\n"}
              Resumable: {String(process.isResumable)}
              {"\n"}
              Bytes: {process.bytesDownloaded}
              {"\n"}
              Est Size: {process.estimatedTotalSizeBytes}
              {"\n"}
              Progress: {process.progress}%{"\n"}
              URL: {process.inputUrl}
            </Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
};

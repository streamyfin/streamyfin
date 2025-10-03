import { Ionicons } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { t } from "i18next";
import { useMemo } from "react";
import {
  ActivityIndicator,
  TouchableOpacity,
  type TouchableOpacityProps,
  View,
} from "react-native";
import { toast } from "sonner-native";
import { Text } from "@/components/common/Text";
import { useDownload } from "@/providers/DownloadProvider";
import { calculateSmoothedETA } from "@/providers/Downloads/hooks/useDownloadSpeedCalculator";
import { JobStatus } from "@/providers/Downloads/types";
import { storage } from "@/utils/mmkv";
import { formatTimeString } from "@/utils/time";

const bytesToMB = (bytes: number) => {
  return bytes / 1024 / 1024;
};

interface DownloadCardProps extends TouchableOpacityProps {
  process: JobStatus;
}

export const DownloadCard = ({ process, ...props }: DownloadCardProps) => {
  const { removeProcess } = useDownload();
  const router = useRouter();
  const queryClient = useQueryClient();

  const handleDelete = async (id: string) => {
    try {
      await removeProcess(id);
      toast.success(t("home.downloads.toasts.download_deleted"));
      queryClient.invalidateQueries({ queryKey: ["downloads"] });
    } catch (error) {
      console.error("Error deleting download:", error);
      toast.error(t("home.downloads.toasts.could_not_delete_download"));
    }
  };

  const eta = useMemo(() => {
    if (!process.estimatedTotalSizeBytes || !process.bytesDownloaded) {
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
  }, [process.id, process.bytesDownloaded, process.estimatedTotalSizeBytes]);

  const base64Image = useMemo(() => {
    return storage.getString(process.item.Id!);
  }, []);

  // Sanitize progress to ensure it's within valid bounds
  const sanitizedProgress = useMemo(() => {
    if (
      typeof process.progress !== "number" ||
      Number.isNaN(process.progress)
    ) {
      return 0;
    }
    return Math.max(0, Math.min(100, process.progress));
  }, [process.progress]);

  return (
    <TouchableOpacity
      onPress={() => router.push(`/(auth)/items/page?id=${process.item.Id}`)}
      className='relative bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden'
      {...props}
    >
      {process.status === "downloading" && (
        <View
          className={`
        bg-purple-600 h-1 absolute bottom-0 left-0
        `}
          style={{
            width:
              sanitizedProgress > 0
                ? `${Math.max(5, sanitizedProgress)}%`
                : "5%",
          }}
        />
      )}

      {/* Action buttons in bottom right corner */}
      <View className='absolute bottom-2 right-2 flex flex-row items-center space-x-2 z-10'>
        <TouchableOpacity
          onPress={() => handleDelete(process.id)}
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
          <View className='shrink mb-1 flex-1'>
            <Text className='text-xs opacity-50'>{process.item.Type}</Text>
            <Text className='font-semibold shrink'>{process.item.Name}</Text>
            <Text className='text-xs opacity-50'>
              {process.item.ProductionYear}
            </Text>
            <View className='flex flex-row items-center space-x-2 mt-1 text-purple-600'>
              {sanitizedProgress === 0 ? (
                <ActivityIndicator size={"small"} color={"white"} />
              ) : (
                <Text className='text-xs'>{sanitizedProgress.toFixed(0)}%</Text>
              )}
              {process.speed && process.speed > 0 && (
                <Text className='text-xs'>
                  {bytesToMB(process.speed).toFixed(2)} MB/s
                </Text>
              )}
              {eta && (
                <Text className='text-xs'>
                  {t("home.downloads.eta", { eta: eta })}
                </Text>
              )}
            </View>

            <View className='flex flex-row items-center space-x-2 mt-1 text-purple-600'>
              <Text className='text-xs capitalize'>{process.status}</Text>
            </View>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
};

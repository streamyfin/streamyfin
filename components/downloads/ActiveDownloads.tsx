import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { t } from "i18next";
import { useMemo } from "react";
import {
  ActivityIndicator,
  TouchableOpacity,
  type TouchableOpacityProps,
  View,
  type ViewProps,
} from "react-native";
import { toast } from "sonner-native";
import { Text } from "@/components/common/Text";
import { useDownload } from "@/providers/DownloadProvider";
import { JobStatus } from "@/providers/Downloads/types";
import { storage } from "@/utils/mmkv";
import { formatTimeString } from "@/utils/time";
import { Button } from "../Button";

interface Props extends ViewProps {}

const bytesToMB = (bytes: number) => {
  return bytes / 1024 / 1024;
};

export const ActiveDownloads: React.FC<Props> = ({ ...props }) => {
  const { processes } = useDownload();
  if (processes?.length === 0)
    return (
      <View {...props} className='bg-neutral-900 p-4 rounded-2xl'>
        <Text className='text-lg font-bold'>
          {t("home.downloads.active_download")}
        </Text>
        <Text className='opacity-50'>
          {t("home.downloads.no_active_downloads")}
        </Text>
      </View>
    );

  return (
    <View {...props} className='bg-neutral-900 p-4 rounded-2xl'>
      <Text className='text-lg font-bold mb-2'>
        {t("home.downloads.active_downloads")}
      </Text>
      <View className='space-y-2'>
        {processes?.map((p: JobStatus) => (
          <DownloadCard key={p.item.Id} process={p} />
        ))}
      </View>
    </View>
  );
};

interface DownloadCardProps extends TouchableOpacityProps {
  process: JobStatus;
}

const DownloadCard = ({ process, ...props }: DownloadCardProps) => {
  const { startDownload, removeProcess } = useDownload();
  const router = useRouter();
  const queryClient = useQueryClient();

  const cancelJobMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!process) throw new Error("No active download");
      removeProcess(id);
    },
    onSuccess: () => {
      toast.success(t("home.downloads.toasts.download_cancelled"));
      queryClient.invalidateQueries({ queryKey: ["downloads"] });
    },
    onError: (e) => {
      console.error(e);
      toast.error(t("home.downloads.toasts.could_not_cancel_download"));
    },
  });

  const eta = (p: JobStatus) => {
    if (!p.speed || p.speed <= 0 || !p.estimatedTotalSizeBytes) return null;

    const bytesRemaining = p.estimatedTotalSizeBytes - (p.bytesDownloaded || 0);
    if (bytesRemaining <= 0) return null;

    const secondsRemaining = bytesRemaining / p.speed;

    return formatTimeString(secondsRemaining, "s");
  };

  const base64Image = useMemo(() => {
    return storage.getString(process.item.Id!);
  }, []);

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
            width: process.progress
              ? `${Math.max(5, process.progress)}%`
              : "5%",
          }}
        />
      )}
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
                  resizeMode: "cover",
                }}
              />
            </View>
          )}
          <View className='shrink mb-1'>
            <Text className='text-xs opacity-50'>{process.item.Type}</Text>
            <Text className='font-semibold shrink'>{process.item.Name}</Text>
            <Text className='text-xs opacity-50'>
              {process.item.ProductionYear}
            </Text>
            <View className='flex flex-row items-center space-x-2 mt-1 text-purple-600'>
              {process.progress === 0 ? (
                <ActivityIndicator size={"small"} color={"white"} />
              ) : (
                <Text className='text-xs'>{process.progress.toFixed(0)}%</Text>
              )}
              {process.speed && process.speed > 0 && (
                <Text className='text-xs'>
                  {bytesToMB(process.speed).toFixed(2)} MB/s
                </Text>
              )}
              {eta(process) && (
                <Text className='text-xs'>
                  {t("home.downloads.eta", { eta: eta(process) })}
                </Text>
              )}
            </View>

            <View className='flex flex-row items-center space-x-2 mt-1 text-purple-600'>
              <Text className='text-xs capitalize'>{process.status}</Text>
            </View>
          </View>
          <TouchableOpacity
            disabled={cancelJobMutation.isPending}
            onPress={() => cancelJobMutation.mutate(process.id)}
            className='ml-auto'
          >
            {cancelJobMutation.isPending ? (
              <ActivityIndicator size='small' color='white' />
            ) : (
              <Ionicons name='close' size={24} color='red' />
            )}
          </TouchableOpacity>
        </View>
        {process.status === "completed" && (
          <View className='flex flex-row mt-4 space-x-4'>
            <Button
              onPress={() => {
                startDownload(process);
              }}
              className='w-full'
            >
              Download now
            </Button>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
};

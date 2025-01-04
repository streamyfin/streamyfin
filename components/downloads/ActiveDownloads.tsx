import { Text } from "@/components/common/Text";
import { useDownload } from "@/providers/DownloadProvider";
import { apiAtom } from "@/providers/JellyfinProvider";
import { useSettings } from "@/utils/atoms/settings";
import { JobStatus } from "@/utils/optimize-server";
import { formatTimeString } from "@/utils/time";
import { Ionicons } from "@expo/vector-icons";
import { checkForExistingDownloads } from "@kesha-antonov/react-native-background-downloader";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { FFmpegKit } from "ffmpeg-kit-react-native";
import { useAtom } from "jotai";
import {
  ActivityIndicator,
  TouchableOpacity,
  TouchableOpacityProps,
  View,
  ViewProps,
} from "react-native";
import { toast } from "sonner-native";
import { Button } from "../Button";
import { Image } from "expo-image";
import { useMemo } from "react";
import { storage } from "@/utils/mmkv";
import { t } from "i18next";

interface Props extends ViewProps {}

export const ActiveDownloads: React.FC<Props> = ({ ...props }) => {
  const { processes } = useDownload();
  if (processes?.length === 0)
    return (
      <View {...props} className="bg-neutral-900 p-4 rounded-2xl">
        <Text className="text-lg font-bold">{t("home.downloads.active_download")}</Text>
        <Text className="opacity-50">{t("home.downloads.no_active_downloads")}</Text>
      </View>
    );

  return (
    <View {...props} className="bg-neutral-900 p-4 rounded-2xl">
      <Text className="text-lg font-bold mb-2">{t("home.downloads.active_downloads")}</Text>
      <View className="space-y-2">
        {processes?.map((p) => (
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
  const { processes, startDownload } = useDownload();
  const router = useRouter();
  const { removeProcess, setProcesses } = useDownload();
  const [settings] = useSettings();
  const queryClient = useQueryClient();

  const cancelJobMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!process) throw new Error("No active download");

      if (settings?.downloadMethod === "optimized") {
        try {
          const tasks = await checkForExistingDownloads();
          for (const task of tasks) {
            if (task.id === id) {
              task.stop();
            }
          }
        } catch (e) {
          throw e;
        } finally {
          await removeProcess(id);
          await queryClient.refetchQueries({ queryKey: ["jobs"] });
        }
      } else {
        FFmpegKit.cancel(Number(id));
        setProcesses((prev) => prev.filter((p) => p.id !== id));
      }
    },
    onSuccess: () => {
      toast.success(t("home.downloads.toasts.download_cancelled"));
    },
    onError: (e) => {
      console.error(e);
      toast.error(t("home.downloads.toasts.could_not_cancel_download"));
    },
  });

  const eta = (p: JobStatus) => {
    if (!p.speed || !p.progress) return null;

    const length = p?.item?.RunTimeTicks || 0;
    const timeLeft = (length - length * (p.progress / 100)) / p.speed;
    return formatTimeString(timeLeft, "tick");
  };

  const base64Image = useMemo(() => {
    return storage.getString(process.item.Id!);
  }, []);

  return (
    <TouchableOpacity
      onPress={() => router.push(`/(auth)/items/page?id=${process.item.Id}`)}
      className="relative bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden"
      {...props}
    >
      {(process.status === "optimizing" ||
        process.status === "downloading") && (
        <View
          className={`
        bg-purple-600 h-1 absolute bottom-0 left-0
        `}
          style={{
            width: process.progress
              ? `${Math.max(5, process.progress)}%`
              : "5%",
          }}
        ></View>
      )}
      <View className="px-3 py-1.5 flex flex-col w-full">
        <View className="flex flex-row items-center w-full">
          {base64Image && (
            <View className="w-14 aspect-[10/15] rounded-lg overflow-hidden mr-4">
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
          <View className="shrink mb-1">
            <Text className="text-xs opacity-50">{process.item.Type}</Text>
            <Text className="font-semibold shrink">{process.item.Name}</Text>
            <Text className="text-xs opacity-50">
              {process.item.ProductionYear}
            </Text>
            <View className="flex flex-row items-center space-x-2 mt-1 text-purple-600">
              {process.progress === 0 ? (
                <ActivityIndicator size={"small"} color={"white"} />
              ) : (
                <Text className="text-xs">{process.progress.toFixed(0)}%</Text>
              )}
              {process.speed && (
                <Text className="text-xs">{process.speed?.toFixed(2)}x</Text>
              )}
              {eta(process) && (
                <Text className="text-xs">{t("home.downloads.eta", {eta: eta(process)})}</Text>
              )}
            </View>

            <View className="flex flex-row items-center space-x-2 mt-1 text-purple-600">
              <Text className="text-xs capitalize">{process.status}</Text>
            </View>
          </View>
          <TouchableOpacity
            disabled={cancelJobMutation.isPending}
            onPress={() => cancelJobMutation.mutate(process.id)}
            className="ml-auto"
          >
            {cancelJobMutation.isPending ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <Ionicons name="close" size={24} color="red" />
            )}
          </TouchableOpacity>
        </View>
        {process.status === "completed" && (
          <View className="flex flex-row mt-4 space-x-4">
            <Button
              onPress={() => {
                startDownload(process);
              }}
              className="w-full"
            >
              Download now
            </Button>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
};

import { Text } from "@/components/common/Text";
import ProgressCircle from "@/components/ProgressCircle";
import { DownloadInfo } from "@/modules/hls-downloader/src/HlsDownloader.types";
import { useNativeDownloads } from "@/providers/NativeDownloadProvider";
import { Ionicons } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useMemo } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  TouchableOpacity,
  View,
} from "react-native";

const formatETA = (seconds: number): string => {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  const parts: string[] = [];

  if (hrs > 0) parts.push(`${hrs}h`);
  if (mins > 0) parts.push(`${mins}m`);
  if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);

  return parts.join(" ");
};

const getETA = (download: DownloadInfo): string | null => {
  if (
    !download.startTime ||
    !download.secondsDownloaded ||
    !download.secondsTotal
  ) {
    console.log(download);
    return null;
  }

  const elapsed = Date.now() / 1000 - download.startTime; // seconds

  if (elapsed <= 0 || download.secondsDownloaded <= 0) return null;

  const speed = download.secondsDownloaded / elapsed; // downloaded seconds per second
  const remainingBytes = download.secondsTotal - download.secondsDownloaded;

  if (speed <= 0) return null;

  const secondsLeft = remainingBytes / speed;

  return formatETA(secondsLeft);
};

const formatBytes = (i: number) => {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let l = 0;
  let n = parseInt(i.toString(), 10) || 0;
  while (n >= 1024 && ++l) {
    n = n / 1024;
  }
  return n.toFixed(n < 10 && l > 0 ? 1 : 0) + " " + units[l];
};

export default function Index() {
  const { downloadedFiles, activeDownloads } = useNativeDownloads();
  const router = useRouter();

  const goToVideo = (item: any) => {
    // @ts-expect-error
    router.push("/player/direct-player?offline=true&itemId=" + item.id);
  };

  const movies = useMemo(
    () => downloadedFiles.filter((i) => i.metadata.item?.Type === "Movie"),
    [downloadedFiles]
  );
  const episodes = useMemo(
    () => downloadedFiles.filter((i) => i.metadata.item?.Type === "Episode"),
    [downloadedFiles]
  );

  const queryClient = useQueryClient();

  return (
    <ScrollView
      refreshControl={
        <RefreshControl
          refreshing={
            queryClient.isFetching({ queryKey: ["downloadedFiles"] }) > 0
          }
          onRefresh={async () => {
            await queryClient.invalidateQueries({
              queryKey: ["downloadedFiles"],
            });
          }}
        />
      }
      className="p-4 space-y-2"
    >
      {activeDownloads.length ? (
        <View>
          <Text className="text-neutral-500 ml-2 text-xs mb-1">
            ACTIVE DOWNLOADS
          </Text>
          {activeDownloads.map((i) => {
            const progress =
              i.secondsTotal && i.secondsDownloaded
                ? i.secondsDownloaded / i.secondsTotal
                : 0;
            const eta = getETA(i);
            const item = i.metadata?.item;
            return (
              <View
                key={i.id}
                className="flex flex-row items-center justify-between p-4 rounded-xl bg-neutral-900"
              >
                <View className="space-y-0.5">
                  {item.Type === "Episode" ? (
                    <Text className="text-xs">{item?.SeriesName}</Text>
                  ) : null}
                  <Text className="font-semibold">{item?.Name}</Text>
                  <Text numberOfLines={1} className="text-xs text-neutral-500">
                    {`S${item.ParentIndexNumber?.toString()}:E${item.IndexNumber?.toString()}`}
                  </Text>
                  <View>
                    <Text className="text-xs text-neutral-500">
                      {eta ? `${eta} remaining` : "Calculating time..."}
                    </Text>
                  </View>
                </View>

                {i.state === "PENDING" ? (
                  <ActivityIndicator />
                ) : (
                  <ProgressCircle
                    size={48}
                    fill={progress * 100}
                    width={8}
                    tintColor="#9334E9"
                    backgroundColor="#bdc3c7"
                  />
                )}
              </View>
            );
          })}
        </View>
      ) : null}

      <View className="space-y-2">
        {movies && movies.length ? (
          <View>
            <Text className="text-neutral-500 ml-2 text-xs mb-1">MOVIES</Text>
            <View className="space-y-2">
              {movies.map((i) => (
                <TouchableOpacity
                  key={i.id}
                  onPress={() => goToVideo(i)}
                  className="bg-neutral-900 p-4 rounded-xl flex flex-row items-center justify-between"
                >
                  <View>
                    {i.metadata.item.Type === "Episode" ? (
                      <Text className="text-xs">
                        {i.metadata.item?.SeriesName}
                      </Text>
                    ) : null}
                    <Text className="font-semibold">
                      {i.metadata.item?.Name}
                    </Text>
                    <Text
                      numberOfLines={1}
                      className="text-xs text-neutral-500"
                    >
                      {`S${i.metadata.item.ParentIndexNumber?.toString()}:E${i.metadata.item.IndexNumber?.toString()}`}
                    </Text>
                  </View>
                  <Ionicons name="play-circle" size={24} color="white" />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ) : null}
        {episodes && episodes.length ? (
          <View>
            <Text className="text-neutral-500 ml-2 text-xs mb-1">EPISODES</Text>
            <View className="space-y-2">
              {episodes.map((i) => (
                <TouchableOpacity
                  key={i.id}
                  onPress={() => goToVideo(i)}
                  className="bg-neutral-900 p-4 rounded-xl flex flex-row items-center justify-between"
                >
                  <View>
                    {i.metadata.item.Type === "Episode" ? (
                      <Text className="text-xs">
                        {i.metadata.item?.SeriesName}
                      </Text>
                    ) : null}
                    <Text className="font-semibold">
                      {i.metadata.item?.Name}
                    </Text>
                    <Text
                      numberOfLines={1}
                      className="text-xs text-neutral-500"
                    >
                      {`S${i.metadata.item.ParentIndexNumber?.toString()}:E${i.metadata.item.IndexNumber?.toString()}`}
                    </Text>
                  </View>
                  <Ionicons name="play-circle" size={24} color="white" />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ) : null}
      </View>
    </ScrollView>
  );
}

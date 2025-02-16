import { Text } from "@/components/common/Text";
import { DownloadInfo } from "@/modules/hls-downloader/src/HlsDownloader.types";
import { useNativeDownloads } from "@/providers/NativeDownloadProvider";
import { useRouter } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, TouchableOpacity, View } from "react-native";

const PROGRESSBAR_HEIGHT = 10;

const formatETA = (seconds: number): string => {
  const pad = (n: number) => n.toString().padStart(2, "0");
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
};

const getETA = (download: DownloadInfo): string | null => {
  console.log("getETA", download);
  if (
    !download.startTime ||
    !download.bytesDownloaded ||
    !download.bytesTotal
  ) {
    console.log(download);
    return null;
  }

  const elapsed = Date.now() / 100 - download.startTime; // seconds

  console.log("Elapsed (s):", Number(download.startTime), Date.now(), elapsed);

  if (elapsed <= 0 || download.bytesDownloaded <= 0) return null;

  const speed = download.bytesDownloaded / elapsed; // bytes per second
  const remainingBytes = download.bytesTotal - download.bytesDownloaded;

  if (speed <= 0) return null;

  const secondsLeft = remainingBytes / speed;

  return formatETA(secondsLeft);
};

export default function Index() {
  const { downloadedFiles, activeDownloads } = useNativeDownloads();
  const router = useRouter();

  const goToVideo = (item: any) => {
    // @ts-expect-error
    router.push("/player/direct-player?offline=true&itemId=" + item.id);
  };

  return (
    <View className="p-4 space-y-2">
      {activeDownloads.map((i) => {
        const progress =
          i.bytesTotal && i.bytesDownloaded
            ? i.bytesDownloaded / i.bytesTotal
            : 0;
        const eta = getETA(i);
        return (
          <View key={i.id}>
            <Text>{i.metadata?.item?.Name}</Text>
            {i.state === "PENDING" ? (
              <ActivityIndicator size={"small"} color={"white"} />
            ) : i.state === "DOWNLOADING" ? (
              <Text>
                {i.bytesDownloaded} / {i.bytesTotal}
              </Text>
            ) : null}
            <View
              className="bg-neutral-800"
              style={{
                height: PROGRESSBAR_HEIGHT,
                borderRadius: 5,
                overflow: "hidden",
                marginVertical: 4,
              }}
            >
              <View
                className="bg-purple-600"
                style={{
                  width: `${progress * 100}%`,
                  height: "100%",
                }}
              />
            </View>
            {eta ? <Text>ETA: {eta}</Text> : <Text>Calculating...</Text>}
          </View>
        );
      })}
      {downloadedFiles.map((i) => (
        <TouchableOpacity
          key={i.id}
          onPress={() => goToVideo(i)}
          className="bg-neutral-800 p-4 rounded-lg"
        >
          <Text>{i.metadata.item?.Name}</Text>
          <Text>{i.metadata.item?.Type}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

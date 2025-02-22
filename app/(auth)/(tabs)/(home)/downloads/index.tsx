import { Text } from "@/components/common/Text";
import ProgressCircle from "@/components/ProgressCircle";
import { DownloadInfo } from "@/modules/hls-downloader/src/HlsDownloader.types";
import { useNativeDownloads } from "@/providers/NativeDownloadProvider";
import { storage } from "@/utils/mmkv";
import { formatTimeString, ticksToSeconds } from "@/utils/time";
import { useActionSheet } from "@expo/react-native-action-sheet";
import { Ionicons } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import * as FileSystem from "expo-file-system";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useCallback, useMemo } from "react";
import {
  ActivityIndicator,
  Platform,
  RefreshControl,
  ScrollView,
  TouchableOpacity,
  View,
} from "react-native";

const getETA = (download: DownloadInfo): string | null => {
  if (
    !download.startTime ||
    !download.secondsDownloaded ||
    !download.secondsTotal
  ) {
    return null;
  }
  const elapsed = Date.now() / 1000 - download.startTime;
  if (elapsed <= 0 || download.secondsDownloaded <= 0) return null;
  const speed = download.secondsDownloaded / elapsed;
  const remainingBytes = download.secondsTotal - download.secondsDownloaded;
  if (speed <= 0) return null;
  const secondsLeft = remainingBytes / speed;
  return formatTimeString(secondsLeft, "s");
};

export default function Index() {
  const { showActionSheetWithOptions } = useActionSheet();
  const {
    downloadedFiles,
    activeDownloads,
    cancelDownload,
    refetchDownloadedFiles,
  } = useNativeDownloads();
  const router = useRouter();
  const queryClient = useQueryClient();

  const handleItemPress = (item: any) => {
    showActionSheetWithOptions(
      {
        options: ["Play", "Delete", "Cancel"],
        destructiveButtonIndex: 1,
        cancelButtonIndex: 2,
      },
      async (selectedIndex) => {
        if (selectedIndex === 0) {
          goToVideo(item);
        } else if (selectedIndex === 1) {
          await deleteFile(item.id);
        }
      }
    );
  };

  const handleActiveItemPress = (id: string) => {
    showActionSheetWithOptions(
      {
        options: ["Cancel Download", "Cancel"],
        destructiveButtonIndex: 0,
        cancelButtonIndex: 1,
      },
      async (selectedIndex) => {
        if (selectedIndex === 0) {
          await cancelDownload(id);
        }
      }
    );
  };

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

  const base64Image = useCallback((id: string) => {
    return storage.getString(id);
  }, []);

  const deleteFile = async (id: string) => {
    const downloadsDir = FileSystem.documentDirectory + "downloads/";
    await FileSystem.deleteAsync(downloadsDir + id + ".json");
    await FileSystem.deleteAsync(downloadsDir + id);
    refetchDownloadedFiles();
  };

  return (
    <ScrollView
      refreshControl={
        <RefreshControl
          refreshing={
            queryClient.isFetching({ queryKey: ["downloadedFiles"] }) > 0
          }
          onRefresh={() => {
            refetchDownloadedFiles();
          }}
        />
      }
      className="flex-1 "
    >
      <View className="flex p-4 space-y-2">
        {!movies.length && !episodes.length && !activeDownloads.length ? (
          <View className="flex flex-col items-center justify-center">
            <Text className="text-neutral-500 text-xs">
              No downloaded items
            </Text>
          </View>
        ) : null}

        {activeDownloads.length ? (
          <View>
            <Text className="text-neutral-500 ml-2 text-xs mb-1">
              ACTIVE DOWNLOADS
            </Text>
            <View className="space-y-2">
              {activeDownloads.map((i) => {
                const progress =
                  i.secondsTotal && i.secondsDownloaded
                    ? i.secondsDownloaded / i.secondsTotal
                    : 0;
                const eta = getETA(i);
                const item = i.metadata?.item;
                return (
                  <TouchableOpacity
                    onPress={() => {
                      if (!i.metadata.item.Id) throw new Error("No item id");
                      handleActiveItemPress(i.metadata.item.Id);
                    }}
                    key={i.id}
                    className="flex flex-row items-center p-2 pr-4 rounded-xl bg-neutral-900 space-x-4"
                  >
                    {i.metadata.item.Id && (
                      <View
                        className={`rounded-lg overflow-hidden ${
                          i.metadata.item.Type === "Movie"
                            ? "h-24 aspect-[10/15]"
                            : "w-24 aspect-video"
                        }`}
                      >
                        <Image
                          source={{
                            uri: `data:image/jpeg;base64,${base64Image(
                              i.metadata.item.Id
                            )}`,
                          }}
                          style={{
                            width: "100%",
                            height: "100%",
                            resizeMode: "cover",
                          }}
                        />
                      </View>
                    )}
                    <View className="space-y-0.5 flex-1">
                      {item.Type === "Episode" ? (
                        <>
                          <Text className="text-xs">{item?.SeriesName}</Text>
                        </>
                      ) : (
                        <>
                          <Text className="text-xs text-neutral-500">
                            {item?.ProductionYear}
                          </Text>
                        </>
                      )}
                      <Text className="font-semibold">{item?.Name}</Text>
                      <View className="flex flex-row items-center">
                        {i.metadata.item.Type === "Episode" && (
                          <Text
                            numberOfLines={1}
                            className="text-xs text-neutral-500"
                          >
                            {`S${item.ParentIndexNumber?.toString()}:E${item.IndexNumber?.toString()}`}{" "}
                            -{" "}
                          </Text>
                        )}
                        {item?.RunTimeTicks ? (
                          <Text className="text-xs text-neutral-500">
                            {formatTimeString(
                              ticksToSeconds(item?.RunTimeTicks),
                              "s"
                            )}
                          </Text>
                        ) : null}
                      </View>
                      <View>
                        <Text className="text-xs text-purple-600">
                          {eta ? `~${eta} remaining` : "Calculating time..."}
                        </Text>
                      </View>
                    </View>

                    <View className="ml-auto relative">
                      {i.state === "PENDING" ? (
                        <ActivityIndicator />
                      ) : (
                        <View className="relative items-center justify-center">
                          <ProgressCircle
                            size={48}
                            fill={progress * 100}
                            width={6}
                            tintColor="#9334E9"
                            backgroundColor="#bdc3c7"
                          />
                          {Platform.OS === "ios" ? (
                            <Text className="absolute text-[10px] text-[#bdc3c7] top-[18px] left-[14px]">
                              {(progress * 100).toFixed(0)}%
                            </Text>
                          ) : (
                            <Text className="absolute text-[12px] text-[#bdc3c7] top-[15px] left-[16px]">
                              {(progress * 100).toFixed(0)}%
                            </Text>
                          )}
                        </View>
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
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
                    onPress={() => handleItemPress(i)}
                    className="flex flex-row items-center p-2 pr-4 rounded-xl bg-neutral-900 space-x-4"
                  >
                    {i.metadata.item.Id && (
                      <View className="h-24 aspect-[10/15] rounded-lg overflow-hidden">
                        <Image
                          source={{
                            uri: `data:image/jpeg;base64,${base64Image(
                              i.metadata.item.Id
                            )}`,
                          }}
                          style={{
                            width: "100%",
                            height: "100%",
                            resizeMode: "cover",
                          }}
                        />
                      </View>
                    )}
                    <View className="flex-1">
                      <Text className="text-xs text-neutral-500">
                        {i.metadata.item?.ProductionYear}
                      </Text>
                      <Text className="font-semibold">
                        {i.metadata.item?.Name}
                      </Text>
                      {i.metadata.item?.RunTimeTicks ? (
                        <Text className="text-xs text-neutral-500">
                          {formatTimeString(
                            ticksToSeconds(i.metadata.item?.RunTimeTicks),
                            "s"
                          )}
                        </Text>
                      ) : null}
                    </View>
                    <Ionicons
                      name="play-circle"
                      size={24}
                      color="white"
                      className="ml-auto"
                    />
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ) : null}
          {episodes && episodes.length ? (
            <View>
              <Text className="text-neutral-500 ml-2 text-xs mb-1">
                EPISODES
              </Text>
              <View className="space-y-2">
                {episodes.map((i) => (
                  <TouchableOpacity
                    key={i.id}
                    onPress={() => handleItemPress(i)}
                    className="bg-neutral-900 p-2 pr-4 rounded-xl flex flex-row items-center space-x-4"
                  >
                    {i.metadata.item.Id && (
                      <View className="w-24 aspect-video rounded-lg overflow-hidden">
                        <Image
                          source={{
                            uri: `data:image/jpeg;base64,${base64Image(
                              i.metadata.item.Id
                            )}`,
                          }}
                          style={{
                            width: "100%",
                            height: "100%",
                            resizeMode: "cover",
                          }}
                        />
                      </View>
                    )}
                    <View className="flex-1">
                      {i.metadata.item.Type === "Episode" ? (
                        <Text className="text-[12px]">
                          {i.metadata.item?.SeriesName}
                        </Text>
                      ) : null}
                      <Text
                        className="font-semibold text-[12px]"
                        numberOfLines={2}
                      >
                        {i.metadata.item?.Name}
                      </Text>
                      <Text
                        numberOfLines={1}
                        className="text-xs text-neutral-500"
                      >
                        {`S${i.metadata.item.ParentIndexNumber?.toString()}:E${i.metadata.item.IndexNumber?.toString()}`}
                      </Text>
                    </View>
                    <Ionicons
                      name="play-circle"
                      size={24}
                      color="white"
                      className="ml-auto"
                    />
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ) : null}
        </View>
      </View>
    </ScrollView>
  );
}

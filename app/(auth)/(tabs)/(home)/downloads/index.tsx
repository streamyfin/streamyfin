import { Text } from "@/components/common/Text";
import { ActiveDownloads } from "@/components/downloads/ActiveDownloads";
import { MovieCard } from "@/components/downloads/MovieCard";
import { SeriesCard } from "@/components/downloads/SeriesCard";
import { DownloadedItem, useDownload } from "@/providers/DownloadProvider";
import { queueAtom } from "@/utils/atoms/queue";
import { useSettings } from "@/utils/atoms/settings";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRouter } from "expo-router";
import { useAtom } from "jotai";
import React, { useEffect, useMemo, useRef } from "react";
import { Alert, ScrollView, TouchableOpacity, View } from "react-native";
import { Button } from "@/components/Button";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DownloadSize } from "@/components/downloads/DownloadSize";
import {
  BottomSheetBackdrop,
  BottomSheetBackdropProps,
  BottomSheetModal,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import { toast } from "sonner-native";
import { writeToLog } from "@/utils/log";

export default function page() {
  const navigation = useNavigation();
  const [queue, setQueue] = useAtom(queueAtom);
  const { removeProcess, downloadedFiles, deleteFileByType } = useDownload();
  const router = useRouter();
  const [settings] = useSettings();
  const bottomSheetModalRef = useRef<BottomSheetModal>(null);

  const movies = useMemo(() => {
    try {
      return downloadedFiles?.filter((f) => f.item.Type === "Movie") || [];
    } catch {
      migration_20241124();
      return [];
    }
  }, [downloadedFiles]);

  const groupedBySeries = useMemo(() => {
    try {
      const episodes = downloadedFiles?.filter(
        (f) => f.item.Type === "Episode"
      );
      const series: { [key: string]: DownloadedItem[] } = {};
      episodes?.forEach((e) => {
        if (!series[e.item.SeriesName!]) series[e.item.SeriesName!] = [];
        series[e.item.SeriesName!].push(e);
      });
      return Object.values(series);
    } catch {
      migration_20241124();
      return [];
    }
  }, [downloadedFiles]);

  const insets = useSafeAreaInsets();

  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity onPress={bottomSheetModalRef.current?.present}>
          <DownloadSize items={downloadedFiles?.map((f) => f.item) || []} />
        </TouchableOpacity>
      ),
    });
  }, [downloadedFiles]);

  const deleteMovies = () =>
    deleteFileByType("Movie")
      .then(() => toast.success("Deleted all movies successfully!"))
      .catch((reason) => {
        writeToLog("ERROR", reason);
        toast.error("Failed to delete all movies");
      });
  const deleteShows = () =>
    deleteFileByType("Episode")
      .then(() => toast.success("Deleted all TV-Series successfully!"))
      .catch((reason) => {
        writeToLog("ERROR", reason);
        toast.error("Failed to delete all TV-Series");
      });
  const deleteAllMedia = async () =>
    await Promise.all([deleteMovies(), deleteShows()]);

  return (
    <>
      <ScrollView
        contentContainerStyle={{
          paddingLeft: insets.left,
          paddingRight: insets.right,
          paddingBottom: 100,
        }}
      >
        <View className="py-4">
          <View className="mb-4 flex flex-col space-y-4 px-4">
            {settings?.downloadMethod === "remux" && (
              <View className="bg-neutral-900 p-4 rounded-2xl">
                <Text className="text-lg font-bold">Queue</Text>
                <Text className="text-xs opacity-70 text-red-600">
                  Queue and active downloads will be lost on app restart
                </Text>
                <View className="flex flex-col space-y-2 mt-2">
                  {queue.map((q, index) => (
                    <TouchableOpacity
                      onPress={() =>
                        router.push(`/(auth)/items/page?id=${q.item.Id}`)
                      }
                      className="relative bg-neutral-900 border border-neutral-800 p-4 rounded-2xl overflow-hidden flex flex-row items-center justify-between"
                      key={index}
                    >
                      <View>
                        <Text className="font-semibold">{q.item.Name}</Text>
                        <Text className="text-xs opacity-50">
                          {q.item.Type}
                        </Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => {
                          removeProcess(q.id);
                          setQueue((prev) => {
                            if (!prev) return [];
                            return [...prev.filter((i) => i.id !== q.id)];
                          });
                        }}
                      >
                        <Ionicons name="close" size={24} color="red" />
                      </TouchableOpacity>
                    </TouchableOpacity>
                  ))}
                </View>

                {queue.length === 0 && (
                  <Text className="opacity-50">No items in queue</Text>
                )}
              </View>
            )}

            <ActiveDownloads />
          </View>

          {movies.length > 0 && (
            <View className="mb-4">
              <View className="flex flex-row items-center justify-between mb-2 px-4">
                <Text className="text-lg font-bold">Movies</Text>
                <View className="bg-purple-600 rounded-full h-6 w-6 flex items-center justify-center">
                  <Text className="text-xs font-bold">{movies?.length}</Text>
                </View>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View className="px-4 flex flex-row">
                  {movies?.map((item) => (
                    <View className="mb-2 last:mb-0" key={item.item.Id}>
                      <MovieCard item={item.item} />
                    </View>
                  ))}
                </View>
              </ScrollView>
            </View>
          )}
          {groupedBySeries.length > 0 && (
            <View className="mb-4">
              <View className="flex flex-row items-center justify-between mb-2 px-4">
                <Text className="text-lg font-bold">TV-Series</Text>
                <View className="bg-purple-600 rounded-full h-6 w-6 flex items-center justify-center">
                  <Text className="text-xs font-bold">
                    {groupedBySeries?.length}
                  </Text>
                </View>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View className="px-4 flex flex-row">
                  {groupedBySeries?.map((items) => (
                    <View
                      className="mb-2 last:mb-0"
                      key={items[0].item.SeriesId}
                    >
                      <SeriesCard
                        items={items.map((i) => i.item)}
                        key={items[0].item.SeriesId}
                      />
                    </View>
                  ))}
                </View>
              </ScrollView>
            </View>
          )}
          {downloadedFiles?.length === 0 && (
            <View className="flex px-4">
              <Text className="opacity-50">No downloaded items</Text>
            </View>
          )}
        </View>
      </ScrollView>
      <BottomSheetModal
        ref={bottomSheetModalRef}
        enableDynamicSizing
        handleIndicatorStyle={{
          backgroundColor: "white",
        }}
        backgroundStyle={{
          backgroundColor: "#171717",
        }}
        backdropComponent={(props: BottomSheetBackdropProps) => (
          <BottomSheetBackdrop
            {...props}
            disappearsOnIndex={-1}
            appearsOnIndex={0}
          />
        )}
      >
        <BottomSheetView>
          <View className="p-4 space-y-4 mb-4">
            <Button color="purple" onPress={deleteMovies}>
              Delete all Movies
            </Button>
            <Button color="purple" onPress={deleteShows}>
              Delete all TV-Series
            </Button>
            <Button color="red" onPress={deleteAllMedia}>
              Delete all
            </Button>
          </View>
        </BottomSheetView>
      </BottomSheetModal>
    </>
  );
}

function migration_20241124() {
  const router = useRouter();
  const { deleteAllFiles } = useDownload();
  Alert.alert(
    "New app version requires re-download",
    "The new update reqires content to be downloaded again. Please remove all downloaded content and try again.",
    [
      {
        text: "Back",
        onPress: () => router.back(),
      },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => await deleteAllFiles(),
      },
    ]
  );
}

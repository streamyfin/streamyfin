import { Text } from "@/components/common/Text";
import { ActiveDownloads } from "@/components/downloads/ActiveDownloads";
import { MovieCard } from "@/components/downloads/MovieCard";
import { SeriesCard } from "@/components/downloads/SeriesCard";
import { DownloadedItem, useDownload } from "@/providers/DownloadProvider";
import { queueAtom } from "@/utils/atoms/queue";
import { useSettings } from "@/utils/atoms/settings";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useAtom } from "jotai";
import { useMemo } from "react";
import { Alert, ScrollView, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function page() {
  const [queue, setQueue] = useAtom(queueAtom);
  const { removeProcess, downloadedFiles } = useDownload();
  const router = useRouter();
  const [settings] = useSettings();

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

  return (
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
                Queue and downloads will be lost on app restart
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
                      <Text className="text-xs opacity-50">{q.item.Type}</Text>
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
                <Text className="text-xs font-bold">{groupedBySeries?.length}</Text>
              </View>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View className="px-4 flex flex-row">
                {groupedBySeries?.map((items) => (
                  <View className="mb-2 last:mb-0" key={items[0].item.SeriesId}>
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

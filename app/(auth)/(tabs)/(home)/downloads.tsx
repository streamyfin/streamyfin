import { Text } from "@/components/common/Text";
import { ActiveDownloads } from "@/components/downloads/ActiveDownloads";
import { MovieCard } from "@/components/downloads/MovieCard";
import { SeriesCard } from "@/components/downloads/SeriesCard";
import { DownloadedItem, useDownload } from "@/providers/DownloadProvider";
import { queueAtom } from "@/utils/atoms/queue";
import { useSettings } from "@/utils/atoms/settings";
import { Ionicons } from "@expo/vector-icons";
import { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { router } from "expo-router";
import { useAtom } from "jotai";
import { useMemo } from "react";
import { ScrollView, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const downloads: React.FC = () => {
  const [queue, setQueue] = useAtom(queueAtom);
  const { removeProcess, downloadedFiles } = useDownload();

  const [settings] = useSettings();

  const movies = useMemo(
    () => downloadedFiles?.filter((f) => f.item.Type === "Movie") || [],
    [downloadedFiles]
  );

  const groupedBySeries = useMemo(() => {
    const episodes = downloadedFiles?.filter((f) => f.item.Type === "Episode");
    const series: { [key: string]: DownloadedItem[] } = {};
    episodes?.forEach((e) => {
      if (!series[e.item.SeriesName!]) series[e.item.SeriesName!] = [];
      series[e.item.SeriesName!].push(e);
    });
    return Object.values(series);
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
                {queue.map((q) => (
                  <TouchableOpacity
                    onPress={() =>
                      router.push(`/(auth)/items/page?id=${q.item.Id}`)
                    }
                    className="relative bg-neutral-900 border border-neutral-800 p-4 rounded-2xl overflow-hidden flex flex-row items-center justify-between"
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
        {groupedBySeries?.map((items, index) => (
          <SeriesCard
            items={items.map((i) => i.item)}
            key={items[0].item.SeriesId}
          />
        ))}
        {downloadedFiles?.length === 0 && (
          <View className="flex px-4">
            <Text className="opacity-50">No downloaded items</Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
};

export default downloads;

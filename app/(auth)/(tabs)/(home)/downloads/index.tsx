import { Text } from "@/components/common/Text";
import { useNativeDownloads } from "@/providers/NativeDownloadProvider";
import { useRouter } from "expo-router";
import { useEffect } from "react";
import { TouchableOpacity, View } from "react-native";

export default function index() {
  const { downloadedFiles, getDownloadedItem, activeDownloads } =
    useNativeDownloads();
  const router = useRouter();

  const goToVideo = (item: any) => {
    console.log(item);
    // @ts-expect-error
    router.push("/player/direct-player?offline=true&itemId=" + item.id);
  };

  useEffect(() => {
    console.log(activeDownloads);
  }, [activeDownloads]);

  return (
    <View className="p-4 space-y-2">
      {activeDownloads.map((i) => (
        <View>
          <Text>{i.id}</Text>
        </View>
      ))}
      {downloadedFiles.map((i) => (
        <TouchableOpacity
          key={i.id}
          onPress={() => goToVideo(i)}
          className="bg-neutral-800 p-4 rounded-lg"
        >
          <Text>{i.metadata.item.Name}</Text>
          <Text>{i.metadata.item.Type}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

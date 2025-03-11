import { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { TouchableOpacity, View } from "react-native";
import { Text } from "../common/Text";
import React, { useCallback, useMemo } from "react";
import { storage } from "@/utils/mmkv";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { DownloadSize } from "@/components/downloads/DownloadSize";
import { useDownload } from "@/providers/DownloadProvider";
import { useActionSheet } from "@expo/react-native-action-sheet";

export const SeriesCard: React.FC<{ items: BaseItemDto[] }> = ({ items }) => {
  const { deleteItems } = useDownload();
  const { showActionSheetWithOptions } = useActionSheet();

  const base64Image = useMemo(() => {
    return storage.getString(items[0].SeriesId!);
  }, []);

  const deleteSeries = useCallback(async () => deleteItems(items), [items]);

  const showActionSheet = useCallback(() => {
    const options = ["Delete", "Cancel"];
    const destructiveButtonIndex = 0;

    showActionSheetWithOptions(
      {
        options,
        destructiveButtonIndex,
      },
      (selectedIndex) => {
        if (selectedIndex == destructiveButtonIndex) {
          deleteSeries();
        }
      },
    );
  }, [showActionSheetWithOptions, deleteSeries]);

  return (
    <TouchableOpacity
      onPress={() => router.push(`/downloads/${items[0].SeriesId}`)}
      onLongPress={showActionSheet}
    >
      {base64Image ? (
        <View className="w-28 aspect-[10/15] rounded-lg overflow-hidden mr-2 border border-neutral-900">
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
          <View className="bg-purple-600 rounded-full h-6 w-6 flex items-center justify-center absolute bottom-1 right-1">
            <Text className="text-xs font-bold">{items.length}</Text>
          </View>
        </View>
      ) : (
        <View className="w-28 aspect-[10/15] rounded-lg bg-neutral-900 mr-2 flex items-center justify-center">
          <Ionicons
            name="image-outline"
            size={24}
            color="gray"
            className="self-center mt-16"
          />
        </View>
      )}

      <View className="w-28 mt-2 flex flex-col">
        <Text numberOfLines={2} className="">
          {items[0].SeriesName}
        </Text>
        <Text className="text-xs opacity-50">{items[0].ProductionYear}</Text>
        <DownloadSize items={items} />
      </View>
    </TouchableOpacity>
  );
};

import { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import * as Haptics from "expo-haptics";
import React, {useCallback, useMemo} from "react";
import { TouchableOpacity, View } from "react-native";
import {
  ActionSheetProvider,
  useActionSheet,
} from "@expo/react-native-action-sheet";

import { useDownloadedFileOpener } from "@/hooks/useDownloadedFileOpener";
import {useDownload} from "@/providers/DownloadProvider";
import { storage } from "@/utils/mmkv";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import {Text} from "@/components/common/Text";
import {runtimeTicksToSeconds} from "@/utils/time";
import {DownloadSize} from "@/components/downloads/DownloadSize";

interface EpisodeCardProps {
  item: BaseItemDto;
}

/**
 * EpisodeCard component displays an episode with action sheet options.
 * @param {EpisodeCardProps} props - The component props.
 * @returns {React.ReactElement} The rendered EpisodeCard component.
 */
export const EpisodeCard: React.FC<EpisodeCardProps> = ({ item }) => {
  const { deleteFile } = useDownload();
  const { openFile } = useDownloadedFileOpener();
  const { showActionSheetWithOptions } = useActionSheet();

  const base64Image = useMemo(() => {
    return storage.getString(item.Id!);
  }, [item]);

  const handleOpenFile = useCallback(() => {
    openFile(item);
  }, [item, openFile]);

  /**
   * Handles deleting the file with haptic feedback.
   */
  const handleDeleteFile = useCallback(() => {
    if (item.Id) {
      deleteFile(item.Id);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, [deleteFile, item.Id]);

  const showActionSheet = useCallback(() => {
    const options = ["Delete", "Cancel"];
    const destructiveButtonIndex = 0;
    const cancelButtonIndex = 1;

    showActionSheetWithOptions(
      {
        options,
        cancelButtonIndex,
        destructiveButtonIndex,
      },
      (selectedIndex) => {
        switch (selectedIndex) {
          case destructiveButtonIndex:
            // Delete
            handleDeleteFile();
            break;
          case cancelButtonIndex:
            // Cancelled
            break;
        }
      }
    );
  }, [showActionSheetWithOptions, handleDeleteFile]);

  return (
    <TouchableOpacity
      onPress={handleOpenFile}
      onLongPress={showActionSheet}
      className="flex flex-col mr-2"
    >
      <View className="flex flex-row items-start mb-2">
        <View className="mr-2">
          {base64Image ? (
            <View className="w-44 aspect-video rounded-lg overflow-hidden">
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
          ) : (
            <View className="w-44 aspect-video rounded-lg bg-neutral-900 flex items-center justify-center">
                <Ionicons
                    name="image-outline"
                    size={24}
                    color="gray"
                    className="self-center mt-16"
                />
              </View>
          )}
        </View>
        <View className="w-56 flex flex-col">
          <Text numberOfLines={2} className="">
            {item.Name}
          </Text>
          <Text numberOfLines={1} className="text-xs text-neutral-500">
            {`S${item.ParentIndexNumber?.toString()}:E${item.IndexNumber?.toString()}`}
          </Text>
          <Text className="text-xs text-neutral-500">
            {runtimeTicksToSeconds(item.RunTimeTicks)}
          </Text>
          <DownloadSize items={[item]} />
        </View>
      </View>
      <Text numberOfLines={3} className="text-xs text-neutral-500 shrink">{item.Overview}</Text>
    </TouchableOpacity>
  );
};

// Wrap the parent component with ActionSheetProvider
export const EpisodeCardWithActionSheet: React.FC<EpisodeCardProps> = (
  props
) => (
  <ActionSheetProvider>
    <EpisodeCard {...props} />
  </ActionSheetProvider>
);

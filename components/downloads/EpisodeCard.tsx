import { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import * as Haptics from "expo-haptics";
import React, { useCallback, useMemo, useRef } from "react";
import { TouchableOpacity, View } from "react-native";
import {
  ActionSheetProvider,
  useActionSheet,
} from "@expo/react-native-action-sheet";

import { useDownloadedFileOpener } from "@/hooks/useDownloadedFileOpener";
import { Text } from "../common/Text";
import { useDownload } from "@/providers/DownloadProvider";
import { storage } from "@/utils/mmkv";
import { Image } from "expo-image";
import { ItemCardText } from "../ItemCardText";
import { Ionicons } from "@expo/vector-icons";

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
  }, []);

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
      className="flex flex-col w-44 mr-2"
    >
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
      <ItemCardText item={item} />
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

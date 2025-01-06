import {
  ActionSheetProvider,
  useActionSheet,
} from "@expo/react-native-action-sheet";
import { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import * as Haptics from "@/packages/expo-haptics";
import React, { useCallback, useMemo } from "react";
import { TouchableOpacity, View } from "react-native";

import { DownloadSize } from "@/components/downloads/DownloadSize";
import { useDownloadedFileOpener } from "@/hooks/useDownloadedFileOpener";
import { useDownload } from "@/providers/DownloadProvider";
import { storage } from "@/utils/mmkv";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { ItemCardText } from "../ItemCardText";

interface MovieCardProps {
  item: BaseItemDto;
}

/**
 * MovieCard component displays a movie with action sheet options.
 * @param {MovieCardProps} props - The component props.
 * @returns {React.ReactElement} The rendered MovieCard component.
 */
export const MovieCard: React.FC<MovieCardProps> = ({ item }) => {
  const { deleteFile } = useDownload();
  const { openFile } = useDownloadedFileOpener();
  const { showActionSheetWithOptions } = useActionSheet();

  const handleOpenFile = useCallback(() => {
    openFile(item);
  }, [item, openFile]);

  const base64Image = useMemo(() => {
    return storage.getString(item.Id!);
  }, []);

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
    <TouchableOpacity onPress={handleOpenFile} onLongPress={showActionSheet}>
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
      <View className="w-28">
        <ItemCardText item={item} />
      </View>
      <DownloadSize items={[item]} />
    </TouchableOpacity>
  );
};

// Wrap the parent component with ActionSheetProvider
export const MovieCardWithActionSheet: React.FC<MovieCardProps> = (props) => (
  <ActionSheetProvider>
    <MovieCard {...props} />
  </ActionSheetProvider>
);

import {
  ActionSheetProvider,
  useActionSheet,
} from "@expo/react-native-action-sheet";
import { Ionicons } from "@expo/vector-icons";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { Image } from "expo-image";
import type React from "react";
import { useCallback, useMemo } from "react";
import { View } from "react-native";
import { DownloadSize } from "@/components/downloads/DownloadSize";
import { useDownload } from "@/providers/DownloadProvider";
import { storage } from "@/utils/mmkv";
import { ProgressBar } from "../common/ProgressBar";
import { TouchableItemRouter } from "../common/TouchableItemRouter";
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
  const { showActionSheetWithOptions } = useActionSheet();

  const base64Image = useMemo(() => {
    return storage.getString(item?.Id!);
  }, []);

  /**
   * Handles deleting the file with haptic feedback.
   */
  const handleDeleteFile = useCallback(() => {
    if (item.Id) {
      deleteFile(item.Id, "Movie");
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
      },
    );
  }, [showActionSheetWithOptions, handleDeleteFile]);

  return (
    <TouchableItemRouter onLongPress={showActionSheet} item={item} isOffline>
      {base64Image ? (
        <View className='relative w-28 aspect-[10/15] rounded-lg overflow-hidden mr-2 border border-neutral-900'>
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
          <ProgressBar item={item} />
        </View>
      ) : (
        <View className='relative w-28 aspect-[10/15] rounded-lg bg-neutral-900 mr-2 flex items-center justify-center'>
          <Ionicons
            name='image-outline'
            size={24}
            color='gray'
            className='self-center mt-16'
          />
          <ProgressBar item={item} />
        </View>
      )}
      <View className='w-28'>
        <ItemCardText item={item} />
      </View>
      <DownloadSize items={[item]} />
    </TouchableItemRouter>
  );
};

// Wrap the parent component with ActionSheetProvider
export const MovieCardWithActionSheet: React.FC<MovieCardProps> = (props) => (
  <ActionSheetProvider>
    <MovieCard {...props} />
  </ActionSheetProvider>
);

import { useHaptic } from "@/hooks/useHaptic";
import {
  ActionSheetProvider,
  useActionSheet,
} from "@expo/react-native-action-sheet";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import type React from "react";
import { useCallback, useMemo } from "react";
import {
  TouchableOpacity,
  type TouchableOpacityProps,
  View,
} from "react-native";

import { Text } from "@/components/common/Text";
import { DownloadSize } from "@/components/downloads/DownloadSize";
import { useDownloadedFileOpener } from "@/hooks/useDownloadedFileOpener";
import { useDownload } from "@/providers/DownloadProvider";
import { storage } from "@/utils/mmkv";
import { runtimeTicksToSeconds } from "@/utils/time";
import { Ionicons } from "@expo/vector-icons";
import ContinueWatchingPoster from "../ContinueWatchingPoster";
import { TouchableItemRouter } from "../common/TouchableItemRouter";

interface EpisodeCardProps extends TouchableOpacityProps {
  item: BaseItemDto;
}

export const EpisodeCard: React.FC<EpisodeCardProps> = ({ item, ...props }) => {
  const { deleteFile } = useDownload();
  const { openFile } = useDownloadedFileOpener();
  const { showActionSheetWithOptions } = useActionSheet();
  const successHapticFeedback = useHaptic("success");

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
      successHapticFeedback();
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
    <TouchableOpacity
      onPress={handleOpenFile}
      onLongPress={showActionSheet}
      key={item.Id}
      className='flex flex-col mb-4'
    >
      <View className='flex flex-row items-start mb-2'>
        <View className='mr-2'>
          <ContinueWatchingPoster size='small' item={item} useEpisodePoster />
        </View>
        <View className='shrink'>
          <Text numberOfLines={2} className=''>
            {item.Name}
          </Text>
          <Text numberOfLines={1} className='text-xs text-neutral-500'>
            {`S${item.ParentIndexNumber?.toString()}:E${item.IndexNumber?.toString()}`}
          </Text>
          <Text className='text-xs text-neutral-500'>
            {runtimeTicksToSeconds(item.RunTimeTicks)}
          </Text>
          <DownloadSize items={[item]} />
        </View>
      </View>

      <Text numberOfLines={3} className='text-xs text-neutral-500 shrink'>
        {item.Overview}
      </Text>
    </TouchableOpacity>
  );
};

// Wrap the parent component with ActionSheetProvider
export const EpisodeCardWithActionSheet: React.FC<EpisodeCardProps> = (
  props,
) => (
  <ActionSheetProvider>
    <EpisodeCard {...props} />
  </ActionSheetProvider>
);

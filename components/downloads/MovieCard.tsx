import { Ionicons } from "@expo/vector-icons";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { Image } from "expo-image";
import type React from "react";
import { useCallback, useMemo } from "react";
import { View } from "react-native";
import { DownloadSize } from "@/components/downloads/DownloadSize";
import { useConfirmDelete } from "@/hooks/useConfirmDelete";
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
  const confirmDelete = useConfirmDelete();

  const base64Image = useMemo(() => {
    return item?.Id ? storage.getString(item.Id) : undefined;
  }, [item?.Id]);

  const handleDeleteFile = useCallback(() => {
    if (item.Id) {
      deleteFile(item.Id);
    }
  }, [deleteFile, item.Id]);

  const showActionSheet = useCallback(
    () =>
      confirmDelete({
        title: item.Name ?? undefined,
        onConfirm: handleDeleteFile,
      }),
    [confirmDelete, handleDeleteFile, item.Name],
  );

  return (
    <TouchableItemRouter onLongPress={showActionSheet} item={item}>
      {base64Image ? (
        <View className='relative w-28 aspect-[10/15] rounded-lg overflow-hidden mr-2 border border-neutral-900'>
          <Image
            source={{
              uri: `data:image/jpeg;base64,${base64Image}`,
            }}
            style={{
              width: "100%",
              height: "100%",
            }}
            contentFit='cover'
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

import { Ionicons } from "@expo/vector-icons";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { Image } from "expo-image";
import type React from "react";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { TouchableOpacity, View } from "react-native";
import { DownloadSize } from "@/components/downloads/DownloadSize";
import useRouter from "@/hooks/useAppRouter";
import { useConfirmDelete } from "@/hooks/useConfirmDelete";
import { useDownload } from "@/providers/DownloadProvider";
import { storage } from "@/utils/mmkv";
import { Text } from "../common/Text";

export const SeriesCard: React.FC<{ items: BaseItemDto[] }> = ({ items }) => {
  const { t } = useTranslation();
  const { deleteItems } = useDownload();
  const confirmDelete = useConfirmDelete();
  const router = useRouter();

  // Keyed on SeriesId so recycled FlashList cells re-read the correct poster
  // instead of freezing the first-rendered series' image (empty deps bug).
  const base64Image = useMemo(() => {
    const seriesId = items[0]?.SeriesId;
    return seriesId ? storage.getString(seriesId) : undefined;
  }, [items[0]?.SeriesId]);

  const deleteSeries = useCallback(
    () =>
      deleteItems(
        items.map((item) => item.Id).filter((id) => id !== undefined),
      ),
    [items],
  );

  const showActionSheet = useCallback(
    () =>
      confirmDelete({
        title: items[0]?.SeriesName ?? undefined,
        message: t("player.episode_count", { count: items.length }),
        onConfirm: deleteSeries,
      }),
    [confirmDelete, deleteSeries, items, t],
  );

  return (
    <TouchableOpacity
      onPress={() =>
        router.push({
          pathname: "/series/[id]",
          params: { id: items[0].SeriesId!, offline: "true" },
        })
      }
      onLongPress={showActionSheet}
    >
      {base64Image ? (
        <View className='w-28 aspect-[10/15] rounded-lg overflow-hidden mr-2 border border-neutral-900'>
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
          <View className='bg-purple-600 rounded-full h-6 w-6 flex items-center justify-center absolute bottom-1 right-1'>
            <Text className='text-xs font-bold'>{items.length}</Text>
          </View>
        </View>
      ) : (
        <View className='w-28 aspect-[10/15] rounded-lg bg-neutral-900 mr-2 flex items-center justify-center'>
          <Ionicons
            name='image-outline'
            size={24}
            color='gray'
            className='self-center mt-16'
          />
        </View>
      )}

      <View className='w-28 mt-2 flex flex-col'>
        <Text numberOfLines={2} className=''>
          {items[0].SeriesName}
        </Text>
        <Text className='text-xs opacity-50'>{items[0].ProductionYear}</Text>
        <DownloadSize items={items} />
      </View>
    </TouchableOpacity>
  );
};

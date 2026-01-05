import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Platform, View } from "react-native";
import { toast } from "sonner-native";
import { Text } from "@/components/common/Text";
import { Colors } from "@/constants/Colors";
import { useHaptic } from "@/hooks/useHaptic";
import { useNetworkAwareQueryClient } from "@/hooks/useNetworkAwareQueryClient";
import {
  clearCache,
  clearPermanentDownloads,
  getStorageStats,
} from "@/providers/AudioStorage";
import { useDownload } from "@/providers/DownloadProvider";
import { ListGroup } from "../list/ListGroup";
import { ListItem } from "../list/ListItem";

export const StorageSettings = () => {
  const { deleteAllFiles, appSizeUsage } = useDownload();
  const { t } = useTranslation();
  const queryClient = useNetworkAwareQueryClient();
  const successHapticFeedback = useHaptic("success");
  const errorHapticFeedback = useHaptic("error");

  const { data: size } = useQuery({
    queryKey: ["appSize"],
    queryFn: async () => {
      const app = await appSizeUsage();

      return {
        appSize: app.appSize,
        total: app.total,
        remaining: app.remaining,
        used: (app.total - app.remaining) / app.total,
      };
    },
  });

  const { data: musicCacheStats } = useQuery({
    queryKey: ["musicCacheStats"],
    queryFn: () => getStorageStats(),
  });

  const onDeleteClicked = async () => {
    try {
      await deleteAllFiles();
      successHapticFeedback();
    } catch (_e) {
      errorHapticFeedback();
      toast.error(t("home.settings.toasts.error_deleting_files"));
    }
  };

  const onClearMusicCacheClicked = useCallback(async () => {
    try {
      await clearCache();
      queryClient.invalidateQueries({ queryKey: ["musicCacheStats"] });
      queryClient.invalidateQueries({ queryKey: ["appSize"] });
      successHapticFeedback();
      toast.success(t("home.settings.storage.music_cache_cleared"));
    } catch (_e) {
      errorHapticFeedback();
      toast.error(t("home.settings.toasts.error_deleting_files"));
    }
  }, [queryClient, successHapticFeedback, errorHapticFeedback, t]);

  const onDeleteDownloadedSongsClicked = useCallback(async () => {
    try {
      await clearPermanentDownloads();
      queryClient.invalidateQueries({ queryKey: ["musicCacheStats"] });
      queryClient.invalidateQueries({ queryKey: ["appSize"] });
      successHapticFeedback();
      toast.success(t("home.settings.storage.downloaded_songs_deleted"));
    } catch (_e) {
      errorHapticFeedback();
      toast.error(t("home.settings.toasts.error_deleting_files"));
    }
  }, [queryClient, successHapticFeedback, errorHapticFeedback, t]);

  const calculatePercentage = (value: number, total: number) => {
    return ((value / total) * 100).toFixed(2);
  };

  return (
    <View>
      <View className='flex flex-col gap-y-1'>
        <View className='flex flex-row items-center justify-between'>
          <Text className=''>{t("home.settings.storage.storage_title")}</Text>
          {size && (
            <Text className='text-neutral-500'>
              {t("home.settings.storage.size_used", {
                used: Number(size.total - size.remaining).bytesToReadable(),
                total: size.total?.bytesToReadable(),
              })}
            </Text>
          )}
        </View>
        <View className='h-3 w-full bg-gray-100/10 rounded-md overflow-hidden flex flex-row'>
          {size && (
            <View className='flex flex-row'>
              <View
                style={{
                  width: `${(size.appSize / size.total) * 100}%`,
                  backgroundColor: Colors.primaryRGB,
                }}
              />
              <View
                style={{
                  width: `${((size.total - size.remaining - size.appSize) / size.total) * 100}%`,
                  backgroundColor: Colors.primaryLightRGB,
                }}
              />
            </View>
          )}
        </View>
        <View className='flex flex-row gap-x-2'>
          {size && (
            <View className='flex flex-row gap-x-2'>
              <View className='flex flex-row items-center'>
                <View className='w-3 h-3 rounded-full bg-purple-600 mr-1' />
                <Text className='text-white text-xs'>
                  {t("home.settings.storage.app_usage", {
                    usedSpace: calculatePercentage(size.appSize, size.total),
                  })}
                </Text>
              </View>
              <View className='flex flex-row items-center'>
                <View className='w-3 h-3 rounded-full bg-purple-400 mr-1' />
                <Text className='text-white text-xs'>
                  {t("home.settings.storage.device_usage", {
                    availableSpace: calculatePercentage(
                      size.total - size.remaining - size.appSize,
                      size.total,
                    ),
                  })}
                </Text>
              </View>
            </View>
          )}
        </View>
      </View>
      {!Platform.isTV && (
        <>
          <ListGroup
            title={t("home.settings.storage.music_cache_title")}
            description={
              <Text className='text-[#8E8D91] text-xs'>
                {t("home.settings.storage.music_cache_description")}
              </Text>
            }
          >
            <ListItem
              onPress={onClearMusicCacheClicked}
              title={t("home.settings.storage.clear_music_cache")}
              subtitle={t("home.settings.storage.music_cache_size", {
                size: (musicCacheStats?.cacheSize ?? 0).bytesToReadable(),
              })}
            />
          </ListGroup>
          <ListGroup>
            <ListItem
              textColor='red'
              onPress={onDeleteDownloadedSongsClicked}
              title={t("home.settings.storage.delete_all_downloaded_songs")}
              subtitle={t("home.settings.storage.downloaded_songs_size", {
                size: (musicCacheStats?.permanentSize ?? 0).bytesToReadable(),
              })}
            />
          </ListGroup>
          <ListGroup>
            <ListItem
              textColor='red'
              onPress={onDeleteClicked}
              title={t("home.settings.storage.delete_all_downloaded_files")}
            />
          </ListGroup>
        </>
      )}
    </View>
  );
};

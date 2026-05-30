import { BottomSheetModal } from "@gorhom/bottom-sheet";
import { useNavigation } from "expo-router";
import { useAtom } from "jotai";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Platform, ScrollView, View } from "react-native";
import { Pressable } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { toast } from "sonner-native";
import { Text } from "@/components/common/Text";
import { TouchableItemRouter } from "@/components/common/TouchableItemRouter";
import ActiveDownloads from "@/components/downloads/ActiveDownloads";
import { DownloadSize } from "@/components/downloads/DownloadSize";
import { MovieCard } from "@/components/downloads/MovieCard";
import { SeriesCard } from "@/components/downloads/SeriesCard";
import useRouter from "@/hooks/useAppRouter";
import { useDownload } from "@/providers/DownloadProvider";
import { type DownloadedItem } from "@/providers/Downloads/types";
import { OfflineModeProvider } from "@/providers/OfflineModeProvider";
import { queueAtom } from "@/utils/atoms/queue";
import { writeToLog } from "@/utils/log";

export default function page() {
  const navigation = useNavigation();
  const { t } = useTranslation();
  const [_queue, _setQueue] = useAtom(queueAtom);
  const { downloadedItems, deleteFileByType, deleteAllFiles } = useDownload();
  const router = useRouter();
  const bottomSheetModalRef = useRef<BottomSheetModal>(null);

  const [showMigration, setShowMigration] = useState(false);

  const _insets = useSafeAreaInsets();

  const migration_20241124 = () => {
    Alert.alert(
      t("home.downloads.new_app_version_requires_re_download"),
      t("home.downloads.new_app_version_requires_re_download_description"),
      [
        {
          text: t("home.downloads.back"),
          onPress: () => {
            setShowMigration(false);
            router.back();
          },
        },
        {
          text: t("home.downloads.delete"),
          style: "destructive",
          onPress: async () => {
            await deleteAllFiles();
            setShowMigration(false);
          },
        },
      ],
    );
  };

  const downloadedFiles = useMemo(() => downloadedItems, [downloadedItems]);

  const movies = useMemo(() => {
    try {
      return downloadedFiles?.filter((f) => f.item.Type === "Movie") || [];
    } catch {
      setShowMigration(true);
      return [];
    }
  }, [downloadedFiles]);

  const groupedBySeries = useMemo(() => {
    try {
      const episodes = downloadedFiles?.filter(
        (f) => f.item.Type === "Episode",
      );
      const series: { [key: string]: DownloadedItem[] } = {};
      episodes?.forEach((e) => {
        if (!series[e.item.SeriesName!]) series[e.item.SeriesName!] = [];
        series[e.item.SeriesName!].push(e);
      });
      return Object.values(series);
    } catch {
      setShowMigration(true);
      return [];
    }
  }, [downloadedFiles]);

  const channelContent = useMemo(() => {
    try {
      return downloadedFiles?.filter((f) => !!f.item.ChannelId) || [];
    } catch {
      setShowMigration(true);
      return [];
    }
  }, [downloadedFiles]);

  const otherMedia = useMemo(() => {
    try {
      return (
        downloadedFiles?.filter(
          (f) =>
            f.item.Type !== "Movie" &&
            f.item.Type !== "Episode" &&
            !f.item.ChannelId,
        ) || []
      );
    } catch {
      setShowMigration(true);
      return [];
    }
  }, [downloadedFiles]);

  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable
          onPress={bottomSheetModalRef.current?.present}
          className='px-2'
        >
          <DownloadSize items={downloadedFiles?.map((f) => f.item) || []} />
        </Pressable>
      ),
    });
  }, [downloadedFiles]);

  useEffect(() => {
    if (showMigration) {
      migration_20241124();
    }
  }, [showMigration]);

  const _deleteMovies = () =>
    deleteFileByType("Movie")
      .then(() =>
        toast.success(
          t("home.downloads.toasts.deleted_all_movies_successfully"),
        ),
      )
      .catch((reason) => {
        writeToLog("ERROR", reason);
        toast.error(t("home.downloads.toasts.failed_to_delete_all_movies"));
      });
  const _deleteShows = () =>
    deleteFileByType("Episode")
      .then(() =>
        toast.success(
          t("home.downloads.toasts.deleted_all_tvseries_successfully"),
        ),
      )
      .catch((reason) => {
        writeToLog("ERROR", reason);
        toast.error(t("home.downloads.toasts.failed_to_delete_all_tvseries"));
      });
  const _deleteOtherMedia = () =>
    Promise.all(
      otherMedia
        .filter((item) => item.item.Type)
        .map((item) =>
          deleteFileByType(item.item.Type!)
            .then(() =>
              toast.success(
                t("home.downloads.toasts.deleted_media_successfully", {
                  type: item.item.Type,
                }),
              ),
            )
            .catch((reason) => {
              writeToLog("ERROR", reason);
              toast.error(
                t("home.downloads.toasts.failed_to_delete_media", {
                  type: item.item.Type,
                }),
              );
            }),
        ),
    );

  return (
    <OfflineModeProvider isOffline={true}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior='automatic'
      >
        <View style={{ paddingTop: Platform.OS === "android" ? 17 : 0 }}>
          <View className='mb-4 flex flex-col space-y-4 px-4'>
            <ActiveDownloads />
          </View>

          {movies.length > 0 && (
            <View className='mb-4'>
              <View className='flex flex-row items-center justify-between mb-2 px-4'>
                <Text className='text-lg font-bold'>
                  {t("home.downloads.movies")}
                </Text>
                <View className='bg-purple-600 rounded-full h-6 w-6 flex items-center justify-center'>
                  <Text className='text-xs font-bold'>{movies?.length}</Text>
                </View>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View className='px-4 flex flex-row'>
                  {movies?.map((item) => (
                    <TouchableItemRouter item={item.item} key={item.item.Id}>
                      <MovieCard item={item.item} />
                    </TouchableItemRouter>
                  ))}
                </View>
              </ScrollView>
            </View>
          )}
          {groupedBySeries.length > 0 && (
            <View className='mb-4'>
              <View className='flex flex-row items-center justify-between mb-2 px-4'>
                <Text className='text-lg font-bold'>
                  {t("home.downloads.tvseries")}
                </Text>
                <View className='bg-purple-600 rounded-full h-6 w-6 flex items-center justify-center'>
                  <Text className='text-xs font-bold'>
                    {groupedBySeries?.length}
                  </Text>
                </View>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View className='px-4 flex flex-row'>
                  {groupedBySeries?.map((items) => (
                    <View
                      className='mb-2 last:mb-0'
                      key={items[0].item.SeriesId}
                    >
                      <SeriesCard
                        items={items.map((i) => i.item)}
                        key={items[0].item.SeriesId}
                      />
                    </View>
                  ))}
                </View>
              </ScrollView>
            </View>
          )}

          {channelContent.length > 0 && (
            <View className='mb-4'>
              <View className='flex flex-row items-center justify-between mb-2 px-4'>
                <Text className='text-lg font-bold'>
                  {t("home.downloads.channel_content")}
                </Text>
                <View className='bg-purple-600 rounded-full h-6 w-6 flex items-center justify-center'>
                  <Text className='text-xs font-bold'>
                    {channelContent?.length}
                  </Text>
                </View>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View className='px-4 flex flex-row'>
                  {channelContent?.map((item) => (
                    <TouchableItemRouter item={item.item} key={item.item.Id}>
                      <MovieCard item={item.item} />
                    </TouchableItemRouter>
                  ))}
                </View>
              </ScrollView>
            </View>
          )}

          {otherMedia.length > 0 && (
            <View className='mb-4'>
              <View className='flex flex-row items-center justify-between mb-2 px-4'>
                <Text className='text-lg font-bold'>
                  {t("home.downloads.other_media")}
                </Text>
                <View className='bg-purple-600 rounded-full h-6 w-6 flex items-center justify-center'>
                  <Text className='text-xs font-bold'>
                    {otherMedia?.length}
                  </Text>
                </View>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View className='px-4 flex flex-row'>
                  {otherMedia?.map((item) => (
                    <TouchableItemRouter item={item.item} key={item.item.Id}>
                      <MovieCard item={item.item} />
                    </TouchableItemRouter>
                  ))}
                </View>
              </ScrollView>
            </View>
          )}
          {downloadedFiles?.length === 0 && (
            <View className='flex px-4'>
              <Text className='opacity-50'>
                {t("home.downloads.no_downloaded_items")}
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
    </OfflineModeProvider>
  );
}

import {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  BottomSheetModal,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { useNavigation } from "expo-router";
import { useAtom } from "jotai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Platform, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { toast } from "sonner-native";
import { Button } from "@/components/Button";
import {
  buildDownloadedCards,
  buildSeriesGroupCards,
} from "@/components/cards/adapters/downloads";
import type { CardData } from "@/components/cards/CardData";
import { CardRow } from "@/components/cards/CardRow";
import { HeaderButton } from "@/components/common/HeaderButton";
import { Text } from "@/components/common/Text";
import ActiveDownloads from "@/components/downloads/ActiveDownloads";
import { DownloadSize } from "@/components/downloads/DownloadSize";
import useRouter from "@/hooks/useAppRouter";
import { useConfirmDelete } from "@/hooks/useConfirmDelete";
import { useDownload } from "@/providers/DownloadProvider";
import { type DownloadedItem } from "@/providers/Downloads/types";
import { OfflineModeProvider } from "@/providers/OfflineModeProvider";
import { queueAtom } from "@/utils/atoms/queue";
import { writeToLog } from "@/utils/log";

/** Room under each card for its two text lines and the file size. */
const CARD_FOOTER_HEIGHT = 78;

export default function DownloadsPage() {
  const navigation = useNavigation();
  const { t } = useTranslation();
  const [_queue, _setQueue] = useAtom(queueAtom);
  const {
    downloadedItems,
    deleteFile,
    deleteItems,
    deleteFileByType,
    deleteAllFiles,
  } = useDownload();
  const confirmDelete = useConfirmDelete();
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
          style: "cancel",
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

  const otherMedia = useMemo(() => {
    try {
      return (
        downloadedFiles?.filter(
          (f) => f.item.Type !== "Movie" && f.item.Type !== "Episode",
        ) || []
      );
    } catch {
      setShowMigration(true);
      return [];
    }
  }, [downloadedFiles]);

  const movieItems = useMemo(() => movies.map((m) => m.item), [movies]);
  const otherItems = useMemo(() => otherMedia.map((m) => m.item), [otherMedia]);
  const seriesGroups = useMemo(
    () => groupedBySeries.map((group) => group.map((g) => g.item)),
    [groupedBySeries],
  );

  const movieCards = useMemo(
    () => buildDownloadedCards(movieItems),
    [movieItems],
  );
  const otherCards = useMemo(
    () => buildDownloadedCards(otherItems),
    [otherItems],
  );
  const seriesCards = useMemo(
    () => buildSeriesGroupCards(seriesGroups),
    [seriesGroups],
  );

  const itemById = useMemo(
    () => new Map([...movieItems, ...otherItems].map((i) => [i.Id, i])),
    [movieItems, otherItems],
  );
  const episodesBySeriesId = useMemo(
    () =>
      new Map(
        seriesGroups.flatMap((group) =>
          group[0]?.SeriesId ? [[group[0].SeriesId, group] as const] : [],
        ),
      ),
    [seriesGroups],
  );

  // How much disk an item takes has to be asked for, so it arrives as a slot
  // rather than a field on the card.
  const itemSizeSlot = useMemo(
    () => ({
      footer: (card: CardData) => {
        const item = itemById.get(card.id);
        return item ? <DownloadSize items={[item]} /> : null;
      },
    }),
    [itemById],
  );
  const seriesSizeSlot = useMemo(
    () => ({
      footer: (card: CardData) => {
        const episodes = episodesBySeriesId.get(card.id);
        return episodes ? <DownloadSize items={episodes} /> : null;
      },
    }),
    [episodesBySeriesId],
  );

  const confirmDeleteItem = useCallback(
    (item: BaseItemDto) => {
      if (!item.Id) return;
      confirmDelete({
        title: item.Name ?? undefined,
        onConfirm: () => deleteFile(item.Id!),
      });
    },
    [confirmDelete, deleteFile],
  );

  const confirmDeleteSeries = useCallback(
    (seriesId: string) => {
      const episodes = episodesBySeriesId.get(seriesId);
      if (!episodes?.length) return;
      confirmDelete({
        title: episodes[0].SeriesName ?? undefined,
        message: t("player.episode_count", { count: episodes.length }),
        onConfirm: () =>
          deleteItems(
            episodes.map((e) => e.Id).filter((id) => id !== undefined),
          ),
      });
    },
    [confirmDelete, deleteItems, episodesBySeriesId, t],
  );

  const countPill = useCallback(
    (count: number) => (
      <View className='bg-purple-600 rounded-full h-6 w-6 flex items-center justify-center'>
        <Text className='text-xs font-bold'>{count}</Text>
      </View>
    ),
    [],
  );

  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <HeaderButton
          variant='text'
          onPress={() => bottomSheetModalRef.current?.present()}
        >
          <DownloadSize items={downloadedFiles?.map((f) => f.item) || []} />
        </HeaderButton>
      ),
    });
  }, [downloadedFiles]);

  useEffect(() => {
    if (showMigration) {
      migration_20241124();
    }
  }, [showMigration]);

  const deleteMovies = () =>
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
  const deleteShows = () =>
    deleteFileByType("Episode")
      .then(() =>
        toast.success(
          t("home.downloads.toasts.deleted_all_series_successfully"),
        ),
      )
      .catch((reason) => {
        writeToLog("ERROR", reason);
        toast.error(t("home.downloads.toasts.failed_to_delete_all_series"));
      });
  const deleteOtherMedia = () =>
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

  const deleteAllMedia = async () =>
    await Promise.all([deleteMovies(), deleteShows(), deleteOtherMedia()]);

  // Bulk deletes wipe every matching download, so always ask first.
  const confirmBulkDelete = (title: string, onConfirm: () => void) => () =>
    confirmDelete({ title, onConfirm });

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
            <CardRow
              className='mb-4'
              title={t("home.downloads.movies")}
              headerAccessory={countPill(movies.length)}
              kind='portrait'
              textPlacement='below'
              items={movieItems}
              cards={movieCards}
              slots={itemSizeSlot}
              footerHeight={CARD_FOOTER_HEIGHT}
              onLongPressItem={confirmDeleteItem}
            />
          )}

          {groupedBySeries.length > 0 && (
            <CardRow
              className='mb-4'
              title={t("home.downloads.series")}
              headerAccessory={countPill(groupedBySeries.length)}
              kind='portrait'
              textPlacement='below'
              cards={seriesCards}
              slots={seriesSizeSlot}
              footerHeight={CARD_FOOTER_HEIGHT}
              // The series page has to be told it is offline; the shared
              // navigation does not carry that param.
              onPressId={(id) =>
                router.push({
                  pathname: "/series/[id]",
                  params: { id, offline: "true" },
                })
              }
              onLongPressId={confirmDeleteSeries}
            />
          )}

          {otherMedia.length > 0 && (
            <CardRow
              className='mb-4'
              title={t("home.downloads.other_media")}
              headerAccessory={countPill(otherMedia.length)}
              kind='portrait'
              textPlacement='below'
              items={otherItems}
              cards={otherCards}
              slots={itemSizeSlot}
              footerHeight={CARD_FOOTER_HEIGHT}
              onLongPressItem={confirmDeleteItem}
            />
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
      <BottomSheetModal
        ref={bottomSheetModalRef}
        enableDynamicSizing
        handleIndicatorStyle={{
          backgroundColor: "white",
        }}
        backgroundStyle={{
          backgroundColor: "#171717",
        }}
        backdropComponent={(props: BottomSheetBackdropProps) => (
          <BottomSheetBackdrop
            {...props}
            disappearsOnIndex={-1}
            appearsOnIndex={0}
          />
        )}
      >
        <BottomSheetView>
          <View className='p-4 space-y-4 mb-4'>
            <Button
              color='purple'
              onPress={confirmBulkDelete(
                t("home.downloads.delete_all_movies_button"),
                deleteMovies,
              )}
            >
              {t("home.downloads.delete_all_movies_button")}
            </Button>
            <Button
              color='purple'
              onPress={confirmBulkDelete(
                t("home.downloads.delete_all_series_button"),
                deleteShows,
              )}
            >
              {t("home.downloads.delete_all_series_button")}
            </Button>
            {otherMedia.length > 0 && (
              <Button
                color='purple'
                onPress={confirmBulkDelete(
                  t("home.downloads.delete_all_other_media_button"),
                  deleteOtherMedia,
                )}
              >
                {t("home.downloads.delete_all_other_media_button")}
              </Button>
            )}
            <Button
              color='red'
              onPress={confirmBulkDelete(
                t("home.downloads.delete_all_button"),
                deleteAllMedia,
              )}
            >
              {t("home.downloads.delete_all_button")}
            </Button>
          </View>
        </BottomSheetView>
      </BottomSheetModal>
    </OfflineModeProvider>
  );
}

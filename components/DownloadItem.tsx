import {
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
  BottomSheetModal,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import type {
  BaseItemDto,
  MediaSourceInfo,
} from "@jellyfin/sdk/lib/generated-client/models";
import { getUserLibraryApi } from "@jellyfin/sdk/lib/utils/api";
import { type Href } from "expo-router";
import { t } from "i18next";
import { useAtom } from "jotai";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Platform, Switch, View, type ViewProps } from "react-native";
import { toast } from "sonner-native";
import { HEADER_ICON_SIZE } from "@/components/common/HeaderButton";
import { HeaderIcon } from "@/components/common/HeaderIcon";
import { Colors } from "@/constants/Colors";
import useRouter from "@/hooks/useAppRouter";
import useDefaultPlaySettings from "@/hooks/useDefaultPlaySettings";
import { useDownload } from "@/providers/DownloadProvider";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { queueAtom } from "@/utils/atoms/queue";
import { useSettings } from "@/utils/atoms/settings";
import { getDefaultPlaySettings } from "@/utils/jellyfin/getDefaultPlaySettings";
import { getDownloadStreamUrl } from "@/utils/jellyfin/media/getStreamUrl";
import { logAndCaptureError } from "@/utils/log";
import { AudioTrackSelector } from "./AudioTrackSelector";
import { type Bitrate, BitrateSelector } from "./BitrateSelector";
import { Button } from "./Button";
import { Text } from "./common/Text";
import { Loader } from "./Loader";
import { MediaSourceSelector } from "./MediaSourceSelector";
import ProgressCircle from "./ProgressCircle";
import { RoundButton } from "./RoundButton";
import { SubtitleTrackSelector } from "./SubtitleTrackSelector";

/**
 * The progress ring is drawn well under `HEADER_ICON_SIZE`. A stroked circle
 * fills its box edge to edge where a glyph's strokes leave gaps, so at an equal
 * size the ring reads heavier than the icons beside it.
 *
 * Diameter and stroke are separate knobs: shrinking the circle alone leaves a
 * chunkier-looking ring, and thinning the stroke alone does not make it smaller.
 * The stroke is an absolute width rather than a share of the diameter, so
 * resizing the ring does not change its weight.
 *
 * Keep the diameter a whole point. The library draws the stroke tangent to the
 * SVG's edge — `radius` is `size / 2 - width / 2`, so the outer edge lands
 * exactly on the boundary with no slack — and a fractional size rounds to
 * device pixels unevenly, shaving that edge into a visible cutoff.
 */
const PROGRESS_RING_SCALE = 0.79;
const PROGRESS_RING_SIZE = Math.round(HEADER_ICON_SIZE * PROGRESS_RING_SCALE);
const PROGRESS_RING_WIDTH = 2.5;

export type SelectedOptions = {
  bitrate: Bitrate;
  mediaSource: MediaSourceInfo | undefined;
  audioIndex: number | undefined;
  subtitleIndex: number;
};

interface DownloadProps extends ViewProps {
  items: BaseItemDto[];
  MissingDownloadIconComponent: () => React.ReactElement;
  DownloadedIconComponent: () => React.ReactElement;
  title?: string;
  subtitle?: string;
  size?: "default" | "large";
}

export const DownloadItems: React.FC<DownloadProps> = ({
  items,
  MissingDownloadIconComponent,
  DownloadedIconComponent,
  title = "Download",
  subtitle = "",
  size = "default",
  ...props
}) => {
  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);
  const [queue, _setQueue] = useAtom(queueAtom);
  const { settings } = useSettings();
  const router = useRouter();
  const [downloadUnwatchedOnly, setDownloadUnwatchedOnly] = useState(false);

  const { processes, startBackgroundDownload, downloadedItems } = useDownload();
  const downloadedFiles = downloadedItems;

  const [selectedOptions, setSelectedOptions] = useState<
    SelectedOptions | undefined
  >(undefined);

  const {
    defaultAudioIndex,
    defaultBitrate,
    defaultMediaSource,
    defaultSubtitleIndex,
  } = useDefaultPlaySettings(items[0], settings);

  const userCanDownload = useMemo(
    () => user?.Policy?.EnableContentDownloading,
    [user],
  );

  const bottomSheetModalRef = useRef<BottomSheetModal>(null);

  const handlePresentModalPress = useCallback(() => {
    bottomSheetModalRef.current?.present();
  }, []);

  const handleSheetChanges = useCallback((_index: number) => {
    // Modal state tracking handled by BottomSheetModal
  }, []);

  const closeModal = useCallback(() => {
    bottomSheetModalRef.current?.dismiss();
  }, []);

  const itemIds = useMemo(() => items.map((i) => i.Id), [items]);

  const itemsNotDownloaded = useMemo(
    () =>
      items.filter((i) => !downloadedFiles?.some((f) => f.item.Id === i.Id)),
    [items, downloadedFiles],
  );

  // Initialize selectedOptions with default values
  useEffect(() => {
    setSelectedOptions(() => ({
      bitrate: defaultBitrate,
      mediaSource: defaultMediaSource ?? undefined,
      subtitleIndex: defaultSubtitleIndex ?? -1,
      audioIndex: defaultAudioIndex,
    }));
  }, [
    defaultAudioIndex,
    defaultBitrate,
    defaultSubtitleIndex,
    defaultMediaSource,
  ]);

  const itemsToDownload = useMemo(() => {
    if (downloadUnwatchedOnly) {
      return itemsNotDownloaded.filter((item) => !item.UserData?.Played);
    }
    return itemsNotDownloaded;
  }, [itemsNotDownloaded, downloadUnwatchedOnly]);

  const allItemsDownloaded = useMemo(() => {
    if (items.length === 0) return false;
    return itemsNotDownloaded.length === 0;
  }, [items, itemsNotDownloaded]);
  const itemsProcesses = useMemo(
    () =>
      processes?.filter((p) => p?.item?.Id && itemIds.includes(p.item.Id)) ||
      [],
    [processes, itemIds],
  );

  const progress = useMemo(() => {
    if (itemIds.length === 1)
      return itemsProcesses.reduce((acc, p) => acc + (p.progress || 0), 0);
    return (
      ((itemIds.length -
        queue.filter((q) => itemIds.includes(q.item.Id)).length) /
        itemIds.length) *
      100
    );
  }, [queue, itemsProcesses, itemIds]);

  const itemsQueued = useMemo(() => {
    return (
      itemsNotDownloaded.length > 0 &&
      itemsNotDownloaded.every((p) => queue.some((q) => p.Id === q.item.Id))
    );
  }, [queue, itemsNotDownloaded]);

  const itemsInProgressOrQueued = useMemo(() => {
    const inProgress = itemsProcesses.length;
    const inQueue = queue.filter((q) => itemIds.includes(q.item.Id)).length;
    return inProgress + inQueue;
  }, [itemsProcesses, queue, itemIds]);

  const navigateToDownloads = () => router.push("/downloads");

  const onDownloadedPress = () => {
    const firstItem = items?.[0];
    router.push(
      firstItem.Type !== "Episode"
        ? "/downloads"
        : ({
            pathname: "/series/[id]",
            params: {
              id: firstItem.SeriesId!,
              seasonIndex: firstItem.ParentIndexNumber?.toString(),
              offline: "true",
            },
          } as Href),
    );
  };

  const initiateDownload = useCallback(
    async (...items: BaseItemDto[]) => {
      if (
        !api ||
        !user?.Id ||
        items.some((p) => !p.Id) ||
        (itemsNotDownloaded.length === 1 && !selectedOptions?.mediaSource?.Id)
      ) {
        throw new Error(
          "DownloadItem ~ initiateDownload: No api or user or item",
        );
      }
      const downloadDetailsPromises = items.map(async (item) => {
        // Ensure the snapshot we store offline carries the Chapters array.
        // Page-level fetches sometimes use a fields filter that omits it; the
        // offline player would then render no chapter ticks / list.
        let itemForDownload = item;
        if (!itemForDownload.Chapters && itemForDownload.Id) {
          try {
            const enriched = await getUserLibraryApi(api).getItem({
              itemId: itemForDownload.Id,
              userId: user.Id!,
            });
            if (enriched.data) {
              itemForDownload = enriched.data;
            }
          } catch (e) {
            console.warn(
              "[DownloadItem] failed to refresh item for Chapters, falling back to original",
              e,
            );
          }
        }

        const { mediaSource, audioIndex, subtitleIndex } =
          itemsNotDownloaded.length > 1
            ? getDefaultPlaySettings(itemForDownload, settings!)
            : {
                mediaSource: selectedOptions?.mediaSource,
                audioIndex: selectedOptions?.audioIndex,
                subtitleIndex: selectedOptions?.subtitleIndex,
              };

        // Awaited with Promise.all over a season: a throw would abort the batch.
        const downloadDetails = await getDownloadStreamUrl({
          api,
          item: itemForDownload,
          userId: user.Id!,
          mediaSourceId: mediaSource?.Id,
          audioStreamIndex: audioIndex ?? -1,
          subtitleStreamIndex: subtitleIndex ?? -1,
          maxStreamingBitrate: (selectedOptions?.bitrate || defaultBitrate)
            .value,
          audioMode: settings?.audioTranscodeMode,
        }).catch((error) => {
          logAndCaptureError("Getting download stream URL failed", error, {
            itemType: itemForDownload.Type,
          });
          return null;
        });

        return {
          url: downloadDetails?.url,
          item: itemForDownload,
          mediaSource: downloadDetails?.mediaSource,
        };
      });

      const downloadDetails = await Promise.all(downloadDetailsPromises);
      for (const { url, item, mediaSource } of downloadDetails) {
        if (!url) {
          Alert.alert(
            t("home.downloads.something_went_wrong"),
            t("home.downloads.could_not_get_stream_url_from_jellyfin"),
          );
          continue;
        }
        if (!mediaSource) {
          console.error(`Could not get download URL for ${item.Name}`);
          toast.error(
            t("home.downloads.toasts.could_not_get_download_url_for_item", {
              itemName: item.Name,
            }),
          );
          continue;
        }
        // Get the audio/subtitle indices that were used for this download
        const downloadAudioIndex =
          itemsNotDownloaded.length > 1
            ? getDefaultPlaySettings(item, settings!).audioIndex
            : selectedOptions?.audioIndex;
        const downloadSubtitleIndex =
          itemsNotDownloaded.length > 1
            ? getDefaultPlaySettings(item, settings!).subtitleIndex
            : selectedOptions?.subtitleIndex;

        await startBackgroundDownload(
          url,
          item,
          mediaSource,
          selectedOptions?.bitrate || defaultBitrate,
          downloadAudioIndex,
          downloadSubtitleIndex,
        );
      }
    },
    [
      api,
      user?.Id,
      itemsNotDownloaded,
      selectedOptions,
      settings,
      defaultBitrate,
      startBackgroundDownload,
    ],
  );

  const acceptDownloadOptions = useCallback(async () => {
    if (userCanDownload === true) {
      if (itemsToDownload.some((i) => !i.Id)) {
        throw new Error("No item id");
      }

      closeModal();

      // Wait for modal dismiss animation to complete
      setTimeout(() => {
        initiateDownload(...itemsToDownload);
      }, 300);
    } else {
      toast.error(
        t("home.downloads.toasts.you_are_not_allowed_to_download_files"),
      );
    }
  }, [closeModal, initiateDownload, itemsToDownload, userCanDownload]);

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
      />
    ),
    [],
  );

  const renderButtonContent = () => {
    // For single item downloads, show progress if item is being processed
    // For multi-item downloads (season/series), show progress only if 2+ items are in progress or queued
    const shouldShowProgress =
      itemIds.length === 1
        ? itemsProcesses.length > 0
        : itemsInProgressOrQueued > 1;

    if (processes.length > 0 && shouldShowProgress) {
      return progress === 0 ? (
        <Loader />
      ) : (
        <View className='-rotate-45'>
          <ProgressCircle
            size={PROGRESS_RING_SIZE}
            fill={progress}
            width={PROGRESS_RING_WIDTH}
            tintColor={Colors.primary}
            backgroundColor='white'
          />
        </View>
      );
    }

    if (itemsQueued) {
      return <HeaderIcon name='queued' />;
    }

    if (allItemsDownloaded) {
      return <DownloadedIconComponent />;
    }

    return <MissingDownloadIconComponent />;
  };

  const onButtonPress = () => {
    if (processes && itemsProcesses.length > 0) {
      navigateToDownloads();
    } else if (itemsQueued) {
      navigateToDownloads();
    } else if (allItemsDownloaded) {
      onDownloadedPress();
    } else {
      handlePresentModalPress();
    }
  };

  return (
    <View {...props}>
      <RoundButton size={size} onPress={onButtonPress}>
        {renderButtonContent()}
      </RoundButton>
      <BottomSheetModal
        ref={bottomSheetModalRef}
        enableDynamicSizing
        handleIndicatorStyle={{
          backgroundColor: "white",
        }}
        backgroundStyle={{
          backgroundColor: "#171717",
        }}
        onChange={handleSheetChanges}
        backdropComponent={renderBackdrop}
        enablePanDownToClose
        enableDismissOnClose
        android_keyboardInputMode='adjustResize'
        keyboardBehavior='interactive'
        keyboardBlurBehavior='restore'
      >
        <BottomSheetView>
          <View className='flex flex-col space-y-4 px-4 pb-8 pt-2'>
            <View>
              <Text className='font-bold text-2xl text-neutral-100'>
                {title}
              </Text>
              <Text className='text-neutral-300'>
                {subtitle ||
                  t("item_card.download.download_x_item", {
                    item_count: itemsToDownload.length,
                  })}
              </Text>
            </View>
            <View className='flex flex-col space-y-2 w-full'>
              <View className='items-start'>
                <BitrateSelector
                  inverted
                  onChange={(val) =>
                    setSelectedOptions(
                      (prev) => prev && { ...prev, bitrate: val },
                    )
                  }
                  selected={selectedOptions?.bitrate}
                />
              </View>
              {itemsNotDownloaded.length > 1 && (
                <View className='flex flex-row items-center justify-between w-full py-2'>
                  <Text>{t("item_card.download.download_unwatched_only")}</Text>
                  <Switch
                    onValueChange={setDownloadUnwatchedOnly}
                    value={downloadUnwatchedOnly}
                  />
                </View>
              )}
              {itemsNotDownloaded.length === 1 && (
                <View>
                  <View className='items-start'>
                    <MediaSourceSelector
                      item={items[0]}
                      onChange={(val) =>
                        setSelectedOptions(
                          (prev) =>
                            prev && {
                              ...prev,
                              mediaSource: val,
                            },
                        )
                      }
                      selected={selectedOptions?.mediaSource}
                    />
                  </View>
                  {selectedOptions?.mediaSource && (
                    <View className='flex flex-col space-y-2 items-start'>
                      <AudioTrackSelector
                        source={selectedOptions.mediaSource}
                        onChange={(val) => {
                          setSelectedOptions(
                            (prev) =>
                              prev && {
                                ...prev,
                                audioIndex: val,
                              },
                          );
                        }}
                        selected={selectedOptions.audioIndex}
                      />
                      <SubtitleTrackSelector
                        source={selectedOptions.mediaSource}
                        onChange={(val) => {
                          setSelectedOptions(
                            (prev) =>
                              prev && {
                                ...prev,
                                subtitleIndex: val,
                              },
                          );
                        }}
                        selected={selectedOptions.subtitleIndex}
                      />
                    </View>
                  )}
                </View>
              )}
            </View>

            <Button onPress={acceptDownloadOptions} color='purple'>
              {t("item_card.download.download_button")}
            </Button>
          </View>
        </BottomSheetView>
      </BottomSheetModal>
    </View>
  );
};

export const DownloadSingleItem: React.FC<{
  size?: "default" | "large";
  item: BaseItemDto;
}> = ({ item, size = "default" }) => {
  if (Platform.isTV) return;

  return (
    <DownloadItems
      size={size}
      title={
        item.Type === "Episode"
          ? t("item_card.download.download_episode")
          : t("item_card.download.download_movie")
      }
      subtitle={item.Name!}
      items={[item]}
      MissingDownloadIconComponent={() => <HeaderIcon name='downloads' />}
      DownloadedIconComponent={() => (
        <HeaderIcon name='downloaded' tintColor={Colors.primary} />
      )}
    />
  );
};

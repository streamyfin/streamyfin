import { useRemuxHlsToMp4 } from "@/hooks/useRemuxHlsToMp4";
import { useDownload } from "@/providers/DownloadProvider";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { queueActions, queueAtom } from "@/utils/atoms/queue";
import {DownloadMethod, useSettings} from "@/utils/atoms/settings";
import { getDefaultPlaySettings } from "@/utils/jellyfin/getDefaultPlaySettings";
import { getStreamUrl } from "@/utils/jellyfin/media/getStreamUrl";
import { saveDownloadItemInfoToDiskTmp } from "@/utils/optimize-server";
import download from "@/utils/profiles/download";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  BottomSheetBackdrop,
  BottomSheetBackdropProps,
  BottomSheetModal,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import {
  BaseItemDto,
  MediaSourceInfo,
} from "@jellyfin/sdk/lib/generated-client/models";
import { Href, router, useFocusEffect } from "expo-router";
import { useAtom } from "jotai";
import React, { useCallback, useMemo, useRef, useState } from "react";
import { Alert, View, ViewProps } from "react-native";
import { toast } from "sonner-native";
import { AudioTrackSelector } from "./AudioTrackSelector";
import { Bitrate, BitrateSelector } from "./BitrateSelector";
import { Button } from "./Button";
import { Text } from "./common/Text";
import { Loader } from "./Loader";
import { MediaSourceSelector } from "./MediaSourceSelector";
import ProgressCircle from "./ProgressCircle";
import { RoundButton } from "./RoundButton";
import { SubtitleTrackSelector } from "./SubtitleTrackSelector";
import { t } from "i18next";

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
  const [queue, setQueue] = useAtom(queueAtom);
  const [settings] = useSettings();

  const { processes, startBackgroundDownload, downloadedFiles } = useDownload();
  const { startRemuxing } = useRemuxHlsToMp4();

  const [selectedMediaSource, setSelectedMediaSource] = useState<
    MediaSourceInfo | undefined | null
  >(undefined);
  const [selectedAudioStream, setSelectedAudioStream] = useState<number>(-1);
  const [selectedSubtitleStream, setSelectedSubtitleStream] =
    useState<number>(0);
  const [maxBitrate, setMaxBitrate] = useState<Bitrate>({
    key: "Max",
    value: undefined,
  });

  const userCanDownload = useMemo(
    () => user?.Policy?.EnableContentDownloading,
    [user]
  );
  const usingOptimizedServer = useMemo(
    () => settings?.downloadMethod === DownloadMethod.Optimized,
    [settings]
  );

  const bottomSheetModalRef = useRef<BottomSheetModal>(null);

  const handlePresentModalPress = useCallback(() => {
    bottomSheetModalRef.current?.present();
  }, []);

  const handleSheetChanges = useCallback((index: number) => {}, []);

  const closeModal = useCallback(() => {
    bottomSheetModalRef.current?.dismiss();
  }, []);

  const itemIds = useMemo(() => items.map((i) => i.Id), [items]);

  const itemsNotDownloaded = useMemo(
    () =>
      items.filter((i) => !downloadedFiles?.some((f) => f.item.Id === i.Id)),
    [items, downloadedFiles]
  );

  const allItemsDownloaded = useMemo(() => {
    if (items.length === 0) return false;
    return itemsNotDownloaded.length === 0;
  }, [items, itemsNotDownloaded]);
  const itemsProcesses = useMemo(
    () => processes?.filter((p) => itemIds.includes(p.item.Id)),
    [processes, itemIds]
  );

  const progress = useMemo(() => {
    if (itemIds.length == 1)
      return itemsProcesses.reduce((acc, p) => acc + p.progress, 0);
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
      itemsNotDownloaded.every((p) => queue.some((q) => p.Id == q.item.Id))
    );
  }, [queue, itemsNotDownloaded]);
  const navigateToDownloads = () => router.push("/downloads");

  const onDownloadedPress = () => {
    const firstItem = items?.[0];
    router.push(
      firstItem.Type !== "Episode"
        ? "/downloads"
        : ({
            pathname: `/downloads/${firstItem.SeriesId}`,
            params: {
              episodeSeasonIndex: firstItem.ParentIndexNumber,
            },
          } as Href)
    );
  };

  const acceptDownloadOptions = useCallback(() => {
    if (userCanDownload === true) {
      if (itemsNotDownloaded.some((i) => !i.Id)) {
        throw new Error("No item id");
      }
      closeModal();

      if (usingOptimizedServer) initiateDownload(...itemsNotDownloaded);
      else {
        queueActions.enqueue(
          queue,
          setQueue,
          ...itemsNotDownloaded.map((item) => ({
            id: item.Id!,
            execute: async () => await initiateDownload(item),
            item,
          }))
        );
      }
    } else {
      toast.error(t("home.downloads.toasts.you_are_not_allowed_to_download_files"));
    }
  }, [
    queue,
    setQueue,
    itemsNotDownloaded,
    usingOptimizedServer,
    userCanDownload,
    maxBitrate,
    selectedMediaSource,
    selectedAudioStream,
    selectedSubtitleStream,
  ]);

  const initiateDownload = useCallback(
    async (...items: BaseItemDto[]) => {
      if (
        !api ||
        !user?.Id ||
        items.some((p) => !p.Id) ||
        (itemsNotDownloaded.length === 1 && !selectedMediaSource?.Id)
      ) {
        throw new Error(
          "DownloadItem ~ initiateDownload: No api or user or item"
        );
      }
      let mediaSource = selectedMediaSource;
      let audioIndex: number | undefined = selectedAudioStream;
      let subtitleIndex: number | undefined = selectedSubtitleStream;

      for (const item of items) {
        if (itemsNotDownloaded.length > 1) {
          ({ mediaSource, audioIndex, subtitleIndex } = getDefaultPlaySettings(
            item,
            settings!
          ));
        }

        const res = await getStreamUrl({
          api,
          item,
          startTimeTicks: 0,
          userId: user?.Id,
          audioStreamIndex: audioIndex,
          maxStreamingBitrate: maxBitrate.value,
          mediaSourceId: mediaSource?.Id,
          subtitleStreamIndex: subtitleIndex,
          deviceProfile: download,
        });

        if (!res) {
          Alert.alert(
            t("home.downloads.something_went_wrong"),
            t("home.downloads.could_not_get_stream_url_from_jellyfin")
          );
          continue;
        }

        const { mediaSource: source, url } = res;

        if (!url || !source) throw new Error("No url");

        saveDownloadItemInfoToDiskTmp(item, source, url);

        if (usingOptimizedServer) {
          await startBackgroundDownload(url, item, source);
        } else {
          await startRemuxing(item, url, source);
        }
      }
    },
    [
      api,
      user?.Id,
      itemsNotDownloaded,
      selectedMediaSource,
      selectedAudioStream,
      selectedSubtitleStream,
      settings,
      maxBitrate,
      usingOptimizedServer,
      startBackgroundDownload,
      startRemuxing,
    ]
  );

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
      />
    ),
    []
  );
  useFocusEffect(
    useCallback(() => {
      if (!settings) return;
      if (itemsNotDownloaded.length !== 1) return;
      const { bitrate, mediaSource, audioIndex, subtitleIndex } =
        getDefaultPlaySettings(items[0], settings);

      setSelectedMediaSource(mediaSource ?? undefined);
      setSelectedAudioStream(audioIndex ?? 0);
      setSelectedSubtitleStream(subtitleIndex ?? -1);
      setMaxBitrate(bitrate);
    }, [items, itemsNotDownloaded, settings])
  );

  const renderButtonContent = () => {
    if (processes && itemsProcesses.length > 0) {
      return progress === 0 ? (
        <Loader />
      ) : (
        <View className="-rotate-45">
          <ProgressCircle
            size={24}
            fill={progress}
            width={4}
            tintColor="#9334E9"
            backgroundColor="#bdc3c7"
          />
        </View>
      );
    } else if (itemsQueued) {
      return <Ionicons name="hourglass" size={24} color="white" />;
    } else if (allItemsDownloaded) {
      return <DownloadedIconComponent />;
    } else {
      return <MissingDownloadIconComponent />;
    }
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
      >
        <BottomSheetView>
          <View className="flex flex-col space-y-4 px-4 pb-8 pt-2">
            <View>
              <Text className="font-bold text-2xl text-neutral-100">
                {title}
              </Text>
              <Text className="text-neutral-300">
                {subtitle || t("item_card.download.download_x_item", {item_count: itemsNotDownloaded.length})}
              </Text>
            </View>
            <View className="flex flex-col space-y-2 w-full items-start">
              <BitrateSelector
                inverted
                onChange={setMaxBitrate}
                selected={maxBitrate}
              />
              {itemsNotDownloaded.length === 1 && (
                <>
                  <MediaSourceSelector
                    item={items[0]}
                    onChange={setSelectedMediaSource}
                    selected={selectedMediaSource}
                  />
                  {selectedMediaSource && (
                    <View className="flex flex-col space-y-2">
                      <AudioTrackSelector
                        source={selectedMediaSource}
                        onChange={setSelectedAudioStream}
                        selected={selectedAudioStream}
                      />
                      <SubtitleTrackSelector
                        source={selectedMediaSource}
                        onChange={setSelectedSubtitleStream}
                        selected={selectedSubtitleStream}
                      />
                    </View>
                  )}
                </>
              )}
            </View>
            <Button
              className="mt-auto"
              onPress={acceptDownloadOptions}
              color="purple"
            >
              {t("item_card.download.download_button")}
            </Button>
            <View className="opacity-70 text-center w-full flex items-center">
              <Text className="text-xs">
                {usingOptimizedServer
                  ? t("item_card.download.using_optimized_server")
                  : t("item_card.download.using_default_method")}
              </Text>
            </View>
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
  return (
    <DownloadItems
      size={size}
      title={item.Type == "Episode"
        ? t("item_card.download.download_episode")
        : t("item_card.download.download_movie")}
      subtitle={item.Name!}
      items={[item]}
      MissingDownloadIconComponent={() => (
        <Ionicons name="cloud-download-outline" size={24} color="white" />
      )}
      DownloadedIconComponent={() => (
        <Ionicons name="cloud-download" size={26} color="#9333ea" />
      )}
    />
  );
};

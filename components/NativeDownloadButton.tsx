import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { DownloadMethod, useSettings } from "@/utils/atoms/settings";
import { getDefaultPlaySettings } from "@/utils/jellyfin/getDefaultPlaySettings";
import { getStreamUrl } from "@/utils/jellyfin/media/getStreamUrl";
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
import RNBackgroundDownloader, {
  DownloadTaskState,
} from "@kesha-antonov/react-native-background-downloader";
import { useFocusEffect } from "expo-router";
import { t } from "i18next";
import { useAtom } from "jotai";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { View, ViewProps } from "react-native";
import { toast } from "sonner-native";
import { AudioTrackSelector } from "./AudioTrackSelector";
import { Bitrate, BitrateSelector } from "./BitrateSelector";
import { Button } from "./Button";
import { Text } from "./common/Text";
import { MediaSourceSelector } from "./MediaSourceSelector";
import { RoundButton } from "./RoundButton";
import { SubtitleTrackSelector } from "./SubtitleTrackSelector";

import * as FileSystem from "expo-file-system";
import ProgressCircle from "./ProgressCircle";

import {
  downloadHLSAsset,
  useDownloadProgress,
  useDownloadError,
  useDownloadComplete,
  addCompleteListener,
  addErrorListener,
  addProgressListener,
  checkForExistingDownloads,
} from "@/modules/hls-downloader";

interface NativeDownloadButton extends ViewProps {
  item: BaseItemDto;
  title?: string;
  subtitle?: string;
  size?: "default" | "large";
}

type DownloadState = {
  id: string;
  progress: number;
  state: DownloadTaskState;
  metadata?: {};
};

export const NativeDownloadButton: React.FC<NativeDownloadButton> = ({
  item,
  title = "Download",
  subtitle = "",
  size = "default",
  ...props
}) => {
  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);
  const [settings] = useSettings();

  const [activeDownload, setActiveDownload] = useState<
    DownloadState | undefined
  >(undefined);

  const [selectedMediaSource, setSelectedMediaSource] = useState<
    MediaSourceInfo | undefined | null
  >(undefined);
  const [selectedAudioStream, setSelectedAudioStream] = useState<number>(-1);
  const [selectedSubtitleStream, setSelectedSubtitleStream] =
    useState<number>(0);
  const [maxBitrate, setMaxBitrate] = useState<Bitrate>(
    settings?.defaultBitrate ?? {
      key: "Max",
      value: undefined,
    }
  );

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

  const acceptDownloadOptions = useCallback(async () => {
    if (userCanDownload === true) {
      closeModal();

      console.log({
        selectedAudioStream,
        selectedMediaSource,
        selectedSubtitleStream,
        maxBitrate,
        item,
      });

      const res = await getStreamUrl({
        api,
        item,
        startTimeTicks: 0,
        userId: user?.Id,
        audioStreamIndex: selectedAudioStream,
        maxStreamingBitrate: maxBitrate.value,
        mediaSourceId: selectedMediaSource?.Id,
        subtitleStreamIndex: selectedSubtitleStream,
        deviceProfile: download,
      });

      console.log("acceptDownloadOptions ~", res);

      if (!res?.url) throw new Error("No url found");

      if (res.url.includes("master.m3u8")) {
        // TODO: Download with custom native module
        console.log("TODO: Download with custom native module");
        if (!item.Id || !item.Name) throw new Error("No item id found");
        downloadHLSAsset(item.Id, res.url, item.Name);
      } else {
        // Download with reac-native-background-downloader
        const destination = `${FileSystem.documentDirectory}${item.Name}.mkv`;
        const jobId = item.Id!;

        try {
          RNBackgroundDownloader.download({
            id: jobId,
            url: res.url,
            destination,
          })
            .begin(({ expectedBytes, headers }) => {
              console.log(`Starting download of ${expectedBytes} bytes`);
              toast.success("Download started");
              setActiveDownload({
                id: jobId,
                progress: 0,
                state: "DOWNLOADING",
              });
            })
            .progress(({ bytesDownloaded, bytesTotal }) =>
              console.log(`Downloaded: ${bytesDownloaded} of ${bytesTotal}`)
            )
            .done(({ bytesDownloaded, bytesTotal }) => {
              console.log("Download completed:", bytesDownloaded, bytesTotal);

              RNBackgroundDownloader.completeHandler(jobId);
            })
            .error(({ error, errorCode }) =>
              console.error("Download error:", error)
            );
        } catch (error) {
          console.log("error ~", error);
        }
      }
    } else {
      toast.error(
        t("home.downloads.toasts.you_are_not_allowed_to_download_files")
      );
    }

    closeModal();
  }, [
    userCanDownload,
    maxBitrate,
    selectedMediaSource,
    selectedAudioStream,
    selectedSubtitleStream,
  ]);

  useEffect(() => {
    const progressListener = addProgressListener((_item) => {
      console.log("progress ~", item);
      if (item.Id !== _item.id) return;
      setActiveDownload((prev) => {
        if (!prev) return undefined;
        return {
          ...prev,
          progress: _item.progress,
          state: _item.state,
        };
      });
    });

    checkForExistingDownloads().then((downloads) => {
      console.log(
        "AVAssetDownloadURLSession ~ checkForExistingDownloads ~",
        downloads
      );

      const firstDownload = downloads?.[0];

      if (!firstDownload) return;
      if (firstDownload.id !== item.Id) return;

      setActiveDownload({
        id: firstDownload?.id,
        progress: firstDownload?.progress,
        state: firstDownload?.state,
      });
    });

    return () => {
      progressListener.remove();
    };
  }, []);

  // useEffect(() => {
  //   console.log(progress);

  //   // setActiveDownload({
  //   //   id: activeDownload?.id!,
  //   //   progress,
  //   //   state: "DOWNLOADING",
  //   // });
  // }, [progress]);

  useEffect(() => {
    RNBackgroundDownloader.checkForExistingDownloads().then((downloads) => {
      console.log(
        "RNBackgroundDownloader ~ checkForExistingDownloads ~",
        downloads
      );
      const e = downloads?.[0];
      setActiveDownload({
        id: e?.id,
        progress: e?.bytesDownloaded / e?.bytesTotal,
        state: e?.state,
      });

      e.progress(({ bytesDownloaded, bytesTotal }) => {
        console.log(`Downloaded: ${bytesDownloaded} of ${bytesTotal}`);
        setActiveDownload({
          id: e?.id,
          progress: bytesDownloaded / bytesTotal,
          state: e?.state,
        });
      });
      e.done(({ bytesDownloaded, bytesTotal }) => {
        console.log("Download completed:", bytesDownloaded, bytesTotal);
        setActiveDownload(undefined);
      });
      e.error(({ error, errorCode }) => {
        console.error("Download error:", error);
        setActiveDownload(undefined);
      });
    });
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!settings) return;
      const { bitrate, mediaSource, audioIndex, subtitleIndex } =
        getDefaultPlaySettings(item, settings);

      setSelectedMediaSource(mediaSource ?? undefined);
      setSelectedAudioStream(audioIndex ?? 0);
      setSelectedSubtitleStream(subtitleIndex ?? -1);
      setMaxBitrate(bitrate);
    }, [item, settings])
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

  const onButtonPress = () => {
    handlePresentModalPress();
  };

  return (
    <View {...props}>
      <RoundButton
        disabled={userCanDownload === false || activeDownload?.id !== undefined}
        size={size}
        onPress={onButtonPress}
      >
        {activeDownload && activeDownload?.progress > 0 ? (
          <ProgressCircle
            size={24}
            fill={activeDownload.progress * 100}
            width={4}
            tintColor="#9334E9"
            backgroundColor="#bdc3c7"
          />
        ) : (
          <Ionicons name="cloud-download-outline" size={24} color="white" />
        )}
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
            </View>
            <View className="flex flex-col space-y-2 w-full items-start">
              <BitrateSelector
                inverted
                onChange={setMaxBitrate}
                selected={maxBitrate}
              />
              <MediaSourceSelector
                item={item}
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

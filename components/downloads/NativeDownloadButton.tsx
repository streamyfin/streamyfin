import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { useNativeDownloads } from "@/providers/NativeDownloadProvider";
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
import { useFocusEffect } from "expo-router";
import { t } from "i18next";
import { useAtom } from "jotai";
import React, { useCallback, useMemo, useRef, useState } from "react";
import { ActivityIndicator, View, ViewProps } from "react-native";
import { toast } from "sonner-native";
import { AudioTrackSelector } from "../AudioTrackSelector";
import { Bitrate, BitrateSelector } from "../BitrateSelector";
import { Button } from "../Button";
import { Text } from "../common/Text";
import { MediaSourceSelector } from "../MediaSourceSelector";
import ProgressCircle from "../ProgressCircle";
import { RoundButton } from "../RoundButton";
import { SubtitleTrackSelector } from "../SubtitleTrackSelector";

interface NativeDownloadButton extends ViewProps {
  item: BaseItemDto;
  title?: string;
  subtitle?: string;
  size?: "default" | "large";
}

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
  const { downloads, startDownload } = useNativeDownloads();

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

      try {
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

        if (!res?.url) throw new Error("No url found");
        if (!item.Id || !item.Name) throw new Error("No item id found");
        if (!selectedMediaSource) throw new Error("No media source found");
        if (!selectedAudioStream) throw new Error("No audio stream found");

        await startDownload(item, res.url, {
          maxBitrate: maxBitrate.value,
          selectedAudioStream,
          selectedSubtitleStream,
          selectedMediaSource,
        });
        toast.success("Download started");
      } catch (error) {
        console.error("Download error:", error);
        toast.error("Failed to start download");
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
    item,
    user,
    api,
  ]);

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

  const activeDownload = item.Id ? downloads[item.Id] : undefined;

  return (
    <View {...props}>
      <RoundButton
        disabled={userCanDownload === false || activeDownload !== undefined}
        size={size}
        onPress={handlePresentModalPress}
      >
        {activeDownload ? (
          <>
            {activeDownload.state === "PENDING" && (
              <ActivityIndicator size="small" color="white" />
            )}
            {activeDownload.state === "DOWNLOADING" && (
              <ProgressCircle
                size={24}
                fill={activeDownload.progress * 100}
                width={4}
                tintColor="#9334E9"
                backgroundColor="#bdc3c7"
              />
            )}
            {activeDownload.state === "FAILED" && (
              <Ionicons name="close" size={24} color="white" />
            )}
            {activeDownload.state === "PAUSED" && (
              <Ionicons name="pause" size={24} color="white" />
            )}
            {activeDownload.state === "STOPPED" && (
              <Ionicons name="stop" size={24} color="white" />
            )}
            {activeDownload.state === "DONE" && (
              <Ionicons name="cloud-done-outline" size={24} color={"white"} />
            )}
          </>
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

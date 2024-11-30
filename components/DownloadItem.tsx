import { useRemuxHlsToMp4 } from "@/hooks/useRemuxHlsToMp4";
import { useDownload } from "@/providers/DownloadProvider";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { queueActions, queueAtom } from "@/utils/atoms/queue";
import { useSettings } from "@/utils/atoms/settings";
import { getDefaultPlaySettings } from "@/utils/jellyfin/getDefaultPlaySettings";
import { getStreamUrl } from "@/utils/jellyfin/media/getStreamUrl";
import { saveDownloadItemInfoToDiskTmp } from "@/utils/optimize-server";
import native from "@/utils/profiles/native";
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
import {Href, router, useFocusEffect} from "expo-router";
import { useAtom } from "jotai";
import { useCallback, useMemo, useRef, useState } from "react";
import { Alert, TouchableOpacity, View, ViewProps } from "react-native";
import { toast } from "sonner-native";
import { AudioTrackSelector } from "./AudioTrackSelector";
import { Bitrate, BitrateSelector } from "./BitrateSelector";
import { Button } from "./Button";
import { Text } from "./common/Text";
import { Loader } from "./Loader";
import { MediaSourceSelector } from "./MediaSourceSelector";
import ProgressCircle from "./ProgressCircle";
import { SubtitleTrackSelector } from "./SubtitleTrackSelector";

interface DownloadProps extends ViewProps {
  item: BaseItemDto;
}

export const DownloadItem: React.FC<DownloadProps> = ({ item, ...props }) => {
  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);
  const [queue, setQueue] = useAtom(queueAtom);
  const [settings] = useSettings();
  const { processes, startBackgroundDownload } = useDownload();
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

  useFocusEffect(
    useCallback(() => {
      if (!settings) return;
      const { bitrate, mediaSource, audioIndex, subtitleIndex } =
        getDefaultPlaySettings(item, settings);

      // 4. Set states
      setSelectedMediaSource(mediaSource ?? undefined);
      setSelectedAudioStream(audioIndex ?? 0);
      setSelectedSubtitleStream(subtitleIndex ?? -1);
      setMaxBitrate(bitrate);
    }, [item, settings])
  );

  const userCanDownload = useMemo(() => {
    return user?.Policy?.EnableContentDownloading;
  }, [user]);

  /**
   * Bottom sheet
   */
  const bottomSheetModalRef = useRef<BottomSheetModal>(null);

  const handlePresentModalPress = useCallback(() => {
    bottomSheetModalRef.current?.present();
  }, []);

  const handleSheetChanges = useCallback((index: number) => {}, []);

  const closeModal = useCallback(() => {
    bottomSheetModalRef.current?.dismiss();
  }, []);

  /**
   * Start download
   */
  const initiateDownload = useCallback(async () => {
    if (!api || !user?.Id || !item.Id || !selectedMediaSource?.Id) {
      throw new Error(
        "DownloadItem ~ initiateDownload: No api or user or item"
      );
    }

    const res = await getStreamUrl({
      api,
      item,
      startTimeTicks: 0,
      userId: user?.Id,
      audioStreamIndex: selectedAudioStream,
      maxStreamingBitrate: maxBitrate.value,
      mediaSourceId: selectedMediaSource.Id,
      subtitleStreamIndex: selectedSubtitleStream,
      deviceProfile: download,
    });

    if (!res) {
      Alert.alert(
        "Something went wrong",
        "Could not get stream url from Jellyfin"
      );
      return;
    }

    const { mediaSource, url } = res;

    if (!url || !mediaSource) throw new Error("No url");

    saveDownloadItemInfoToDiskTmp(item, mediaSource, url);

    if (settings?.downloadMethod === "optimized") {
      return await startBackgroundDownload(url, item, mediaSource);
    } else {
      return await startRemuxing(item, url, mediaSource);
    }
  }, [
    api,
    item,
    startBackgroundDownload,
    user?.Id,
    selectedMediaSource,
    selectedAudioStream,
    selectedSubtitleStream,
    maxBitrate,
    settings?.downloadMethod,
  ]);

  /**
   * Check if item is downloaded
   */
  const { downloadedFiles } = useDownload();

  const isDownloaded = useMemo(() => {
    if (!downloadedFiles) return false;

    return downloadedFiles.some((file) => file.item.Id === item.Id);
  }, [downloadedFiles, item.Id]);

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

  const process = useMemo(() => {
    if (!processes) return null;

    return processes.find((process) => process?.item?.Id === item.Id);
  }, [processes, item.Id]);

  return (
    <View
      className="bg-neutral-800/80 rounded-full h-10 w-10 flex items-center justify-center"
      {...props}
    >
      {process && process?.item.Id === item.Id ? (
        <TouchableOpacity
          onPress={() => {
            router.push("/downloads");
          }}
        >
          {process.progress === 0 ? (
            <Loader />
          ) : (
            <View className="-rotate-45">
              <ProgressCircle
                size={24}
                fill={process.progress}
                width={4}
                tintColor="#9334E9"
                backgroundColor="#bdc3c7"
              />
            </View>
          )}
        </TouchableOpacity>
      ) : queue.some((i) => i.id === item.Id) ? (
        <TouchableOpacity
          onPress={() => {
            router.push("/downloads");
          }}
        >
          <Ionicons name="hourglass" size={24} color="white" />
        </TouchableOpacity>
      ) : isDownloaded ? (
        <TouchableOpacity
          onPress={() => {
            router.push(
              item.Type !== "Episode"
                ? "/downloads"
                : {
                  pathname: `/downloads/${item.SeriesId}`,
                  params: {
                    episodeSeasonIndex: item.ParentIndexNumber
                }
              } as Href
            );
          }}
        >
          <Ionicons name="cloud-download" size={26} color="#9333ea" />
        </TouchableOpacity>
      ) : (
        <TouchableOpacity onPress={handlePresentModalPress}>
          <Ionicons name="cloud-download-outline" size={24} color="white" />
        </TouchableOpacity>
      )}
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
            <Text className="font-bold text-2xl text-neutral-10">
              Download options
            </Text>
            <View className="flex flex-col space-y-2 w-full items-start">
              <BitrateSelector
                inverted
                onChange={(val) => setMaxBitrate(val)}
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
              onPress={() => {
                if (userCanDownload === true) {
                  if (!item.Id) {
                    throw new Error("No item id");
                  }
                  closeModal();
                  if (settings?.downloadMethod === "remux") {
                    queueActions.enqueue(queue, setQueue, {
                      id: item.Id,
                      execute: async () => {
                        await initiateDownload();
                      },
                      item,
                    });
                  } else {
                    initiateDownload();
                  }
                } else {
                  toast.error("You are not allowed to download files.");
                }
              }}
              color="purple"
            >
              Download
            </Button>
            <View className="opacity-70 text-center w-full flex items-center">
              {settings?.downloadMethod === "optimized" ? (
                <Text className="text-xs">Using optimized server</Text>
              ) : (
                <Text className="text-xs">Using default method</Text>
              )}
            </View>
          </View>
        </BottomSheetView>
      </BottomSheetModal>
    </View>
  );
};

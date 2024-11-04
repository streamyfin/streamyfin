import { useRemuxHlsToMp4 } from "@/hooks/useRemuxHlsToMp4";
import { useDownload } from "@/providers/DownloadProvider";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { queueActions, queueAtom } from "@/utils/atoms/queue";
import { useSettings } from "@/utils/atoms/settings";
import ios from "@/utils/profiles/ios";
import native from "@/utils/profiles/native";
import old from "@/utils/profiles/old";
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
import { router, useFocusEffect } from "expo-router";
import { useAtom } from "jotai";
import { useCallback, useMemo, useRef, useState } from "react";
import { Alert, TouchableOpacity, View, ViewProps } from "react-native";
import { AudioTrackSelector } from "./AudioTrackSelector";
import { Bitrate, BITRATES, BitrateSelector } from "./BitrateSelector";
import { Button } from "./Button";
import { Text } from "./common/Text";
import { Loader } from "./Loader";
import { MediaSourceSelector } from "./MediaSourceSelector";
import ProgressCircle from "./ProgressCircle";
import { SubtitleTrackSelector } from "./SubtitleTrackSelector";
import { toast } from "sonner-native";
import iosFmp4 from "@/utils/profiles/iosFmp4";
import { getDefaultPlaySettings } from "@/utils/jellyfin/getDefaultPlaySettings";

interface DownloadProps extends ViewProps {
  item: BaseItemDto;
}

export const DownloadItem: React.FC<DownloadProps> = ({ item, ...props }) => {
  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);
  const [queue, setQueue] = useAtom(queueAtom);
  const [settings] = useSettings();
  const { processes, startBackgroundDownload } = useDownload();
  const { startRemuxing } = useRemuxHlsToMp4(item);

  const [selectedMediaSource, setSelectedMediaSource] = useState<
    MediaSourceInfo | undefined
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

    let deviceProfile: any = iosFmp4;

    if (settings?.deviceProfile === "Native") {
      deviceProfile = native;
    } else if (settings?.deviceProfile === "Old") {
      deviceProfile = old;
    }

    const response = await api.axiosInstance.post(
      `${api.basePath}/Items/${item.Id}/PlaybackInfo`,
      {
        DeviceProfile: deviceProfile,
        UserId: user.Id,
        MaxStreamingBitrate: maxBitrate.value,
        StartTimeTicks: 0,
        EnableTranscoding: maxBitrate.value ? true : undefined,
        AutoOpenLiveStream: true,
        AllowVideoStreamCopy: maxBitrate.value ? false : true,
        MediaSourceId: selectedMediaSource?.Id,
        AudioStreamIndex: selectedAudioStream,
        SubtitleStreamIndex: selectedSubtitleStream,
      },
      {
        headers: {
          Authorization: `MediaBrowser DeviceId="${api.deviceInfo.id}", Token="${api.accessToken}"`,
        },
      }
    );

    let url: string | undefined = undefined;
    let fileExtension: string | undefined | null = "mp4";

    const mediaSource: MediaSourceInfo = response.data.MediaSources.find(
      (source: MediaSourceInfo) => source.Id === selectedMediaSource?.Id
    );

    if (!mediaSource) {
      throw new Error("No media source");
    }

    if (mediaSource.SupportsDirectPlay) {
      if (item.MediaType === "Video") {
        url = `${api.basePath}/Videos/${item.Id}/stream.mp4?mediaSourceId=${item.Id}&static=true&mediaSourceId=${mediaSource.Id}&deviceId=${api.deviceInfo.id}&api_key=${api.accessToken}`;
      } else if (item.MediaType === "Audio") {
        console.log("Using direct stream for audio!");
        const searchParams = new URLSearchParams({
          UserId: user.Id,
          DeviceId: api.deviceInfo.id,
          MaxStreamingBitrate: "140000000",
          Container:
            "opus,webm|opus,mp3,aac,m4a|aac,m4b|aac,flac,webma,webm|webma,wav,ogg",
          TranscodingContainer: "mp4",
          TranscodingProtocol: "hls",
          AudioCodec: "aac",
          api_key: api.accessToken,
          StartTimeTicks: "0",
          EnableRedirection: "true",
          EnableRemoteMedia: "false",
        });
        url = `${api.basePath}/Audio/${
          item.Id
        }/universal?${searchParams.toString()}`;
      }
    } else if (mediaSource.TranscodingUrl) {
      url = `${api.basePath}${mediaSource.TranscodingUrl}`;
      fileExtension = mediaSource.TranscodingContainer;
    }

    if (!url) throw new Error("No url");
    if (!fileExtension) throw new Error("No file extension");

    if (settings?.downloadMethod === "optimized") {
      return await startBackgroundDownload(url, item, fileExtension);
    } else {
      return await startRemuxing(url);
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

    return downloadedFiles.some((file) => file.Id === item.Id);
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
            router.push("/downloads");
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

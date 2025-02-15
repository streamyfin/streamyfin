import { BITRATES } from "@/components/BitrateSelector";
import { Text } from "@/components/common/Text";
import { Loader } from "@/components/Loader";
import { Controls } from "@/components/video-player/controls/Controls";
import { getDownloadedFileUrl } from "@/hooks/useDownloadedFileOpener";
import { useInvalidatePlaybackProgressCache } from "@/hooks/useRevalidatePlaybackProgressCache";
import { useWebSocket } from "@/hooks/useWebsockets";
import { VlcPlayerView } from "@/modules/vlc-player";
import {
  PipStartedPayload,
  PlaybackStatePayload,
  ProgressUpdatePayload,
  VlcPlayerViewRef,
} from "@/modules/vlc-player/src/VlcPlayer.types";
// import { useDownload } from "@/providers/DownloadProvider";
const downloadProvider = !Platform.isTV
  ? require("@/providers/DownloadProvider")
  : null;
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { getStreamUrl } from "@/utils/jellyfin/media/getStreamUrl";
import { writeToLog } from "@/utils/log";
import native from "@/utils/profiles/native";
import { msToTicks, ticksToSeconds } from "@/utils/time";
import {
  getPlaystateApi,
  getUserLibraryApi,
} from "@jellyfin/sdk/lib/utils/api";
import { useQuery } from "@tanstack/react-query";
import { useHaptic } from "@/hooks/useHaptic";
import { useGlobalSearchParams, useNavigation } from "expo-router";
import { useAtomValue } from "jotai";
import React, {
  useCallback,
  useMemo,
  useRef,
  useState,
  useEffect,
} from "react";
import { Alert, View, AppState, AppStateStatus, Platform } from "react-native";
import { useSharedValue } from "react-native-reanimated";
import { useSettings } from "@/utils/atoms/settings";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MediaSourceInfo } from "@jellyfin/sdk/lib/generated-client";

export default function page() {
  console.log("Direct Player");
  const videoRef = useRef<VlcPlayerViewRef>(null);
  const user = useAtomValue(userAtom);
  const api = useAtomValue(apiAtom);
  const { t } = useTranslation();
  const navigation = useNavigation();

  const [isPlaybackStopped, setIsPlaybackStopped] = useState(false);
  const [showControls, _setShowControls] = useState(true);
  const [ignoreSafeAreas, setIgnoreSafeAreas] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(true);
  const [isVideoLoaded, setIsVideoLoaded] = useState(false);
  const [isPipStarted, setIsPipStarted] = useState(false);

  const progress = useSharedValue(0);
  const isSeeking = useSharedValue(false);
  const cacheProgress = useSharedValue(0);
  let getDownloadedItem = null;
  if (!Platform.isTV) {
    getDownloadedItem = downloadProvider.useDownload();
  }

  const revalidateProgressCache = useInvalidatePlaybackProgressCache();

  const lightHapticFeedback = useHaptic("light");

  const setShowControls = useCallback((show: boolean) => {
    _setShowControls(show);
    lightHapticFeedback();
  }, []);

  const {
    itemId,
    audioIndex: audioIndexStr,
    subtitleIndex: subtitleIndexStr,
    mediaSourceId,
    bitrateValue: bitrateValueStr,
    offline: offlineStr,
  } = useGlobalSearchParams<{
    itemId: string;
    audioIndex: string;
    subtitleIndex: string;
    mediaSourceId: string;
    bitrateValue: string;
    offline: string;
  }>();
  const [settings] = useSettings();
  const offline = offlineStr === "true";

  const audioIndex = audioIndexStr ? parseInt(audioIndexStr, 10) : undefined;
  const subtitleIndex = subtitleIndexStr ? parseInt(subtitleIndexStr, 10) : -1;
  const bitrateValue = bitrateValueStr
    ? parseInt(bitrateValueStr, 10)
    : BITRATES[0].value;

  const {
    data: item,
    isLoading: isLoadingItem,
    isError: isErrorItem,
  } = useQuery({
    queryKey: ["item", itemId],
    queryFn: async () => {
      if (offline && !Platform.isTV) {
        const item = await getDownloadedItem.getDownloadedItem(itemId);
        if (item) return item.item;
      }

      const res = await getUserLibraryApi(api!).getItem({
        itemId,
        userId: user?.Id,
      });

      return res.data;
    },
    enabled: !!itemId,
    staleTime: 0,
  });

  const [stream, setStream] = useState<{
    mediaSource: MediaSourceInfo;
    url: string;
    sessionId: string | undefined;
  } | null>(null);
  const [isLoadingStream, setIsLoadingStream] = useState(true);
  const [isErrorStream, setIsErrorStream] = useState(false);

  useEffect(() => {
    const fetchStream = async () => {
      setIsLoadingStream(true);
      setIsErrorStream(false);

      try {
        if (offline && !Platform.isTV) {
          const data = await getDownloadedItem.getDownloadedItem(itemId);
          if (!data?.mediaSource) {
            setStream(null);
            return;
          }

          const url = await getDownloadedFileUrl(data.item.Id!);

          if (item) {
            setStream({
              mediaSource: data.mediaSource as MediaSourceInfo,
              url,
              sessionId: undefined,
            });
            return;
          }
        }

        const res = await getStreamUrl({
          api,
          item,
          startTimeTicks: item?.UserData?.PlaybackPositionTicks!,
          userId: user?.Id,
          audioStreamIndex: audioIndex,
          maxStreamingBitrate: bitrateValue,
          mediaSourceId: mediaSourceId,
          subtitleStreamIndex: subtitleIndex,
          deviceProfile: native,
        });

        if (!res) {
          setStream(null);
          return;
        }

        const { mediaSource, sessionId, url } = res;

        if (!sessionId || !mediaSource || !url) {
          Alert.alert(t("player.error"), t("player.failed_to_get_stream_url"));
          setStream(null);
          return;
        }

        setStream({
          mediaSource,
          sessionId,
          url,
        });
      } catch (error) {
        console.error("Error fetching stream:", error);
        setIsErrorStream(true);
        setStream(null);
      } finally {
        setIsLoadingStream(false);
      }
    };

    fetchStream();
  }, [itemId, mediaSourceId]);

  const togglePlay = useCallback(async () => {
    if (!api) return;

    lightHapticFeedback();
    if (isPlaying) {
      await videoRef.current?.pause();
    } else {
      videoRef.current?.play();
    }

    if (!offline && stream) {
      await getPlaystateApi(api).onPlaybackProgress({
        itemId: item?.Id!,
        audioStreamIndex: audioIndex ? audioIndex : undefined,
        subtitleStreamIndex: subtitleIndex ? subtitleIndex : undefined,
        mediaSourceId: mediaSourceId,
        positionTicks: msToTicks(progress.get()),
        isPaused: !isPlaying,
        playMethod: stream?.url.includes("m3u8") ? "Transcode" : "DirectStream",
        playSessionId: stream.sessionId,
      });
    }
  }, [
    isPlaying,
    api,
    item,
    stream,
    videoRef,
    audioIndex,
    subtitleIndex,
    mediaSourceId,
    offline,
    progress,
  ]);

  const reportPlaybackStopped = useCallback(async () => {
    if (offline) return;

    const currentTimeInTicks = msToTicks(progress.get());

    await getPlaystateApi(api!).onPlaybackStopped({
      itemId: item?.Id!,
      mediaSourceId: mediaSourceId,
      positionTicks: currentTimeInTicks,
      playSessionId: stream?.sessionId!,
    });

    revalidateProgressCache();
  }, [api, item, mediaSourceId, stream]);

  const stop = useCallback(() => {
    reportPlaybackStopped();
    setIsPlaybackStopped(true);
    videoRef.current?.stop();
  }, [videoRef, reportPlaybackStopped]);

  const onProgress = useCallback(
    async (data: ProgressUpdatePayload) => {
      if (isSeeking.get() || isPlaybackStopped) return;

      const { currentTime } = data.nativeEvent;

      if (isBuffering) {
        setIsBuffering(false);
      }

      progress.set(currentTime);

      if (offline) return;

      const currentTimeInTicks = msToTicks(currentTime);

      if (!item?.Id || !stream) return;

      await getPlaystateApi(api!).onPlaybackProgress({
        itemId: item.Id,
        audioStreamIndex: audioIndex ? audioIndex : undefined,
        subtitleStreamIndex: subtitleIndex ? subtitleIndex : undefined,
        mediaSourceId: mediaSourceId,
        positionTicks: Math.floor(currentTimeInTicks),
        isPaused: !isPlaying,
        playMethod: stream?.url.includes("m3u8") ? "Transcode" : "DirectStream",
        playSessionId: stream.sessionId,
      });
    },
    [item?.Id, isSeeking, api, isPlaybackStopped, audioIndex, subtitleIndex]
  );

  useWebSocket({
    isPlaying: isPlaying,
    togglePlay: togglePlay,
    stopPlayback: stop,
    offline,
  });

  const onPipStarted = useCallback((e: PipStartedPayload) => {
    const { pipStarted } = e.nativeEvent;
    setIsPipStarted(pipStarted);
  }, []);

  const onPlaybackStateChanged = useCallback((e: PlaybackStatePayload) => {
    const { state, isBuffering, isPlaying } = e.nativeEvent;

    if (state === "Playing") {
      setIsPlaying(true);
      return;
    }

    if (state === "Paused") {
      setIsPlaying(false);
      return;
    }

    if (isPlaying) {
      setIsPlaying(true);
      setIsBuffering(false);
    } else if (isBuffering) {
      setIsBuffering(true);
    }
  }, []);

  const startPosition = useMemo(() => {
    if (offline) return 0;

    return item?.UserData?.PlaybackPositionTicks
      ? ticksToSeconds(item.UserData.PlaybackPositionTicks)
      : 0;
  }, [item]);

  const [appState, setAppState] = useState(AppState.currentState);

  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      // Handle app going to the background
      if (nextAppState.match(/inactive|background/)) {
        _setShowControls(false);
      }
      setAppState(nextAppState);
    };

    // Use AppState.addEventListener and return a cleanup function
    const subscription = AppState.addEventListener(
      "change",
      handleAppStateChange
    );

    return () => {
      // Cleanup the event listener when the component is unmounted
      subscription.remove();
    };
  }, [appState, isPipStarted, isPlaying]);

  // Preselection of audio and subtitle tracks.
  if (!settings) return null;
  let initOptions = [`--sub-text-scale=${settings.subtitleSize}`];

  const allAudio =
    stream?.mediaSource.MediaStreams?.filter(
      (audio) => audio.Type === "Audio"
    ) || [];
  const allSubs =
    stream?.mediaSource.MediaStreams?.filter(
      (sub) => sub.Type === "Subtitle"
    ) || [];
  const textSubs = allSubs.filter((sub) => sub.IsTextSubtitleStream);

  const chosenSubtitleTrack = allSubs.find(
    (sub) => sub.Index === subtitleIndex
  );
  const chosenAudioTrack = allAudio.find((audio) => audio.Index === audioIndex);

  const notTranscoding = !stream?.mediaSource.TranscodingUrl;
  if (
    chosenSubtitleTrack &&
    (notTranscoding || chosenSubtitleTrack.IsTextSubtitleStream)
  ) {
    const finalIndex = notTranscoding
      ? allSubs.indexOf(chosenSubtitleTrack)
      : textSubs.indexOf(chosenSubtitleTrack);
    initOptions.push(`--sub-track=${finalIndex}`);
  }

  if (notTranscoding && chosenAudioTrack) {
    initOptions.push(`--audio-track=${allAudio.indexOf(chosenAudioTrack)}`);
  }

  const insets = useSafeAreaInsets();

  if (!item || isLoadingItem || isLoadingStream)
    useEffect(() => {
      const beforeRemoveListener = navigation.addListener("beforeRemove", stop);
      return () => {
        beforeRemoveListener();
      };
    }, [navigation]);

  if (!item || isLoadingItem || !stream)
    return (
      <View className="w-screen h-screen flex flex-col items-center justify-center bg-black">
        <Loader />
      </View>
    );

  if (isErrorItem || isErrorStream)
    return (
      <View className="w-screen h-screen flex flex-col items-center justify-center bg-black">
        <Text className="text-white">{t("player.error")}</Text>
      </View>
    );

  const externalSubtitles = allSubs
    .filter((sub: any) => sub.DeliveryMethod === "External")
    .map((sub: any) => ({
      name: sub.DisplayTitle,
      DeliveryUrl: api?.basePath + sub.DeliveryUrl,
    }));

  return (
    <View style={{ flex: 1, backgroundColor: "black" }}>
      <View
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          position: "relative",
          flexDirection: "column",
          justifyContent: "center",
          paddingLeft: ignoreSafeAreas ? 0 : insets.left,
          paddingRight: ignoreSafeAreas ? 0 : insets.right,
        }}
      >
        <VlcPlayerView
          ref={videoRef}
          source={{
            uri: stream?.url || "",
            autoplay: true,
            isNetwork: true,
            startPosition,
            externalSubtitles,
            initOptions,
          }}
          style={{ width: "100%", height: "100%" }}
          onVideoProgress={onProgress}
          progressUpdateInterval={1000}
          onVideoStateChange={onPlaybackStateChanged}
          onPipStarted={onPipStarted}
          onVideoLoadStart={() => {}}
          onVideoLoadEnd={() => {
            setIsVideoLoaded(true);
          }}
          onVideoError={(e) => {
            console.error("Video Error:", e.nativeEvent);
            Alert.alert(
              t("player.error"),
              t("player.an_error_occured_while_playing_the_video")
            );
            writeToLog("ERROR", "Video Error", e.nativeEvent);
          }}
        />
      </View>
      {videoRef.current && (
        <Controls
          mediaSource={stream?.mediaSource}
          item={item}
          videoRef={videoRef}
          togglePlay={togglePlay}
          isPlaying={isPlaying}
          isSeeking={isSeeking}
          progress={progress}
          cacheProgress={cacheProgress}
          isBuffering={isBuffering}
          showControls={showControls}
          setShowControls={setShowControls}
          setIgnoreSafeAreas={setIgnoreSafeAreas}
          ignoreSafeAreas={ignoreSafeAreas}
          isVideoLoaded={isVideoLoaded}
          startPictureInPicture={videoRef?.current?.startPictureInPicture}
          play={videoRef.current?.play}
          pause={videoRef.current?.pause}
          seek={videoRef.current?.seekTo}
          enableTrickplay={true}
          getAudioTracks={videoRef.current?.getAudioTracks}
          getSubtitleTracks={videoRef.current?.getSubtitleTracks}
          offline={offline}
          setSubtitleTrack={videoRef.current.setSubtitleTrack}
          setSubtitleURL={videoRef.current.setSubtitleURL}
          setAudioTrack={videoRef.current.setAudioTrack}
          stop={stop}
          isVlc
        />
      )}
    </View>
  );
}

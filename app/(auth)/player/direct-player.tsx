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
const downloadProvider = !Platform.isTV ? require("@/providers/DownloadProvider") : null;
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { getStreamUrl } from "@/utils/jellyfin/media/getStreamUrl";
import { writeToLog } from "@/utils/log";
import native from "@/utils/profiles/native";
import { msToTicks, ticksToSeconds } from "@/utils/time";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { getPlaystateApi, getUserLibraryApi } from "@jellyfin/sdk/lib/utils/api";
import { useHaptic } from "@/hooks/useHaptic";
import { useGlobalSearchParams, useNavigation } from "expo-router";
import { useAtomValue } from "jotai";
import React, { useCallback, useMemo, useRef, useState, useEffect } from "react";
import { Alert, View, Platform } from "react-native";
import { useSharedValue } from "react-native-reanimated";
import { useSettings } from "@/utils/atoms/settings";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  BaseItemDto,
  MediaSourceInfo,
  PlaybackProgressInfo,
  PlaybackStartInfo,
} from "@jellyfin/sdk/lib/generated-client";

export default function page() {
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
  const insets = useSafeAreaInsets();
  const offline = offlineStr === "true";

  const audioIndex = audioIndexStr ? parseInt(audioIndexStr, 10) : undefined;
  const subtitleIndex = subtitleIndexStr ? parseInt(subtitleIndexStr, 10) : -1;
  const bitrateValue = bitrateValueStr ? parseInt(bitrateValueStr, 10) : BITRATES[0].value;

  const [item, setItem] = useState<BaseItemDto | null>(null);
  const [itemStatus, setItemStatus] = useState({
    isLoading: true,
    isError: false,
  });

  useEffect(() => {
    const fetchItemData = async () => {
      setItemStatus({ isLoading: true, isError: false });
      try {
        let fetchedItem: BaseItemDto | null = null;
        if (offline && !Platform.isTV) {
          const data = await getDownloadedItem.getDownloadedItem(itemId);
          if (data) fetchedItem = data.item as BaseItemDto;
        } else {
          const res = await getUserLibraryApi(api!).getItem({
            itemId,
            userId: user?.Id,
          });
          fetchedItem = res.data;
        }
        setItem(fetchedItem);
      } catch (error) {
        console.error("Failed to fetch item:", error);
        setItemStatus({ isLoading: false, isError: true });
      } finally {
        setItemStatus({ isLoading: false, isError: false });
      }
    };

    if (itemId) {
      fetchItemData();
    }
  }, [itemId, offline, api, user?.Id]);

  interface Stream {
    mediaSource: MediaSourceInfo;
    sessionId: string;
    url: string;
  }

  const [stream, setStream] = useState<Stream | null>(null);
  const [streamStatus, setStreamStatus] = useState({
    isLoading: true,
    isError: false,
  });

  useEffect(() => {
    const fetchStreamData = async () => {
      try {
        let result: Stream | null = null;
        if (offline && !Platform.isTV) {
          const data = await getDownloadedItem.getDownloadedItem(itemId);
          if (!data?.mediaSource) return;
          const url = await getDownloadedFileUrl(data.item.Id!);
          if (item) {
            result = { mediaSource: data.mediaSource, sessionId: "", url };
          }
        } else {
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
          if (!res) return;
          const { mediaSource, sessionId, url } = res;
          if (!sessionId || !mediaSource || !url) {
            Alert.alert(t("player.error"), t("player.failed_to_get_stream_url"));
            return;
          }
          result = { mediaSource, sessionId, url };
        }
        setStream(result);
      } catch (error) {
        console.error("Failed to fetch stream:", error);
        setStreamStatus({ isLoading: false, isError: true });
      } finally {
        setStreamStatus({ isLoading: false, isError: false });
      }
    };
    fetchStreamData();
  }, [itemId, mediaSourceId, bitrateValue, api, item, user?.Id]);

  const togglePlay = async () => {
    lightHapticFeedback();
    setIsPlaying(!isPlaying);
    if (isPlaying) {
      await videoRef.current?.pause();
    } else {
      videoRef.current?.play();
    }
  }

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

  useEffect(() => {
    const beforeRemoveListener = navigation.addListener("beforeRemove", stop);
    return () => {
      beforeRemoveListener();
    };
  }, [navigation, stop]);

  const currentPlayStateInfo = () => {
    return {
      itemId: item?.Id!,
      audioStreamIndex: audioIndex ? audioIndex : undefined,
      subtitleStreamIndex: subtitleIndex ? subtitleIndex : undefined,
      mediaSourceId: mediaSourceId,
      positionTicks: msToTicks(progress.get()),
      isPaused: !isPlaying,
      playMethod: stream?.url.includes("m3u8") ? "Transcode" : "DirectStream",
      playSessionId: stream.sessionId,
    };
  };

  const onProgress = useCallback(
    async (data: ProgressUpdatePayload) => {
      if (isSeeking.get() || isPlaybackStopped) return;

      const { currentTime } = data.nativeEvent;
      if (isBuffering) {
        setIsBuffering(false);
      }

      progress.set(currentTime);

      if (offline) return;

      if (!item?.Id || !stream) return;

      reportPlaybackProgress();
    },
    [item?.Id, audioIndex, subtitleIndex, mediaSourceId, isPlaying, stream, isSeeking, isPlaybackStopped, isBuffering]
  );

  const onPipStarted = useCallback((e: PipStartedPayload) => {
    const { pipStarted } = e.nativeEvent;
    setIsPipStarted(pipStarted);
  }, []);

  const reportPlaybackProgress = useCallback(async () => {
    if (!api || offline || !stream) return;
    await getPlaystateApi(api).reportPlaybackProgress({
      playbackProgressInfo: currentPlayStateInfo() as PlaybackProgressInfo,
    });
  }, [api, isPlaying, offline, stream, item?.Id, audioIndex, subtitleIndex, mediaSourceId, progress]);

  const startPosition = useMemo(() => {
    if (offline) return 0;
    return item?.UserData?.PlaybackPositionTicks ? ticksToSeconds(item.UserData.PlaybackPositionTicks) : 0;
  }, [item]);

  const reportPlaybackStart = useCallback(async () => {
    if (offline || !stream) return;
    await getPlaystateApi(api!).reportPlaybackStart({ playbackStartInfo: currentPlayStateInfo() as PlaybackStartInfo });
    hasReportedRef.current = true;
  }, [api, item, stream]);

  const hasReportedRef = useRef(false);
  useEffect(() => {
    if (stream && !hasReportedRef.current) {
      reportPlaybackStart();
      hasReportedRef.current = true; // Mark as reported
    }
  }, [stream]);

  useWebSocket({
    isPlaying: isPlaying,
    togglePlay: togglePlay,
    stopPlayback: stop,
    offline,
  });

  const onPlaybackStateChanged = useCallback(
    async (e: PlaybackStatePayload) => {
      const { state, isBuffering, isPlaying } = e.nativeEvent;
      if (state === "Playing") {
        setIsPlaying(true);
        reportPlaybackProgress();
        if (!Platform.isTV) await activateKeepAwakeAsync();
        return;
      }

      if (state === "Paused") {
        setIsPlaying(false);
        reportPlaybackProgress();
        if (!Platform.isTV) await deactivateKeepAwake();
        return;
      }

      if (isPlaying) {
        setIsPlaying(true);
        setIsBuffering(false);
      } else if (isBuffering) {
        setIsBuffering(true);
      }
    },
    [reportPlaybackProgress]
  );

  const allAudio = stream?.mediaSource.MediaStreams?.filter((audio) => audio.Type === "Audio") || [];

  // Move all the external subtitles last, because vlc places them last.
  const allSubs =
    stream?.mediaSource.MediaStreams?.filter((sub) => sub.Type === "Subtitle").sort(
      (a, b) => Number(a.IsExternal) - Number(b.IsExternal)
    ) || [];

  const externalSubtitles = allSubs
    .filter((sub: any) => sub.DeliveryMethod === "External")
    .map((sub: any) => ({
      name: sub.DisplayTitle,
      DeliveryUrl: api?.basePath + sub.DeliveryUrl,
    }));

  const textSubs = allSubs.filter((sub) => sub.IsTextSubtitleStream);

  const chosenSubtitleTrack = allSubs.find((sub) => sub.Index === subtitleIndex);
  const chosenAudioTrack = allAudio.find((audio) => audio.Index === audioIndex);

  const notTranscoding = !stream?.mediaSource.TranscodingUrl;
  let initOptions = [`--sub-text-scale=${settings.subtitleSize}`];
  if (chosenSubtitleTrack && (notTranscoding || chosenSubtitleTrack.IsTextSubtitleStream)) {
    const finalIndex = notTranscoding ? allSubs.indexOf(chosenSubtitleTrack) : textSubs.indexOf(chosenSubtitleTrack);
    initOptions.push(`--sub-track=${finalIndex}`);
  }

  if (notTranscoding && chosenAudioTrack) {
    initOptions.push(`--audio-track=${allAudio.indexOf(chosenAudioTrack)}`);
  }

  const [isMounted, setIsMounted] = useState(false);

  // Add useEffect to handle mounting
  useEffect(() => {
    setIsMounted(true);
    return () => setIsMounted(false);
  }, []);

  if (itemStatus.isLoading || streamStatus.isLoading) {
    return (
      <View className="w-screen h-screen flex flex-col items-center justify-center bg-black">
        <Loader />
      </View>
    );
  }

  if (!item || !stream || itemStatus.isError || streamStatus.isError)
    return (
      <View className="w-screen h-screen flex flex-col items-center justify-center bg-black">
        <Text className="text-white">{t("player.error")}</Text>
      </View>
    );

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
          onVideoLoadEnd={() => {
            setIsVideoLoaded(true);
          }}
          onVideoError={(e) => {
            console.error("Video Error:", e.nativeEvent);
            Alert.alert(t("player.error"), t("player.an_error_occured_while_playing_the_video"));
            writeToLog("ERROR", "Video Error", e.nativeEvent);
          }}
        />
      </View>
      {videoRef.current && !isPipStarted && isMounted === true ? (
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
          isVlc
        />
      ) : null}
    </View>
  );
}

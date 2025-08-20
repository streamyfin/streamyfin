import {
  type BaseItemDto,
  type MediaSourceInfo,
  PlaybackOrder,
  PlaybackStartInfo,
  RepeatMode,
} from "@jellyfin/sdk/lib/generated-client";
import {
  getPlaystateApi,
  getUserLibraryApi,
} from "@jellyfin/sdk/lib/utils/api";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { router, useGlobalSearchParams, useNavigation } from "expo-router";
import { useAtomValue } from "jotai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Platform, View } from "react-native";
import { useAnimatedReaction, useSharedValue } from "react-native-reanimated";

import { BITRATES } from "@/components/BitrateSelector";
import { Text } from "@/components/common/Text";
import { Loader } from "@/components/Loader";
import { Controls } from "@/components/video-player/controls/Controls";
import { useHaptic } from "@/hooks/useHaptic";
import { usePlaybackManager } from "@/hooks/usePlaybackManager";
import { useInvalidatePlaybackProgressCache } from "@/hooks/useRevalidatePlaybackProgressCache";
import { useWebSocket } from "@/hooks/useWebsockets";
import { VlcPlayerView } from "@/modules";
import type {
  PipStartedPayload,
  PlaybackStatePayload,
  ProgressUpdatePayload,
  VlcPlayerViewRef,
} from "@/modules/VlcPlayer.types";
import { useDownload } from "@/providers/DownloadProvider";
import { DownloadedItem } from "@/providers/Downloads/types";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { useSettings } from "@/utils/atoms/settings";
import { getStreamUrl } from "@/utils/jellyfin/media/getStreamUrl";
import { writeToLog } from "@/utils/log";
import { generateDeviceProfile } from "@/utils/profiles/native";
import { msToTicks, ticksToSeconds } from "@/utils/time";

export default function page() {
  const videoRef = useRef<VlcPlayerViewRef>(null);
  const user = useAtomValue(userAtom);
  const api = useAtomValue(apiAtom);
  const { t } = useTranslation();
  const navigation = useNavigation();

  const [isPlaybackStopped, setIsPlaybackStopped] = useState(false);
  const [showControls, _setShowControls] = useState(true);
  const [aspectRatio, setAspectRatio] = useState<
    "default" | "16:9" | "4:3" | "1:1" | "21:9"
  >("default");
  const [scaleFactor, setScaleFactor] = useState<
    1.0 | 1.1 | 1.2 | 1.3 | 1.4 | 1.5 | 1.6 | 1.7 | 1.8 | 1.9 | 2.0
  >(1.0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isBuffering, setIsBuffering] = useState(true);
  const [isVideoLoaded, setIsVideoLoaded] = useState(false);
  const [isPipStarted, setIsPipStarted] = useState(false);

  const progress = useSharedValue(0);
  const isSeeking = useSharedValue(false);
  const cacheProgress = useSharedValue(0);
  const VolumeManager = Platform.isTV
    ? null
    : require("react-native-volume-manager");

  const downloadUtils = useDownload();

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
    playbackPosition: playbackPositionFromUrl,
  } = useGlobalSearchParams<{
    itemId: string;
    audioIndex: string;
    subtitleIndex: string;
    mediaSourceId: string;
    bitrateValue: string;
    offline: string;
    /** Playback position in ticks. */
    playbackPosition?: string;
  }>();
  const [_settings] = useSettings();

  const offline = offlineStr === "true";
  const playbackManager = usePlaybackManager();

  const audioIndex = audioIndexStr
    ? Number.parseInt(audioIndexStr, 10)
    : undefined;
  const subtitleIndex = subtitleIndexStr
    ? Number.parseInt(subtitleIndexStr, 10)
    : -1;
  const bitrateValue = bitrateValueStr
    ? Number.parseInt(bitrateValueStr, 10)
    : BITRATES[0].value;

  const [item, setItem] = useState<BaseItemDto | null>(null);
  const [downloadedItem, setDownloadedItem] = useState<DownloadedItem | null>(
    null,
  );
  const [itemStatus, setItemStatus] = useState({
    isLoading: true,
    isError: false,
  });

  /** Gets the initial playback position from the URL. */
  const getInitialPlaybackTicks = useCallback((): number => {
    if (playbackPositionFromUrl) {
      return Number.parseInt(playbackPositionFromUrl, 10);
    }
    return item?.UserData?.PlaybackPositionTicks ?? 0;
  }, [playbackPositionFromUrl]);

  useEffect(() => {
    const fetchItemData = async () => {
      setItemStatus({ isLoading: true, isError: false });
      try {
        let fetchedItem: BaseItemDto | null = null;
        if (offline && !Platform.isTV) {
          const data = downloadUtils.getDownloadedItemById(itemId);
          if (data) {
            fetchedItem = data.item as BaseItemDto;
            setDownloadedItem(data);
          }
        } else {
          const res = await getUserLibraryApi(api!).getItem({
            itemId,
            userId: user?.Id,
          });
          fetchedItem = res.data;
        }
        setItem(fetchedItem);
        setItemStatus({ isLoading: false, isError: false });
      } catch (error) {
        console.error("Failed to fetch item:", error);
        setItemStatus({ isLoading: false, isError: true });
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
      setStreamStatus({ isLoading: true, isError: false });
      try {
        let result: Stream | null = null;
        if (offline && downloadedItem && downloadedItem.mediaSource) {
          const url = downloadedItem.videoFilePath;
          if (item) {
            result = {
              mediaSource: downloadedItem.mediaSource,
              sessionId: "",
              url: url,
            };
          }
        } else {
          const native = generateDeviceProfile();
          const transcoding = generateDeviceProfile({ transcode: true });
          const res = await getStreamUrl({
            api,
            item,
            startTimeTicks: getInitialPlaybackTicks(),
            userId: user?.Id,
            audioStreamIndex: audioIndex,
            maxStreamingBitrate: bitrateValue,
            mediaSourceId: mediaSourceId,
            subtitleStreamIndex: subtitleIndex,
            deviceProfile: bitrateValue ? transcoding : native,
          });
          if (!res) return;
          const { mediaSource, sessionId, url } = res;
          if (!sessionId || !mediaSource || !url) {
            Alert.alert(
              t("player.error"),
              t("player.failed_to_get_stream_url"),
            );
            return;
          }
          result = { mediaSource, sessionId, url };
        }
        setStream(result);
        setStreamStatus({ isLoading: false, isError: false });
      } catch (error) {
        console.error("Failed to fetch stream:", error);
        setStreamStatus({ isLoading: false, isError: true });
      }
    };
    fetchStreamData();
  }, [
    itemId,
    mediaSourceId,
    bitrateValue,
    api,
    item,
    user?.Id,
    downloadedItem,
  ]);

  useEffect(() => {
    if (!stream || !api) return;
    const reportPlaybackStart = async () => {
      await getPlaystateApi(api).reportPlaybackStart({
        playbackStartInfo: currentPlayStateInfo() as PlaybackStartInfo,
      });
    };
    reportPlaybackStart();
  }, [stream, api]);

  const togglePlay = async () => {
    lightHapticFeedback();
    setIsPlaying(!isPlaying);
    if (isPlaying) {
      await videoRef.current?.pause();
      playbackManager.reportPlaybackProgress(
        item?.Id!,
        msToTicks(progress.get()),
        {
          AudioStreamIndex: audioIndex ?? -1,
          SubtitleStreamIndex: subtitleIndex ?? -1,
        },
      );
    } else {
      videoRef.current?.play();
      await getPlaystateApi(api!).reportPlaybackStart({
        playbackStartInfo: currentPlayStateInfo() as PlaybackStartInfo,
      });
    }
  };

  const reportPlaybackStopped = useCallback(async () => {
    const currentTimeInTicks = msToTicks(progress.get());
    await getPlaystateApi(api!).onPlaybackStopped({
      itemId: item?.Id!,
      mediaSourceId: mediaSourceId,
      positionTicks: currentTimeInTicks,
      playSessionId: stream?.sessionId!,
    });
  }, [
    api,
    item,
    mediaSourceId,
    stream,
    progress,
    offline,
    revalidateProgressCache,
  ]);

  const stop = useCallback(() => {
    // Update URL with final playback position before stopping
    router.setParams({
      playbackPosition: msToTicks(progress.get()).toString(),
    });
    reportPlaybackStopped();
    setIsPlaybackStopped(true);
    videoRef.current?.stop();
    revalidateProgressCache();
  }, [videoRef, reportPlaybackStopped, progress]);

  useEffect(() => {
    const beforeRemoveListener = navigation.addListener("beforeRemove", stop);
    return () => {
      beforeRemoveListener();
    };
  }, [navigation, stop]);

  const currentPlayStateInfo = useCallback(() => {
    if (!stream) return;
    return {
      itemId: item?.Id!,
      audioStreamIndex: audioIndex ? audioIndex : undefined,
      subtitleStreamIndex: subtitleIndex ? subtitleIndex : undefined,
      mediaSourceId: mediaSourceId,
      positionTicks: msToTicks(progress.get()),
      isPaused: !isPlaying,
      playMethod: stream?.url.includes("m3u8") ? "Transcode" : "DirectStream",
      playSessionId: stream.sessionId,
      isMuted: isMuted,
      canSeek: true,
      repeatMode: RepeatMode.RepeatNone,
      playbackOrder: PlaybackOrder.Default,
    };
  }, [
    stream,
    item?.Id,
    audioIndex,
    subtitleIndex,
    mediaSourceId,
    progress,
    isPlaying,
    isMuted,
  ]);

  const lastUrlUpdateTime = useSharedValue(0);
  const wasJustSeeking = useSharedValue(false);
  const URL_UPDATE_INTERVAL = 30000; // Update URL every 30 seconds instead of every second

  // Track when seeking ends to update URL immediately
  useAnimatedReaction(
    () => isSeeking.get(),
    (currentSeeking, previousSeeking) => {
      if (previousSeeking && !currentSeeking) {
        // Seeking just ended
        wasJustSeeking.value = true;
      }
    },
    [],
  );

  const onProgress = useCallback(
    async (data: ProgressUpdatePayload) => {
      if (isSeeking.get() || isPlaybackStopped) return;

      const { currentTime } = data.nativeEvent;
      if (isBuffering) {
        setIsBuffering(false);
      }

      progress.set(currentTime);

      // Update URL immediately after seeking, or every 30 seconds during normal playback
      const now = Date.now();
      const shouldUpdateUrl = wasJustSeeking.get();
      wasJustSeeking.value = false;

      if (
        shouldUpdateUrl ||
        now - lastUrlUpdateTime.get() > URL_UPDATE_INTERVAL
      ) {
        router.setParams({
          playbackPosition: msToTicks(currentTime).toString(),
        });
        lastUrlUpdateTime.value = now;
      }

      if (!item?.Id) return;

      playbackManager.reportPlaybackProgress(
        item.Id,
        msToTicks(progress.get()),
        {
          AudioStreamIndex: audioIndex ?? -1,
          SubtitleStreamIndex: subtitleIndex ?? -1,
        },
      );
    },
    [
      item?.Id,
      audioIndex,
      subtitleIndex,
      mediaSourceId,
      isPlaying,
      stream,
      isSeeking,
      isPlaybackStopped,
      isBuffering,
    ],
  );

  const onPipStarted = useCallback((e: PipStartedPayload) => {
    const { pipStarted } = e.nativeEvent;
    setIsPipStarted(pipStarted);
  }, []);

  /** Gets the initial playback position in seconds. */
  const startPosition = useMemo(() => {
    return ticksToSeconds(getInitialPlaybackTicks());
  }, [getInitialPlaybackTicks]);

  const volumeUpCb = useCallback(async () => {
    if (Platform.isTV) return;

    try {
      const { volume: currentVolume } = await VolumeManager.getVolume();
      const newVolume = Math.min(currentVolume + 0.1, 1.0);

      await VolumeManager.setVolume(newVolume);
    } catch (error) {
      console.error("Error adjusting volume:", error);
    }
  }, []);
  const [previousVolume, setPreviousVolume] = useState<number | null>(null);

  const toggleMuteCb = useCallback(async () => {
    if (Platform.isTV) return;

    try {
      const { volume: currentVolume } = await VolumeManager.getVolume();
      const currentVolumePercent = currentVolume * 100;

      if (currentVolumePercent > 0) {
        // Currently not muted, so mute
        setPreviousVolume(currentVolumePercent);
        await VolumeManager.setVolume(0);
        setIsMuted(true);
      } else {
        // Currently muted, so restore previous volume
        const volumeToRestore = previousVolume || 50; // Default to 50% if no previous volume
        await VolumeManager.setVolume(volumeToRestore / 100);
        setPreviousVolume(null);
        setIsMuted(false);
      }
    } catch (error) {
      console.error("Error toggling mute:", error);
    }
  }, [previousVolume]);

  const volumeDownCb = useCallback(async () => {
    if (Platform.isTV) return;

    try {
      const { volume: currentVolume } = await VolumeManager.getVolume();
      const newVolume = Math.max(currentVolume - 0.1, 0); // Decrease by 10%
      console.log(
        "Volume Down",
        Math.round(currentVolume * 100),
        "→",
        Math.round(newVolume * 100),
      );
      await VolumeManager.setVolume(newVolume);
    } catch (error) {
      console.error("Error adjusting volume:", error);
    }
  }, []);

  const setVolumeCb = useCallback(async (newVolume: number) => {
    if (Platform.isTV) return;

    try {
      const clampedVolume = Math.max(0, Math.min(newVolume, 100));
      console.log("Setting volume to", clampedVolume);
      await VolumeManager.setVolume(clampedVolume / 100);
    } catch (error) {
      console.error("Error setting volume:", error);
    }
  }, []);

  useWebSocket({
    isPlaying: isPlaying,
    togglePlay: togglePlay,
    stopPlayback: stop,
    offline,
    toggleMute: toggleMuteCb,
    volumeUp: volumeUpCb,
    volumeDown: volumeDownCb,
    setVolume: setVolumeCb,
  });

  const onPlaybackStateChanged = useCallback(
    async (e: PlaybackStatePayload) => {
      const { state, isBuffering, isPlaying } = e.nativeEvent;
      if (state === "Playing") {
        setIsPlaying(true);
        if (item?.Id) {
          playbackManager.reportPlaybackProgress(
            item.Id,
            msToTicks(progress.get()),
            {
              AudioStreamIndex: audioIndex ?? -1,
              SubtitleStreamIndex: subtitleIndex ?? -1,
            },
          );
        }
        if (!Platform.isTV) await activateKeepAwakeAsync();
        return;
      }

      if (state === "Paused") {
        setIsPlaying(false);
        if (item?.Id) {
          playbackManager.reportPlaybackProgress(
            item.Id,
            msToTicks(progress.get()),
            {
              AudioStreamIndex: audioIndex ?? -1,
              SubtitleStreamIndex: subtitleIndex ?? -1,
            },
          );
        }
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
    [playbackManager, item?.Id, progress],
  );

  const allAudio =
    stream?.mediaSource.MediaStreams?.filter(
      (audio) => audio.Type === "Audio",
    ) || [];

  // Move all the external subtitles last, because vlc places them last.
  const allSubs =
    stream?.mediaSource.MediaStreams?.filter(
      (sub) => sub.Type === "Subtitle",
    ).sort((a, b) => Number(a.IsExternal) - Number(b.IsExternal)) || [];

  const externalSubtitles = allSubs
    .filter((sub: any) => sub.DeliveryMethod === "External")
    .map((sub: any) => ({
      name: sub.DisplayTitle,
      DeliveryUrl: offline ? sub.DeliveryUrl : api?.basePath + sub.DeliveryUrl,
    }));
  /** The text based subtitle tracks */
  const textSubs = allSubs.filter((sub) => sub.IsTextSubtitleStream);
  /** The user chosen subtitle track from the server */
  const chosenSubtitleTrack = allSubs.find(
    (sub) => sub.Index === subtitleIndex,
  );
  /** The user chosen audio track from the server */
  const chosenAudioTrack = allAudio.find((audio) => audio.Index === audioIndex);
  /** Whether the stream we're playing is not transcoding*/
  const notTranscoding = !stream?.mediaSource.TranscodingUrl;
  /** The initial options to pass to the VLC Player */
  const initOptions = [``];
  if (
    chosenSubtitleTrack &&
    (notTranscoding || chosenSubtitleTrack.IsTextSubtitleStream)
  ) {
    // If not transcoding, we can the index as normal.
    // If transcoding, we need to reverse the text based subtitles, because VLC reverses the HLS subtitles.
    const finalIndex = notTranscoding
      ? allSubs.indexOf(chosenSubtitleTrack)
      : [...textSubs].reverse().indexOf(chosenSubtitleTrack);
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

  // Memoize video ref functions to prevent unnecessary re-renders
  const startPictureInPicture = useMemo(
    () => videoRef.current?.startPictureInPicture,
    [isVideoLoaded],
  );
  const play = useMemo(
    () => videoRef.current?.play || (() => {}),
    [isVideoLoaded],
  );
  const pause = useMemo(
    () => videoRef.current?.pause || (() => {}),
    [isVideoLoaded],
  );
  const seek = useMemo(
    () => videoRef.current?.seekTo || (() => {}),
    [isVideoLoaded],
  );
  const getAudioTracks = useMemo(
    () => videoRef.current?.getAudioTracks,
    [isVideoLoaded],
  );
  const getSubtitleTracks = useMemo(
    () => videoRef.current?.getSubtitleTracks,
    [isVideoLoaded],
  );
  const setSubtitleTrack = useMemo(
    () => videoRef.current?.setSubtitleTrack,
    [isVideoLoaded],
  );
  const setSubtitleURL = useMemo(
    () => videoRef.current?.setSubtitleURL,
    [isVideoLoaded],
  );
  const setAudioTrack = useMemo(
    () => videoRef.current?.setAudioTrack,
    [isVideoLoaded],
  );
  const setVideoAspectRatio = useMemo(
    () => videoRef.current?.setVideoAspectRatio,
    [isVideoLoaded],
  );
  const setVideoScaleFactor = useMemo(
    () => videoRef.current?.setVideoScaleFactor,
    [isVideoLoaded],
  );

  console.log("Debug: component render"); // Uncomment to debug re-renders

  // Show error UI first, before checking loading/missing‐data
  if (itemStatus.isError || streamStatus.isError) {
    return (
      <View className='w-screen h-screen flex flex-col items-center justify-center bg-black'>
        <Text className='text-white'>{t("player.error")}</Text>
      </View>
    );
  }

  // Then show loader while either side is still fetching or data isn’t present
  if (itemStatus.isLoading || streamStatus.isLoading || !item || !stream) {
    // …loader UI…
    return (
      <View className='w-screen h-screen flex flex-col items-center justify-center bg-black'>
        <Loader />
      </View>
    );
  }

  if (itemStatus.isError || streamStatus.isError)
    return (
      <View className='w-screen h-screen flex flex-col items-center justify-center bg-black'>
        <Text className='text-white'>{t("player.error")}</Text>
      </View>
    );

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: "black",
        height: "100%",
        width: "100%",
      }}
    >
      <View
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          position: "relative",
          flexDirection: "column",
          justifyContent: "center",
        }}
      >
        <VlcPlayerView
          ref={videoRef}
          source={{
            uri: stream?.url || "",
            autoplay: true,
            isNetwork: !offline,
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
            Alert.alert(
              t("player.error"),
              t("player.an_error_occured_while_playing_the_video"),
            );
            writeToLog("ERROR", "Video Error", e.nativeEvent);
          }}
        />
      </View>
      {!isPipStarted && isMounted === true && item && (
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
          isVideoLoaded={isVideoLoaded}
          startPictureInPicture={startPictureInPicture}
          play={play}
          pause={pause}
          seek={seek}
          enableTrickplay={true}
          getAudioTracks={getAudioTracks}
          getSubtitleTracks={getSubtitleTracks}
          offline={offline}
          setSubtitleTrack={setSubtitleTrack}
          setSubtitleURL={setSubtitleURL}
          setAudioTrack={setAudioTrack}
          setVideoAspectRatio={setVideoAspectRatio}
          setVideoScaleFactor={setVideoScaleFactor}
          aspectRatio={aspectRatio}
          scaleFactor={scaleFactor}
          setAspectRatio={setAspectRatio}
          setScaleFactor={setScaleFactor}
          isVlc
        />
      )}
    </View>
  );
}

import {
  type BaseItemDto,
  type MediaSourceInfo,
  PlaybackOrder,
  PlaybackProgressInfo,
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
import { Alert, Platform, useWindowDimensions, View } from "react-native";
import { useAnimatedReaction, useSharedValue } from "react-native-reanimated";

import { BITRATES } from "@/components/BitrateSelector";
import { Text } from "@/components/common/Text";
import { Loader } from "@/components/Loader";
import { Controls } from "@/components/video-player/controls/Controls";
import { PlayerProvider } from "@/components/video-player/controls/contexts/PlayerContext";
import { VideoProvider } from "@/components/video-player/controls/contexts/VideoContext";
import {
  PlaybackSpeedScope,
  updatePlaybackSpeedSettings,
} from "@/components/video-player/controls/utils/playback-speed-settings";
import { useHaptic } from "@/hooks/useHaptic";
import { useOrientation } from "@/hooks/useOrientation";
import { usePlaybackManager } from "@/hooks/usePlaybackManager";
import usePlaybackSpeed from "@/hooks/usePlaybackSpeed";
import { useInvalidatePlaybackProgressCache } from "@/hooks/useRevalidatePlaybackProgressCache";
import { useWebSocket } from "@/hooks/useWebsockets";
import {
  type MpvOnErrorEventPayload,
  type MpvOnPlaybackStateChangePayload,
  type MpvOnProgressEventPayload,
  MpvPlayerView,
  type MpvPlayerViewRef,
  type MpvVideoSource,
} from "@/modules";
import { useDownload } from "@/providers/DownloadProvider";
import { DownloadedItem } from "@/providers/Downloads/types";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { useSettings } from "@/utils/atoms/settings";
import { getStreamUrl } from "@/utils/jellyfin/media/getStreamUrl";
import {
  getMpvAudioId,
  getMpvSubtitleId,
} from "@/utils/jellyfin/subtitleUtils";
import { writeToLog } from "@/utils/log";
import { generateDeviceProfile } from "@/utils/profiles/native";
import { msToTicks, ticksToSeconds } from "@/utils/time";

export default function page() {
  const videoRef = useRef<MpvPlayerViewRef>(null);
  const user = useAtomValue(userAtom);
  const api = useAtomValue(apiAtom);
  const { t } = useTranslation();
  const navigation = useNavigation();
  const { settings, updateSettings } = useSettings();

  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  const [isPlaybackStopped, setIsPlaybackStopped] = useState(false);
  const [showControls, _setShowControls] = useState(true);
  const [isPipMode, setIsPipMode] = useState(false);
  const [aspectRatio] = useState<"default" | "16:9" | "4:3" | "1:1" | "21:9">(
    "default",
  );
  const [isZoomedToFill, setIsZoomedToFill] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isBuffering, setIsBuffering] = useState(true);
  const [isVideoLoaded, setIsVideoLoaded] = useState(false);
  const [tracksReady, setTracksReady] = useState(false);
  const [hasPlaybackStarted, setHasPlaybackStarted] = useState(false);
  const [currentPlaybackSpeed, setCurrentPlaybackSpeed] = useState(1.0);

  const progress = useSharedValue(0);
  const isSeeking = useSharedValue(false);
  const cacheProgress = useSharedValue(0);
  const VolumeManager = Platform.isTV
    ? null
    : require("react-native-volume-manager");

  const downloadUtils = useDownload();
  const downloadedFiles = useMemo(
    () => downloadUtils.getDownloadedItems(),
    [downloadUtils.getDownloadedItems],
  );

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
  const { lockOrientation, unlockOrientation } = useOrientation();

  const offline = offlineStr === "true";
  const playbackManager = usePlaybackManager({ isOffline: offline });

  // Audio index: use URL param if provided, otherwise use stored index for offline playback
  // This is computed after downloadedItem is available, see audioIndexResolved below
  const audioIndexFromUrl = audioIndexStr
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

  // Resolve audio index: use URL param if provided, otherwise use stored index for offline playback
  const audioIndex = useMemo(() => {
    if (audioIndexFromUrl !== undefined) {
      return audioIndexFromUrl;
    }
    if (offline && downloadedItem?.userData?.audioStreamIndex !== undefined) {
      return downloadedItem.userData.audioStreamIndex;
    }
    return undefined;
  }, [audioIndexFromUrl, offline, downloadedItem?.userData?.audioStreamIndex]);

  // Get the playback speed for this item based on settings
  const { playbackSpeed: initialPlaybackSpeed } = usePlaybackSpeed(
    item,
    settings,
  );

  // Handler for changing playback speed
  const handleSetPlaybackSpeed = useCallback(
    async (speed: number, scope: PlaybackSpeedScope) => {
      // Update settings based on scope
      updatePlaybackSpeedSettings(
        speed,
        scope,
        item ?? undefined,
        settings,
        updateSettings,
      );

      // Apply speed to the current player (MPV)
      setCurrentPlaybackSpeed(speed);
      await videoRef.current?.setSpeed?.(speed);
    },
    [item, settings, updateSettings],
  );

  /** Gets the initial playback position from the URL. */
  const getInitialPlaybackTicks = useCallback((): number => {
    if (playbackPositionFromUrl) {
      return Number.parseInt(playbackPositionFromUrl, 10);
    }
    return item?.UserData?.PlaybackPositionTicks ?? 0;
  }, [playbackPositionFromUrl, item?.UserData?.PlaybackPositionTicks]);

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

  // Lock orientation based on user settings
  useEffect(() => {
    if (settings?.defaultVideoOrientation) {
      lockOrientation(settings.defaultVideoOrientation);
    }

    return () => {
      unlockOrientation();
    };
  }, [settings?.defaultVideoOrientation, lockOrientation, unlockOrientation]);

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
        // Don't attempt to fetch stream data if item is not available
        if (!item?.Id) {
          console.log("Item not loaded yet, skipping stream data fetch");
          setStreamStatus({ isLoading: false, isError: false });
          return;
        }

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
          // Validate required parameters before calling getStreamUrl
          if (!api) {
            console.warn("API not available for streaming");
            setStreamStatus({ isLoading: false, isError: true });
            return;
          }
          if (!user?.Id) {
            console.warn("User not authenticated for streaming");
            setStreamStatus({ isLoading: false, isError: true });
            return;
          }

          // Calculate start ticks directly from item to avoid stale closure
          const startTicks = playbackPositionFromUrl
            ? Number.parseInt(playbackPositionFromUrl, 10)
            : (item?.UserData?.PlaybackPositionTicks ?? 0);

          const res = await getStreamUrl({
            api,
            item,
            startTimeTicks: startTicks,
            userId: user.Id,
            audioStreamIndex: audioIndex,
            maxStreamingBitrate: bitrateValue,
            mediaSourceId: mediaSourceId,
            subtitleStreamIndex: subtitleIndex,
            deviceProfile: generateDeviceProfile(),
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
    if (!stream || !api || offline) return;
    const reportPlaybackStart = async () => {
      const progressInfo = currentPlayStateInfo();
      if (progressInfo) {
        await getPlaystateApi(api).reportPlaybackStart({
          playbackStartInfo: progressInfo,
        });
      }
    };
    reportPlaybackStart();
  }, [stream, api, offline]);

  const togglePlay = async () => {
    lightHapticFeedback();
    setIsPlaying(!isPlaying);
    if (isPlaying) {
      await videoRef.current?.pause();
      const progressInfo = currentPlayStateInfo();
      if (progressInfo) {
        playbackManager.reportPlaybackProgress(progressInfo);
      }
    } else {
      videoRef.current?.play();
      const progressInfo = currentPlayStateInfo();
      if (!offline && api) {
        await getPlaystateApi(api).reportPlaybackStart({
          playbackStartInfo: progressInfo,
        });
      }
    }
  };

  const reportPlaybackStopped = useCallback(async () => {
    if (!item?.Id || !stream?.sessionId || offline || !api) return;

    const currentTimeInTicks = msToTicks(progress.get());
    await getPlaystateApi(api).onPlaybackStopped({
      itemId: item.Id,
      mediaSourceId: mediaSourceId,
      positionTicks: currentTimeInTicks,
      playSessionId: stream.sessionId,
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
    videoRef.current?.pause();
    revalidateProgressCache();
  }, [videoRef, reportPlaybackStopped, progress]);

  useEffect(() => {
    const beforeRemoveListener = navigation.addListener("beforeRemove", stop);
    return () => {
      beforeRemoveListener();
    };
  }, [navigation, stop]);

  const currentPlayStateInfo = useCallback(():
    | PlaybackProgressInfo
    | undefined => {
    if (!stream || !item?.Id) return;

    return {
      ItemId: item.Id,
      AudioStreamIndex: audioIndex ? audioIndex : undefined,
      SubtitleStreamIndex: subtitleIndex ? subtitleIndex : undefined,
      MediaSourceId: mediaSourceId,
      PositionTicks: msToTicks(progress.get()),
      IsPaused: !isPlaying,
      PlayMethod: stream?.url.includes("m3u8") ? "Transcode" : "DirectStream",
      PlaySessionId: stream.sessionId,
      IsMuted: isMuted,
      CanSeek: true,
      RepeatMode: RepeatMode.RepeatNone,
      PlaybackOrder: PlaybackOrder.Default,
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

  /** Progress handler for MPV - position in seconds */
  const onProgress = useCallback(
    async (data: { nativeEvent: MpvOnProgressEventPayload }) => {
      if (isSeeking.get() || isPlaybackStopped) return;

      const { position } = data.nativeEvent;
      // MPV reports position in seconds, convert to ms
      const currentTime = position * 1000;

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
        currentPlayStateInfo() as PlaybackProgressInfo,
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

  /** Gets the initial playback position in seconds. */
  const _startPosition = useMemo(() => {
    return ticksToSeconds(getInitialPlaybackTicks());
  }, [getInitialPlaybackTicks]);

  /** Build video source config for MPV */
  const videoSource = useMemo<MpvVideoSource | undefined>(() => {
    if (!stream?.url) return undefined;

    const mediaSource = stream.mediaSource;
    const isTranscoding = Boolean(mediaSource?.TranscodingUrl);

    // Get external subtitle URLs
    // - Online: prepend API base path to server URLs
    // - Offline: use local file paths (stored in DeliveryUrl during download)
    let externalSubs: string[] | undefined;
    if (!offline && api?.basePath) {
      externalSubs = mediaSource?.MediaStreams?.filter(
        (s) =>
          s.Type === "Subtitle" &&
          s.DeliveryMethod === "External" &&
          s.DeliveryUrl,
      ).map((s) => `${api.basePath}${s.DeliveryUrl}`);
    } else if (offline) {
      externalSubs = mediaSource?.MediaStreams?.filter(
        (s) =>
          s.Type === "Subtitle" &&
          s.DeliveryMethod === "External" &&
          s.DeliveryUrl,
      ).map((s) => s.DeliveryUrl!);
    }

    // Calculate track IDs for initial selection
    const initialSubtitleId = getMpvSubtitleId(
      mediaSource,
      subtitleIndex,
      isTranscoding,
    );
    const initialAudioId = getMpvAudioId(mediaSource, audioIndex);

    // Calculate start position directly here to avoid timing issues
    const startTicks = playbackPositionFromUrl
      ? Number.parseInt(playbackPositionFromUrl, 10)
      : (item?.UserData?.PlaybackPositionTicks ?? 0);
    const startPos = ticksToSeconds(startTicks);

    // Build source config - headers only needed for online streaming
    const source: MpvVideoSource = {
      url: stream.url,
      startPosition: startPos,
      autoplay: true,
      initialSubtitleId,
      initialAudioId,
    };

    // Add external subtitles only for online playback
    if (externalSubs && externalSubs.length > 0) {
      source.externalSubtitles = externalSubs;
    }

    // Add auth headers only for online streaming (not for local file:// URLs)
    if (!offline && api?.accessToken) {
      source.headers = {
        Authorization: `MediaBrowser Token="${api.accessToken}"`,
      };
    }

    return source;
  }, [
    stream?.url,
    stream?.mediaSource,
    item?.UserData?.PlaybackPositionTicks,
    playbackPositionFromUrl,
    api?.basePath,
    api?.accessToken,
    subtitleIndex,
    audioIndex,
    offline,
  ]);

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

  /** Playback state handler for MPV */
  const onPlaybackStateChanged = useCallback(
    async (e: { nativeEvent: MpvOnPlaybackStateChangePayload }) => {
      const { isPaused, isPlaying: playing, isLoading } = e.nativeEvent;

      if (playing) {
        setIsPlaying(true);
        setIsBuffering(false);
        setHasPlaybackStarted(true);
        if (item?.Id) {
          playbackManager.reportPlaybackProgress(
            currentPlayStateInfo() as PlaybackProgressInfo,
          );
        }
        if (!Platform.isTV) await activateKeepAwakeAsync();
        return;
      }

      if (isPaused) {
        setIsPlaying(false);
        if (item?.Id) {
          playbackManager.reportPlaybackProgress(
            currentPlayStateInfo() as PlaybackProgressInfo,
          );
        }
        if (!Platform.isTV) await deactivateKeepAwake();
        return;
      }

      if (isLoading) {
        setIsBuffering(true);
      }
    },
    [playbackManager, item?.Id, progress],
  );

  /** PiP handler for MPV */
  const _onPictureInPictureChange = useCallback(
    (e: { nativeEvent: { isActive: boolean } }) => {
      const { isActive } = e.nativeEvent;
      setIsPipMode(isActive);
      // Hide controls when entering PiP
      if (isActive) {
        _setShowControls(false);
      }
    },
    [],
  );

  const [isMounted, setIsMounted] = useState(false);

  // Add useEffect to handle mounting
  useEffect(() => {
    setIsMounted(true);
    return () => setIsMounted(false);
  }, []);

  // Memoize video ref functions to prevent unnecessary re-renders
  const startPictureInPicture = useCallback(async () => {
    return videoRef.current?.startPictureInPicture?.();
  }, []);

  const play = useCallback(() => {
    videoRef.current?.play?.();
  }, []);

  const pause = useCallback(() => {
    videoRef.current?.pause?.();
  }, []);

  const seek = useCallback((position: number) => {
    // MPV expects seconds, convert from ms
    videoRef.current?.seekTo?.(position / 1000);
  }, []);

  const handleZoomToggle = useCallback(async () => {
    const newZoomState = !isZoomedToFill;
    await videoRef.current?.setZoomedToFill?.(newZoomState);
    setIsZoomedToFill(newZoomState);

    // Adjust subtitle position to compensate for video cropping when zoomed
    if (newZoomState) {
      // Get video dimensions from mediaSource
      const videoStream = stream?.mediaSource?.MediaStreams?.find(
        (s) => s.Type === "Video",
      );
      const videoWidth = videoStream?.Width ?? 1920;
      const videoHeight = videoStream?.Height ?? 1080;

      const videoAR = videoWidth / videoHeight;
      const screenAR = screenWidth / screenHeight;

      if (screenAR > videoAR) {
        // Screen is wider than video - video height extends beyond screen
        // Calculate how much of the video is cropped at the bottom (as % of video height)
        const bottomCropPercent = 50 * (1 - videoAR / screenAR);
        // Only adjust by 70% of the crop to keep a comfortable margin from the edge
        // (subtitles already have some built-in padding from the bottom)
        const adjustmentFactor = 0.7;
        const newSubPos = Math.round(
          100 - bottomCropPercent * adjustmentFactor,
        );
        await videoRef.current?.setSubtitlePosition?.(newSubPos);
      }
      // If videoAR >= screenAR, sides are cropped but bottom is visible, no adjustment needed
    } else {
      // Restore to default position (bottom of video frame)
      await videoRef.current?.setSubtitlePosition?.(100);
    }
  }, [isZoomedToFill, stream?.mediaSource, screenWidth, screenHeight]);

  // Apply subtitle settings when video loads
  useEffect(() => {
    if (!isVideoLoaded || !videoRef.current) return;

    const applySubtitleSettings = async () => {
      if (settings.mpvSubtitleScale !== undefined) {
        await videoRef.current?.setSubtitleScale?.(settings.mpvSubtitleScale);
      }
      if (settings.mpvSubtitleMarginY !== undefined) {
        await videoRef.current?.setSubtitleMarginY?.(
          settings.mpvSubtitleMarginY,
        );
      }
      if (settings.mpvSubtitleAlignX !== undefined) {
        await videoRef.current?.setSubtitleAlignX?.(settings.mpvSubtitleAlignX);
      }
      if (settings.mpvSubtitleAlignY !== undefined) {
        await videoRef.current?.setSubtitleAlignY?.(settings.mpvSubtitleAlignY);
      }
      if (settings.mpvSubtitleFontSize !== undefined) {
        await videoRef.current?.setSubtitleFontSize?.(
          settings.mpvSubtitleFontSize,
        );
      }
      // Apply subtitle size from general settings
      if (settings.subtitleSize) {
        await videoRef.current?.setSubtitleFontSize?.(settings.subtitleSize);
      }
    };

    applySubtitleSettings();
  }, [isVideoLoaded, settings]);

  // Apply initial playback speed when video loads
  useEffect(() => {
    if (!isVideoLoaded || !videoRef.current) return;

    const applyInitialPlaybackSpeed = async () => {
      if (initialPlaybackSpeed !== 1.0) {
        setCurrentPlaybackSpeed(initialPlaybackSpeed);
        await videoRef.current?.setSpeed?.(initialPlaybackSpeed);
      }
    };

    applyInitialPlaybackSpeed();
  }, [isVideoLoaded, initialPlaybackSpeed]);

  // Show error UI first, before checking loading/missing‐data
  if (itemStatus.isError || streamStatus.isError) {
    return (
      <View className='w-screen h-screen flex flex-col items-center justify-center bg-black'>
        <Text className='text-white'>{t("player.error")}</Text>
      </View>
    );
  }

  // Then show loader while either side is still fetching or data isn't present
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
    <PlayerProvider
      playerRef={videoRef}
      item={item}
      mediaSource={stream?.mediaSource}
      isVideoLoaded={isVideoLoaded}
      tracksReady={tracksReady}
      offline={offline}
      downloadedItem={downloadedItem}
    >
      <VideoProvider>
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
            <MpvPlayerView
              ref={videoRef}
              source={videoSource}
              style={{ width: "100%", height: "100%" }}
              onProgress={onProgress}
              onPlaybackStateChange={onPlaybackStateChanged}
              onLoad={() => setIsVideoLoaded(true)}
              onError={(e: { nativeEvent: MpvOnErrorEventPayload }) => {
                console.error("Video Error:", e.nativeEvent);
                Alert.alert(
                  t("player.error"),
                  t("player.an_error_occured_while_playing_the_video"),
                );
                writeToLog("ERROR", "Video Error", e.nativeEvent);
              }}
              onTracksReady={() => {
                setTracksReady(true);
              }}
            />
            {!hasPlaybackStarted && (
              <View
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  backgroundColor: "black",
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <Loader />
              </View>
            )}
          </View>
          {isMounted === true && item && !isPipMode && (
            <Controls
              mediaSource={stream?.mediaSource}
              item={item}
              togglePlay={togglePlay}
              isPlaying={isPlaying}
              isSeeking={isSeeking}
              progress={progress}
              cacheProgress={cacheProgress}
              isBuffering={isBuffering}
              showControls={showControls}
              setShowControls={setShowControls}
              startPictureInPicture={startPictureInPicture}
              play={play}
              pause={pause}
              seek={seek}
              enableTrickplay={true}
              offline={offline}
              aspectRatio={aspectRatio}
              isZoomedToFill={isZoomedToFill}
              onZoomToggle={handleZoomToggle}
              api={api}
              downloadedFiles={downloadedFiles}
              playbackSpeed={currentPlaybackSpeed}
              setPlaybackSpeed={handleSetPlaybackSpeed}
            />
          )}
        </View>
      </VideoProvider>
    </PlayerProvider>
  );
}

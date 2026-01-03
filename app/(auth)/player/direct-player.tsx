import {
  type BaseItemDto,
  type MediaSourceInfo,
  PlaybackOrder,
  PlaybackProgressInfo,
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
import { PlayerProvider } from "@/components/video-player/controls/contexts/PlayerContext";
import { VideoProvider } from "@/components/video-player/controls/contexts/VideoContext";
import { useHaptic } from "@/hooks/useHaptic";
import { useOrientation } from "@/hooks/useOrientation";
import { usePlaybackManager } from "@/hooks/usePlaybackManager";
import { useInvalidatePlaybackProgressCache } from "@/hooks/useRevalidatePlaybackProgressCache";
import { useWebSocket } from "@/hooks/useWebsockets";
import {
  type PlaybackStatePayload,
  type ProgressUpdatePayload,
  type SfOnErrorEventPayload,
  type SfOnPictureInPictureChangePayload,
  type SfOnPlaybackStateChangePayload,
  type SfOnProgressEventPayload,
  SfPlayerView,
  type SfPlayerViewRef,
  type SfVideoSource,
  setHardwareDecode,
  type VlcPlayerSource,
  VlcPlayerView,
  type VlcPlayerViewRef,
} from "@/modules";
import { useDownload } from "@/providers/DownloadProvider";
import { DownloadedItem } from "@/providers/Downloads/types";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { useSettings, VideoPlayerIOS } from "@/utils/atoms/settings";
import { getStreamUrl } from "@/utils/jellyfin/media/getStreamUrl";
import {
  getMpvAudioId,
  getMpvSubtitleId,
} from "@/utils/jellyfin/subtitleUtils";
import { writeToLog } from "@/utils/log";
import { generateDeviceProfile } from "@/utils/profiles/native";
import { msToTicks, ticksToSeconds } from "@/utils/time";

export default function page() {
  const videoRef = useRef<SfPlayerViewRef | VlcPlayerViewRef>(null);
  const user = useAtomValue(userAtom);
  const api = useAtomValue(apiAtom);
  const { t } = useTranslation();
  const navigation = useNavigation();
  const { settings } = useSettings();

  // Determine which player to use:
  // - Android always uses VLC
  // - iOS uses user setting (KSPlayer by default, VLC optional)
  const useVlcPlayer =
    Platform.OS === "android" ||
    (Platform.OS === "ios" && settings.videoPlayerIOS === VideoPlayerIOS.VLC);

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
      await getPlaystateApi(api).reportPlaybackStart({
        playbackStartInfo: currentPlayStateInfo() as PlaybackStartInfo,
      });
    };
    reportPlaybackStart();
  }, [stream, api, offline]);

  const togglePlay = async () => {
    lightHapticFeedback();
    setIsPlaying(!isPlaying);
    if (isPlaying) {
      await videoRef.current?.pause();
      playbackManager.reportPlaybackProgress(
        currentPlayStateInfo() as PlaybackProgressInfo,
      );
    } else {
      videoRef.current?.play();
      if (!offline && api) {
        await getPlaystateApi(api).reportPlaybackStart({
          playbackStartInfo: currentPlayStateInfo() as PlaybackStartInfo,
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
    // KSPlayer doesn't have a stop method, use pause instead
    videoRef.current?.pause();
    revalidateProgressCache();
  }, [videoRef, reportPlaybackStopped, progress]);

  useEffect(() => {
    const beforeRemoveListener = navigation.addListener("beforeRemove", stop);
    return () => {
      beforeRemoveListener();
    };
  }, [navigation, stop]);

  const currentPlayStateInfo = useCallback(() => {
    if (!stream || !item?.Id) return;

    return {
      itemId: item.Id,
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

  /** Progress handler for iOS (SfPlayer) - position in seconds */
  const onProgressSf = useCallback(
    async (data: { nativeEvent: SfOnProgressEventPayload }) => {
      if (isSeeking.get() || isPlaybackStopped) return;

      const { position } = data.nativeEvent;
      // KSPlayer reports position in seconds, convert to ms
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

  /** Progress handler for Android (VLC) - currentTime in milliseconds */
  const onProgressVlc = useCallback(
    async (data: ProgressUpdatePayload) => {
      if (isSeeking.get() || isPlaybackStopped) return;

      const { currentTime } = data.nativeEvent;
      // VLC reports currentTime in milliseconds

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
  const startPosition = useMemo(() => {
    return ticksToSeconds(getInitialPlaybackTicks());
  }, [getInitialPlaybackTicks]);

  /** Build video source config for iOS (SfPlayer/KSPlayer) */
  const sfVideoSource = useMemo<SfVideoSource | undefined>(() => {
    if (!stream?.url || useVlcPlayer) return undefined;

    const mediaSource = stream.mediaSource;
    const isTranscoding = Boolean(mediaSource?.TranscodingUrl);

    // For offline playback, subtitles are embedded in the downloaded file
    // For online playback, get external subtitle URLs from server
    let externalSubs: string[] | undefined;
    if (!offline && api?.basePath) {
      externalSubs = mediaSource?.MediaStreams?.filter(
        (s) =>
          s.Type === "Subtitle" &&
          s.DeliveryMethod === "External" &&
          s.DeliveryUrl,
      ).map((s) => `${api.basePath}${s.DeliveryUrl}`);
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

    // For transcoded streams, the server already handles seeking via startTimeTicks,
    // so we should NOT also tell the player to seek (would cause double-seeking).
    // For direct play/stream, the player needs to seek itself.
    const playerStartPos = isTranscoding ? 0 : startPos;

    // Build source config - headers only needed for online streaming
    const source: SfVideoSource = {
      url: stream.url,
      startPosition: playerStartPos,
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
    useVlcPlayer,
  ]);

  /** Build video source config for Android (VLC) */
  const vlcVideoSource = useMemo<VlcPlayerSource | undefined>(() => {
    if (!stream?.url || !useVlcPlayer) return undefined;

    const mediaSource = stream.mediaSource;
    const isTranscoding = Boolean(mediaSource?.TranscodingUrl);

    // For VLC, external subtitles need name and DeliveryUrl
    let externalSubs: { name: string; DeliveryUrl: string }[] | undefined;
    if (!offline && api?.basePath) {
      externalSubs = mediaSource?.MediaStreams?.filter(
        (s) =>
          s.Type === "Subtitle" &&
          s.DeliveryMethod === "External" &&
          s.DeliveryUrl,
      ).map((s) => ({
        name: s.DisplayTitle || s.Title || `Subtitle ${s.Index}`,
        DeliveryUrl: `${api.basePath}${s.DeliveryUrl}`,
      }));
    }

    // Build VLC init options (required for VLC to work properly)
    const initOptions: string[] = [""];

    // Get all subtitle and audio streams
    const allSubs =
      mediaSource?.MediaStreams?.filter((s) => s.Type === "Subtitle") ?? [];
    const textSubs = allSubs.filter((s) => s.IsTextSubtitleStream);
    const allAudio =
      mediaSource?.MediaStreams?.filter((s) => s.Type === "Audio") ?? [];

    // Find chosen tracks
    const chosenSubtitleTrack = allSubs.find((s) => s.Index === subtitleIndex);
    const chosenAudioTrack = allAudio.find((a) => a.Index === audioIndex);

    // Set subtitle track
    if (
      chosenSubtitleTrack &&
      (!isTranscoding || chosenSubtitleTrack.IsTextSubtitleStream)
    ) {
      const finalIndex = !isTranscoding
        ? allSubs.indexOf(chosenSubtitleTrack)
        : [...textSubs].reverse().indexOf(chosenSubtitleTrack);
      if (finalIndex >= 0) {
        initOptions.push(`--sub-track=${finalIndex}`);
      }
    }

    // Set audio track
    if (!isTranscoding && chosenAudioTrack) {
      const audioTrackIndex = allAudio.indexOf(chosenAudioTrack);
      if (audioTrackIndex >= 0) {
        initOptions.push(`--audio-track=${audioTrackIndex}`);
      }
    }

    // Add subtitle styling
    if (settings.subtitleSize) {
      initOptions.push(`--sub-text-scale=${settings.subtitleSize}`);
    }
    initOptions.push("--sub-margin=40");

    // For transcoded streams, the server already handles seeking via startTimeTicks,
    // so we should NOT also tell the player to seek (would cause double-seeking).
    // For direct play/stream, the player needs to seek itself.
    const playerStartPos = isTranscoding ? 0 : startPosition;

    const source: VlcPlayerSource = {
      uri: stream.url,
      startPosition: playerStartPos,
      autoplay: true,
      isNetwork: !offline,
      externalSubtitles: externalSubs,
      initOptions,
    };

    return source;
  }, [
    stream?.url,
    stream?.mediaSource,
    startPosition,
    useVlcPlayer,
    api?.basePath,
    offline,
    subtitleIndex,
    audioIndex,
    settings.subtitleSize,
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

  /** Playback state handler for iOS (SfPlayer) */
  const onPlaybackStateChangedSf = useCallback(
    async (e: { nativeEvent: SfOnPlaybackStateChangePayload }) => {
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

  /** Playback state handler for Android (VLC) */
  const onPlaybackStateChangedVlc = useCallback(
    async (e: PlaybackStatePayload) => {
      const {
        state,
        isBuffering: buffering,
        isPlaying: playing,
      } = e.nativeEvent;

      if (state === "Playing" || playing) {
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

      if (state === "Paused") {
        setIsPlaying(false);
        if (item?.Id) {
          playbackManager.reportPlaybackProgress(
            currentPlayStateInfo() as PlaybackProgressInfo,
          );
        }
        if (!Platform.isTV) await deactivateKeepAwake();
        return;
      }

      if (state === "Buffering" || buffering) {
        setIsBuffering(true);
      }
    },
    [playbackManager, item?.Id, progress],
  );

  /** PiP handler for iOS (SfPlayer) */
  const onPictureInPictureChangeSf = useCallback(
    (e: { nativeEvent: SfOnPictureInPictureChangePayload }) => {
      const { isActive } = e.nativeEvent;
      setIsPipMode(isActive);
      // Hide controls when entering PiP
      if (isActive) {
        _setShowControls(false);
      }
    },
    [],
  );

  /** PiP handler for Android (VLC) */
  const onPipStartedVlc = useCallback(
    (e: { nativeEvent: { pipStarted: boolean } }) => {
      const { pipStarted } = e.nativeEvent;
      setIsPipMode(pipStarted);
      // Hide controls when entering PiP
      if (pipStarted) {
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

  const seek = useCallback(
    (position: number) => {
      if (useVlcPlayer) {
        // VLC expects milliseconds
        videoRef.current?.seekTo?.(position);
      } else {
        // KSPlayer expects seconds, convert from ms
        videoRef.current?.seekTo?.(position / 1000);
      }
    },
    [useVlcPlayer],
  );

  const handleZoomToggle = useCallback(async () => {
    // Zoom toggle only supported when using SfPlayer (KSPlayer)
    if (useVlcPlayer) return;
    const newZoomState = !isZoomedToFill;
    setIsZoomedToFill(newZoomState);
    await (videoRef.current as SfPlayerViewRef)?.setVideoZoomToFill?.(
      newZoomState,
    );
  }, [isZoomedToFill, useVlcPlayer]);

  // Apply KSPlayer global settings before video loads (only when using KSPlayer)
  useEffect(() => {
    if (Platform.OS === "ios" && !useVlcPlayer) {
      setHardwareDecode(settings.ksHardwareDecode);
    }
  }, [settings.ksHardwareDecode, useVlcPlayer]);

  // Apply subtitle settings when video loads (SfPlayer-specific)
  useEffect(() => {
    if (useVlcPlayer || !isVideoLoaded || !videoRef.current) return;

    const sfRef = videoRef.current as SfPlayerViewRef;
    const applySubtitleSettings = async () => {
      if (settings.mpvSubtitleScale !== undefined) {
        await sfRef?.setSubtitleScale?.(settings.mpvSubtitleScale);
      }
      if (settings.mpvSubtitleMarginY !== undefined) {
        await sfRef?.setSubtitleMarginY?.(settings.mpvSubtitleMarginY);
      }
      if (settings.mpvSubtitleAlignX !== undefined) {
        await sfRef?.setSubtitleAlignX?.(settings.mpvSubtitleAlignX);
      }
      if (settings.mpvSubtitleAlignY !== undefined) {
        await sfRef?.setSubtitleAlignY?.(settings.mpvSubtitleAlignY);
      }
      if (settings.mpvSubtitleFontSize !== undefined) {
        await sfRef?.setSubtitleFontSize?.(settings.mpvSubtitleFontSize);
      }
      // Apply subtitle size from general settings
      if (settings.subtitleSize) {
        await sfRef?.setSubtitleFontSize?.(settings.subtitleSize);
      }
    };

    applySubtitleSettings();
  }, [isVideoLoaded, settings, useVlcPlayer]);

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
            {useVlcPlayer ? (
              <VlcPlayerView
                ref={videoRef as React.RefObject<VlcPlayerViewRef>}
                source={vlcVideoSource!}
                style={{ width: "100%", height: "100%" }}
                onVideoProgress={onProgressVlc}
                onVideoStateChange={onPlaybackStateChangedVlc}
                onPipStarted={onPipStartedVlc}
                onVideoLoadEnd={() => setIsVideoLoaded(true)}
                onVideoError={(e: PlaybackStatePayload) => {
                  console.error("Video Error:", e.nativeEvent);
                  Alert.alert(
                    t("player.error"),
                    t("player.an_error_occured_while_playing_the_video"),
                  );
                  writeToLog("ERROR", "Video Error", e.nativeEvent);
                }}
                progressUpdateInterval={1000}
              />
            ) : (
              <SfPlayerView
                ref={videoRef as React.RefObject<SfPlayerViewRef>}
                source={sfVideoSource}
                style={{ width: "100%", height: "100%" }}
                onProgress={onProgressSf}
                onPlaybackStateChange={onPlaybackStateChangedSf}
                onPictureInPictureChange={onPictureInPictureChangeSf}
                onLoad={() => setIsVideoLoaded(true)}
                onError={(e: { nativeEvent: SfOnErrorEventPayload }) => {
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
            )}
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
            />
          )}
        </View>
      </VideoProvider>
    </PlayerProvider>
  );
}

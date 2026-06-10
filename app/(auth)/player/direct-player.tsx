import {
  type BaseItemDto,
  type MediaSourceInfo,
  type MediaStream,
  PlaybackOrder,
  PlaybackProgressInfo,
  RepeatMode,
} from "@jellyfin/sdk/lib/generated-client";
import {
  getPlaystateApi,
  getUserLibraryApi,
} from "@jellyfin/sdk/lib/utils/api";
import { File } from "expo-file-system";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { useLocalSearchParams, useNavigation } from "expo-router";
import { useAtomValue } from "jotai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Platform, useWindowDimensions, View } from "react-native";
import { useAnimatedReaction, useSharedValue } from "react-native-reanimated";
import { BITRATES } from "@/components/BitrateSelector";
import { Text } from "@/components/common/Text";
import { Loader } from "@/components/Loader";
import { Controls } from "@/components/video-player/controls/Controls";
import { Controls as TVControls } from "@/components/video-player/controls/Controls.tv";
import { PlayerProvider } from "@/components/video-player/controls/contexts/PlayerContext";
import { VideoProvider } from "@/components/video-player/controls/contexts/VideoContext";
import {
  PlaybackSpeedScope,
  updatePlaybackSpeedSettings,
} from "@/components/video-player/controls/utils/playback-speed-settings";
import useRouter from "@/hooks/useAppRouter";
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
import { useInactivity } from "@/providers/InactivityProvider";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { OfflineModeProvider } from "@/providers/OfflineModeProvider";

import { getSubtitlesForItem } from "@/utils/atoms/downloadedSubtitles";
import { useSettings } from "@/utils/atoms/settings";
import { getDefaultPlaySettings } from "@/utils/jellyfin/getDefaultPlaySettings";
import { getPrimaryImageUrl } from "@/utils/jellyfin/image/getPrimaryImageUrl";
import { getStreamUrl } from "@/utils/jellyfin/media/getStreamUrl";
import {
  getMpvAudioId,
  getMpvSubtitleId,
} from "@/utils/jellyfin/subtitleUtils";
import { writeToLog } from "@/utils/log";
import { msToTicks, ticksToSeconds } from "@/utils/time";
import { generateDeviceProfile } from "../../../utils/profiles/native";

export default function DirectPlayerPage() {
  const videoRef = useRef<MpvPlayerViewRef>(null);
  const user = useAtomValue(userAtom);
  const api = useAtomValue(apiAtom);
  const { t } = useTranslation();
  const navigation = useNavigation();
  const router = useRouter();
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
  const [showTechnicalInfo, setShowTechnicalInfo] = useState(false);

  // TV audio/subtitle selection state (tracks current selection for dynamic changes)
  const [currentAudioIndex, setCurrentAudioIndex] = useState<
    number | undefined
  >(undefined);
  const [currentSubtitleIndex, setCurrentSubtitleIndex] = useState<number>(-1);

  const progress = useSharedValue(0);
  const isSeeking = useSharedValue(false);
  const cacheProgress = useSharedValue(0);
  const VolumeManager = Platform.isTV
    ? null
    : require("react-native-volume-manager");

  const downloadUtils = useDownload();
  // Call directly instead of useMemo - the function reference doesn't change
  // when data updates, only when the provider initializes
  const downloadedFiles = downloadUtils.getDownloadedItems();

  // Inactivity timer controls (TV only)
  const { pauseInactivityTimer, resumeInactivityTimer } = useInactivity();

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
  } = useLocalSearchParams<{
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
  const initialSeekDoneRef = useRef(false);

  const initialPlaybackTicksRef = useRef<number>(
    playbackPositionFromUrl
      ? Number.parseInt(playbackPositionFromUrl, 10)
      : (item?.UserData?.PlaybackPositionTicks ?? 0),
  );
  const [downloadedItem, setDownloadedItem] = useState<DownloadedItem | null>(
    null,
  );
  const [itemStatus, setItemStatus] = useState({
    isLoading: true,
    isError: false,
  });

  // Playback manager for progress reporting and adjacent items
  const playbackManager = usePlaybackManager({ item, isOffline: offline });
  const { nextItem, previousItem } = playbackManager;

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

  // Initialize TV audio/subtitle indices from URL params.
  // No undefined guard: when a new episode's URL omits audioIndex, reset to
  // undefined (media default) rather than leaking the previous episode's track.
  useEffect(() => {
    setCurrentAudioIndex(audioIndex);
  }, [audioIndex]);

  useEffect(() => {
    setCurrentSubtitleIndex(subtitleIndex);
  }, [subtitleIndex]);

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
  // const getInitialPlaybackTicks = useCallback((): number => {
  //   if (playbackPositionFromUrl) {
  //     return Number.parseInt(playbackPositionFromUrl, 10);
  //   }
  //   return item?.UserData?.PlaybackPositionTicks ?? 0;
  // }, [playbackPositionFromUrl, item?.UserData?.PlaybackPositionTicks]);

  useEffect(() => {
    if (!tracksReady || !videoRef.current) return;
    if (initialSeekDoneRef.current) return;

    initialSeekDoneRef.current = true;

    const ticks = initialPlaybackTicksRef.current;

    if (ticks > 0) {
      videoRef.current.seekTo(ticksToSeconds(ticks));
    }
  }, [tracksReady]);

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
          // Guard against api being null (e.g., during logout)
          if (!api) {
            setItemStatus({ isLoading: false, isError: false });
            return;
          }
          const res = await getUserLibraryApi(api).getItem({
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
      setItem(null);
      setDownloadedItem(null);
      // Clear the previous episode's stream so the loader gate stays closed
      // until the new item's stream resolves (avoids a stale MPV source frame).
      setStream(null);
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
    requiredHttpHeaders?: Record<string, string>;
  }

  const [stream, setStream] = useState<Stream | null>(null);
  const [streamStatus, setStreamStatus] = useState({
    isLoading: true,
    isError: false,
  });

  // Ref to store the stream fetch function for refreshing subtitle tracks
  const refetchStreamRef = useRef<(() => Promise<Stream | null>) | null>(null);

  useEffect(() => {
    const fetchStreamData = async (): Promise<Stream | null> => {
      setStreamStatus({ isLoading: true, isError: false });
      try {
        // Don't attempt to fetch stream data if item is not available
        if (!item?.Id) {
          console.log("Item not loaded yet, skipping stream data fetch");
          setStreamStatus({ isLoading: false, isError: false });
          return null;
        }

        // Ensure item matches the current itemId to avoid race conditions
        if (item.Id !== itemId) {
          setStreamStatus({ isLoading: false, isError: false });
          return null;
        }

        let result: Stream | null = null;
        if (offline && downloadedItem?.mediaSource) {
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
            return null;
          }
          if (!user?.Id) {
            console.warn("User not authenticated for streaming");
            setStreamStatus({ isLoading: false, isError: true });
            return null;
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
          if (!res) return null;
          const { mediaSource, sessionId, url, requiredHttpHeaders } = res;

          if (!sessionId || !mediaSource || !url) {
            Alert.alert(
              t("player.error"),
              t("player.failed_to_get_stream_url"),
            );
            return null;
          }
          result = { mediaSource, sessionId, url, requiredHttpHeaders };
        }
        setStream(result);
        setStreamStatus({ isLoading: false, isError: false });
        return result;
      } catch (error) {
        console.error("Failed to fetch stream:", error);
        setStreamStatus({ isLoading: false, isError: true });
        return null;
      }
    };

    // Store the fetch function in ref for use by refresh handler
    refetchStreamRef.current = fetchStreamData;
    fetchStreamData();
  }, [
    itemId,
    mediaSourceId,
    bitrateValue,
    api,
    item,
    user?.Id,
    downloadedItem,
    offline,
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
    await getPlaystateApi(api).reportPlaybackStopped({
      playbackStopInfo: {
        ItemId: item.Id,
        MediaSourceId: mediaSourceId,
        PositionTicks: currentTimeInTicks,
        PlaySessionId: stream.sessionId,
      },
    });
  }, [api, item, mediaSourceId, stream, progress, offline]);

  const stop = useCallback(() => {
    // Update URL with final playback position before stopping
    router.setParams({
      playbackPosition: msToTicks(progress.get()).toString(),
    });
    reportPlaybackStopped();
    setIsPlaybackStopped(true);
    videoRef.current?.pause();
    revalidateProgressCache();
    // Resume inactivity timer when leaving player (TV only)
    resumeInactivityTimer();
  }, [videoRef, reportPlaybackStopped, progress, resumeInactivityTimer]);

  useEffect(() => {
    const beforeRemoveListener = navigation.addListener("beforeRemove", stop);
    return () => {
      reportPlaybackStopped();
      beforeRemoveListener();
    };
  }, [navigation, stop, reportPlaybackStopped]);

  const currentPlayStateInfo = useCallback(():
    | PlaybackProgressInfo
    | undefined => {
    if (!stream || !item?.Id) return;

    return {
      ItemId: item.Id,
      // Report the live selection so server-side session/resume state reflects
      // mid-playback track changes. Note: index 0 is valid (don't treat as
      // falsy); -1 means "off" and is reported as-is.
      AudioStreamIndex: currentAudioIndex,
      SubtitleStreamIndex: currentSubtitleIndex,
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
    currentAudioIndex,
    currentSubtitleIndex,
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

      const { position, cacheSeconds } = data.nativeEvent;
      // MPV reports position in seconds, convert to ms
      const currentTime = position * 1000;

      if (isBuffering) {
        setIsBuffering(false);
      }

      progress.set(currentTime);

      // Update cache progress (current position + buffered seconds ahead)
      if (cacheSeconds !== undefined && cacheSeconds > 0) {
        const cacheEnd = currentTime + cacheSeconds * 1000;
        cacheProgress.set(cacheEnd);
      }

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
      currentAudioIndex,
      currentSubtitleIndex,
      mediaSourceId,
      isPlaying,
      stream,
      isSeeking,
      isPlaybackStopped,
      isBuffering,
    ],
  );

  /** Prepare metadata for iOS native media controls (Control Center, Lock Screen) */
  const nowPlayingMetadata = useMemo(() => {
    if (!item || !api) return undefined;

    const artworkUri = getPrimaryImageUrl({
      api,
      item,
      quality: 90,
      width: 500,
    });

    return {
      title: item.Name || "",
      artist:
        item.Type === "Episode"
          ? item.SeriesName || ""
          : item.AlbumArtist || "",
      albumTitle:
        item.Type === "Episode" && item.SeasonName
          ? item.SeasonName
          : undefined,
      artworkUri: artworkUri || undefined,
    };
  }, [item, api]);

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
    const initialAudioId = getMpvAudioId(
      mediaSource,
      audioIndex,
      isTranscoding,
    );

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
      // Pass cache/buffer settings from user preferences
      cacheConfig: {
        enabled: settings.mpvCacheEnabled,
        cacheSeconds: settings.mpvCacheSeconds,
        maxBytes: settings.mpvDemuxerMaxBytes,
        maxBackBytes: settings.mpvDemuxerMaxBackBytes,
      },
      // Pass VO driver setting (Android only)
      voDriver: settings.mpvVoDriver,
    };

    // Add external subtitles only for online playback
    if (externalSubs && externalSubs.length > 0) {
      source.externalSubtitles = externalSubs;
    }

    // Add headers for online streaming (not for local file:// URLs)
    if (!offline) {
      const headers: Record<string, string> = {};
      const isRemoteStream =
        mediaSource?.IsRemote && mediaSource?.Protocol === "Http";

      // Add auth header only for Jellyfin API requests (not for external/remote streams)
      if (api?.accessToken && !isRemoteStream) {
        headers.Authorization = `MediaBrowser Token="${api.accessToken}"`;
      }

      // Add any required headers from the media source (e.g., for external/remote streams)
      if (stream?.requiredHttpHeaders) {
        Object.assign(headers, stream.requiredHttpHeaders);
      }

      if (Object.keys(headers).length > 0) {
        source.headers = headers;
      }
    }

    return source;
  }, [
    stream?.url,
    stream?.mediaSource,
    stream?.requiredHttpHeaders,
    item?.UserData?.PlaybackPositionTicks,
    playbackPositionFromUrl,
    api?.basePath,
    api?.accessToken,
    subtitleIndex,
    audioIndex,
    offline,
    settings.mpvCacheEnabled,
    settings.mpvCacheSeconds,
    settings.mpvDemuxerMaxBytes,
    settings.mpvDemuxerMaxBackBytes,
    settings.mpvVoDriver,
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
        // Pause inactivity timer during playback (TV only)
        pauseInactivityTimer();
        if (item?.Id) {
          playbackManager.reportPlaybackProgress(
            currentPlayStateInfo() as PlaybackProgressInfo,
          );
        }
        await activateKeepAwakeAsync();
        return;
      }

      if (isPaused) {
        setIsPlaying(false);
        // Resume inactivity timer when paused (TV only)
        resumeInactivityTimer();
        if (item?.Id) {
          playbackManager.reportPlaybackProgress(
            currentPlayStateInfo() as PlaybackProgressInfo,
          );
        }
        await deactivateKeepAwake();
        return;
      }

      if (isLoading !== undefined) {
        setIsBuffering(isLoading);
      }
    },
    [
      playbackManager,
      item?.Id,
      progress,
      pauseInactivityTimer,
      resumeInactivityTimer,
    ],
  );

  const _onPictureInPictureChange = useCallback(
    (e: { nativeEvent: { isActive: boolean } }) => {
      const { isActive } = e.nativeEvent;
      setIsPipMode(isActive);
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
    // Hide controls BEFORE entering PiP so the window captures a clean view
    _setShowControls(false);
    setIsPipMode(true);
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

  // TV audio track change handler
  const handleAudioIndexChange = useCallback(
    async (index: number) => {
      setCurrentAudioIndex(index);

      // Check if we're transcoding
      const isTranscoding = Boolean(stream?.mediaSource?.TranscodingUrl);

      // Convert Jellyfin index to MPV track ID
      const mpvTrackId = getMpvAudioId(
        stream?.mediaSource,
        index,
        isTranscoding,
      );

      if (mpvTrackId !== undefined) {
        await videoRef.current?.setAudioTrack?.(mpvTrackId);
      }
    },
    [stream?.mediaSource],
  );

  // TV subtitle track change handler
  const handleSubtitleIndexChange = useCallback(
    async (index: number) => {
      setCurrentSubtitleIndex(index);

      // Check if we're transcoding
      const isTranscoding = Boolean(stream?.mediaSource?.TranscodingUrl);

      if (index === -1) {
        // Disable subtitles
        await videoRef.current?.disableSubtitles?.();
      } else {
        // Convert Jellyfin index to MPV track ID
        const mpvTrackId = getMpvSubtitleId(
          stream?.mediaSource,
          index,
          isTranscoding,
        );

        if (mpvTrackId !== undefined && mpvTrackId !== -1) {
          await videoRef.current?.setSubtitleTrack?.(mpvTrackId);
        }
      }
    },
    [stream?.mediaSource],
  );

  // Technical info toggle handler
  const handleToggleTechnicalInfo = useCallback(() => {
    setShowTechnicalInfo((prev) => !prev);
  }, []);

  // Get technical info from the player
  const getTechnicalInfo = useCallback(async () => {
    return (await videoRef.current?.getTechnicalInfo?.()) ?? {};
  }, []);

  // Determine play method based on stream URL and media source
  const playMethod = useMemo<
    "DirectPlay" | "DirectStream" | "Transcode" | undefined
  >(() => {
    if (!stream?.url) return undefined;

    // Check if transcoding (m3u8 playlist or TranscodingUrl present)
    if (stream.url.includes("m3u8") || stream.mediaSource?.TranscodingUrl) {
      return "Transcode";
    }

    // Check if direct play (no container remuxing needed)
    // Direct play means the file is being served as-is
    if (stream.url.includes("/Videos/") && stream.url.includes("/stream")) {
      return "DirectStream";
    }

    // Default to direct play if we're not transcoding
    return "DirectPlay";
  }, [stream?.url, stream?.mediaSource?.TranscodingUrl]);

  // Extract transcode reasons from the TranscodingUrl
  const transcodeReasons = useMemo<string[]>(() => {
    const transcodingUrl = stream?.mediaSource?.TranscodingUrl;
    if (!transcodingUrl) return [];

    try {
      // Parse the TranscodeReasons parameter from the URL
      const url = new URL(transcodingUrl, "http://localhost");
      const reasons = url.searchParams.get("TranscodeReasons");
      if (reasons) {
        return reasons.split(",").filter(Boolean);
      }
    } catch {
      // If URL parsing fails, try regex fallback
      const match = transcodingUrl.match(/TranscodeReasons=([^&]+)/);
      if (match) {
        return match[1].split(",").filter(Boolean);
      }
    }
    return [];
  }, [stream?.mediaSource?.TranscodingUrl]);

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

  // TV: Navigate to previous item
  const goToPreviousItem = useCallback(() => {
    if (!previousItem || !settings) return;

    const {
      mediaSource: newMediaSource,
      audioIndex: defaultAudioIndex,
      subtitleIndex: defaultSubtitleIndex,
    } = getDefaultPlaySettings(previousItem, settings, {
      indexes: {
        // Use the live selection, not the stale URL params (see goToNextItem).
        subtitleIndex: currentSubtitleIndex,
        audioIndex: currentAudioIndex,
      },
      source: stream?.mediaSource ?? undefined,
    });

    const queryParams = new URLSearchParams({
      itemId: previousItem.Id ?? "",
      audioIndex: defaultAudioIndex?.toString() ?? "",
      subtitleIndex: defaultSubtitleIndex?.toString() ?? "",
      mediaSourceId: newMediaSource?.Id ?? "",
      bitrateValue: bitrateValue?.toString() ?? "",
      playbackPosition:
        previousItem.UserData?.PlaybackPositionTicks?.toString() ?? "",
    }).toString();

    router.replace(`player/direct-player?${queryParams}` as any);
  }, [
    previousItem,
    settings,
    currentSubtitleIndex,
    currentAudioIndex,
    stream?.mediaSource,
    bitrateValue,
    router,
  ]);

  // TV: Add subtitle file to player (for client-side downloaded subtitles)
  const addSubtitleFile = useCallback(async (path: string) => {
    await videoRef.current?.addSubtitleFile?.(path, true);
  }, []);

  // TV: Refresh subtitle tracks after server-side subtitle download
  // Re-fetches the media source to pick up newly downloaded subtitles
  const handleRefreshSubtitleTracks = useCallback(async (): Promise<
    MediaStream[]
  > => {
    if (!refetchStreamRef.current) return [];

    const newStream = await refetchStreamRef.current();

    // Check if component is still mounted before updating state
    // This callback may be invoked from a modal after the player unmounts
    if (!isMounted) return [];

    if (newStream) {
      setStream(newStream);
      return (
        newStream.mediaSource?.MediaStreams?.filter(
          (s) => s.Type === "Subtitle",
        ) ?? []
      );
    }
    return [];
  }, [isMounted]);

  // TV: Navigate to next item
  const goToNextItem = useCallback(() => {
    if (!nextItem || !settings || isPlaybackStopped) return;

    const {
      mediaSource: newMediaSource,
      audioIndex: defaultAudioIndex,
      subtitleIndex: defaultSubtitleIndex,
    } = getDefaultPlaySettings(nextItem, settings, {
      indexes: {
        // Use the live selection (updated when the user changes tracks
        // mid-playback), not the stale URL params the episode started with.
        subtitleIndex: currentSubtitleIndex,
        audioIndex: currentAudioIndex,
      },
      source: stream?.mediaSource ?? undefined,
    });

    const queryParams = new URLSearchParams({
      itemId: nextItem.Id ?? "",
      audioIndex: defaultAudioIndex?.toString() ?? "",
      subtitleIndex: defaultSubtitleIndex?.toString() ?? "",
      mediaSourceId: newMediaSource?.Id ?? "",
      bitrateValue: bitrateValue?.toString() ?? "",
      playbackPosition:
        nextItem.UserData?.PlaybackPositionTicks?.toString() ?? "",
    }).toString();

    router.replace(`player/direct-player?${queryParams}` as any);
  }, [
    nextItem,
    settings,
    currentSubtitleIndex,
    currentAudioIndex,
    stream?.mediaSource,
    bitrateValue,
    router,
    isPlaybackStopped,
  ]);

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
      // Apply subtitle background (iOS only - doesn't work on tvOS due to composite OSD limitation)
      // mpv uses #RRGGBBAA format (alpha last, same as CSS)
      if (settings.mpvSubtitleBackgroundEnabled) {
        const opacity = settings.mpvSubtitleBackgroundOpacity ?? 75;
        const alphaHex = Math.round((opacity / 100) * 255)
          .toString(16)
          .padStart(2, "0")
          .toUpperCase();
        // Enable background-box mode (required for sub-back-color to work)
        await videoRef.current?.setSubtitleBorderStyle?.("background-box");
        await videoRef.current?.setSubtitleBackgroundColor?.(
          `#000000${alphaHex}`,
        );
        // Force override ASS subtitle styles so background shows on styled subtitles
        await videoRef.current?.setSubtitleAssOverride?.("force");
      } else {
        // Restore default outline-and-shadow style
        await videoRef.current?.setSubtitleBorderStyle?.("outline-and-shadow");
        await videoRef.current?.setSubtitleBackgroundColor?.("#00000000");
        // Restore default ASS behavior (keep original styles)
        await videoRef.current?.setSubtitleAssOverride?.("no");
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

  // TV only: Pre-load locally downloaded subtitles when video loads
  // This adds them to MPV's track list without auto-selecting them
  useEffect(() => {
    if (!Platform.isTV || !isVideoLoaded || !videoRef.current || !itemId)
      return;

    const preloadLocalSubtitles = async () => {
      const localSubs = getSubtitlesForItem(itemId);
      for (const sub of localSubs) {
        // Verify file still exists (cache may have been cleared)
        const subtitleFile = new File(sub.filePath);
        if (!subtitleFile.exists) {
          continue;
        }
        // Add subtitle file to MPV without selecting it (select: false)
        await videoRef.current?.addSubtitleFile?.(sub.filePath, false);
      }
    };

    preloadLocalSubtitles();
  }, [isVideoLoaded, itemId]);

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
    <OfflineModeProvider isOffline={offline}>
      <PlayerProvider
        playerRef={videoRef}
        item={item}
        mediaSource={stream?.mediaSource}
        isVideoLoaded={isVideoLoaded}
        tracksReady={tracksReady}
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
                nowPlayingMetadata={nowPlayingMetadata}
                onProgress={onProgress}
                onPlaybackStateChange={onPlaybackStateChanged}
                onPictureInPictureChange={_onPictureInPictureChange}
                onLoad={() => setIsVideoLoaded(true)}
                onError={(e: { nativeEvent: MpvOnErrorEventPayload }) => {
                  console.error("Video Error:", e.nativeEvent);
                  Alert.alert(
                    t("player.error"),
                    t("player.an_error_occurred_while_playing_the_video"),
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
            {isMounted === true &&
              item &&
              !isPipMode &&
              (Platform.isTV ? (
                <TVControls
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
                  play={play}
                  pause={pause}
                  seek={seek}
                  audioIndex={currentAudioIndex}
                  subtitleIndex={currentSubtitleIndex}
                  onAudioIndexChange={handleAudioIndexChange}
                  onSubtitleIndexChange={handleSubtitleIndexChange}
                  previousItem={previousItem}
                  nextItem={nextItem}
                  goToPreviousItem={goToPreviousItem}
                  goToNextItem={goToNextItem}
                  onRefreshSubtitleTracks={handleRefreshSubtitleTracks}
                  addSubtitleFile={addSubtitleFile}
                  showTechnicalInfo={showTechnicalInfo}
                  onToggleTechnicalInfo={handleToggleTechnicalInfo}
                  getTechnicalInfo={getTechnicalInfo}
                  playMethod={playMethod}
                  transcodeReasons={transcodeReasons}
                  downloadedFiles={downloadedFiles}
                />
              ) : (
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
                  aspectRatio={aspectRatio}
                  isZoomedToFill={isZoomedToFill}
                  onZoomToggle={handleZoomToggle}
                  api={api}
                  downloadedFiles={downloadedFiles}
                  playbackSpeed={currentPlaybackSpeed}
                  setPlaybackSpeed={handleSetPlaybackSpeed}
                  showTechnicalInfo={showTechnicalInfo}
                  onToggleTechnicalInfo={handleToggleTechnicalInfo}
                  getTechnicalInfo={getTechnicalInfo}
                  playMethod={playMethod}
                  transcodeReasons={transcodeReasons}
                />
              ))}
          </View>
        </VideoProvider>
      </PlayerProvider>
    </OfflineModeProvider>
  );
}

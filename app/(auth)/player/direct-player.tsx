import {
  type BaseItemDto,
  type MediaSourceInfo,
  type MediaStream,
  PlaybackOrder,
  PlaybackProgressInfo,
  RepeatMode,
} from "@jellyfin/sdk/lib/generated-client";
import {
  getMediaInfoApi,
  getPlaystateApi,
  getUserLibraryApi,
} from "@jellyfin/sdk/lib/utils/api";
import { File } from "expo-file-system";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { useLocalSearchParams, useNavigation } from "expo-router";
import { useAtomValue } from "jotai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Alert,
  PixelRatio,
  Platform,
  useWindowDimensions,
  View,
} from "react-native";
import { useAnimatedReaction, useSharedValue } from "react-native-reanimated";
import { BITRATES } from "@/components/BitrateSelector";
import { Text } from "@/components/common/Text";
import { Loader } from "@/components/Loader";
import { AutoSubtitleNotice } from "@/components/video-player/controls/AutoSubtitleNotice";
import { Controls } from "@/components/video-player/controls/Controls";
import { Controls as TVControls } from "@/components/video-player/controls/Controls.tv";
import { PlayerProvider } from "@/components/video-player/controls/contexts/PlayerContext";
import { VideoProvider } from "@/components/video-player/controls/contexts/VideoContext";
import {
  useAutoSubtitlesOnMute,
  useMuteState,
} from "@/components/video-player/controls/hooks";
import {
  PlaybackSpeedScope,
  updatePlaybackSpeedSettings,
} from "@/components/video-player/controls/utils/playback-speed-settings";
import { VideoPlayerView } from "@/components/video-player/VideoPlayerView";
import useRouter from "@/hooks/useAppRouter";
import { useHaptic } from "@/hooks/useHaptic";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { useOrientation } from "@/hooks/useOrientation";
import { usePlaybackManager } from "@/hooks/usePlaybackManager";
import usePlaybackSpeed from "@/hooks/usePlaybackSpeed";
import { useInvalidatePlaybackProgressCache } from "@/hooks/useRevalidatePlaybackProgressCache";
import { useWebSocket } from "@/hooks/useWebsockets";
import {
  type MpvOnErrorEventPayload,
  type MpvOnPlaybackStateChangePayload,
  type MpvOnProgressEventPayload,
  type MpvPlayerViewRef,
  type MpvVideoSource,
} from "@/modules";
import { useDownload } from "@/providers/DownloadProvider";
import { DownloadedItem } from "@/providers/Downloads/types";
import { useInactivity } from "@/providers/InactivityProvider";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { OfflineModeProvider } from "@/providers/OfflineModeProvider";
import { getSubtitlesForItem } from "@/utils/atoms/downloadedSubtitles";
import { getActivePlayerType, useSettings } from "@/utils/atoms/settings";
import { getJellyfinHeadersForUrl } from "@/utils/customHeaders";
import { isExpectedError } from "@/utils/errors";
import { getDefaultPlaySettings } from "@/utils/jellyfin/getDefaultPlaySettings";
import { getPrimaryImageUrl } from "@/utils/jellyfin/image/getPrimaryImageUrl";
import { getStreamUrl } from "@/utils/jellyfin/media/getStreamUrl";
import {
  getPlayMethod,
  type PlayMethod,
  parseTranscodeReasons,
} from "@/utils/jellyfin/playMethod";
import {
  applyMpvSubtitleSelection,
  getExternalSubtitleUrl,
  getMpvAudioId,
  isImageBasedSubtitle,
} from "@/utils/jellyfin/subtitleUtils";
import { logAndCaptureError, writeToLog } from "@/utils/log";
import {
  getEffectiveSubtitleMarginY,
  getEffectiveSubtitleScale,
} from "@/utils/subtitles";
import {
  isLocalSubtitleIndex,
  localSubtitleIndex,
  toServerSubtitleIndex,
} from "@/utils/subtitles/subtitleIndex";
import {
  applySubtitleStyle,
  buildSubtitleStyle,
} from "@/utils/subtitles/subtitleStyle";
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
  // Mirror of isPlaybackStopped that is already set when a report is built.
  // The MPV view keeps the onProgress it was last rendered with, so a tick
  // already in flight when the user leaves would still report progress after
  // the "stopped" report and bring the session back on the server.
  const isPlaybackStoppedRef = useRef(false);
  const markPlaybackStopped = useCallback(() => {
    isPlaybackStoppedRef.current = true;
    setIsPlaybackStopped(true);
  }, []);
  const [showControls, _setShowControls] = useState(true);
  const [isPipMode, setIsPipMode] = useState(false);
  const [aspectRatio] = useState<"default" | "16:9" | "4:3" | "1:1" | "21:9">(
    "default",
  );
  const [isZoomedToFill, setIsZoomedToFill] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  // Mirror of isPlaying that is already correct when a report is built.
  // setIsPlaying only applies on the next render, so an MPV progress tick that
  // was already in flight when the user paused would carry the pre-transition
  // value, and MPV stops ticking while paused, so nothing would correct it.
  const isPlayingRef = useRef(false);
  const setPlaying = useCallback((playing: boolean) => {
    isPlayingRef.current = playing;
    setIsPlaying(playing);
  }, []);
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

  // Device output volume plus the player's own mute, combined. Reported to the
  // server and consumed by the automatic subtitle feature below.
  const { isMuted, toggleMute, reapplyPlayerMute } = useMuteState({
    playerRef: videoRef,
  });

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

  /** Position MPV is told to start from: the URL param wins, since it is
   * rewritten during playback, otherwise the item's stored resume position.
   * The route is deep-linkable, so the param is parsed whole rather than by
   * prefix: parseInt would turn "1200invalid" into a position instead of
   * falling back, and NaN would reach getStreamUrl and MPV. */
  const startTicks = useMemo(() => {
    const raw = playbackPositionFromUrl?.trim();
    const fromUrl = raw ? Number(raw) : Number.NaN;
    return Number.isInteger(fromUrl) && fromUrl >= 0
      ? fromUrl
      : (item?.UserData?.PlaybackPositionTicks ?? 0);
  }, [playbackPositionFromUrl, item?.UserData?.PlaybackPositionTicks]);

  // Pinned on mount: the initial seek must not follow the position the player
  // writes back into the URL every 30s. Zero here is not a missed resume:
  // PlayButton always passes playbackPosition, and when it is absent the
  // resume still happens through the stream offset and MPV's startPosition,
  // which read startTicks after the item has loaded.
  const initialPlaybackTicksRef = useRef<number>(startTicks);

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
  const { isConnected } = useNetworkStatus();

  // usePlaybackManager returns a new object on every render, so the reporters
  // below cannot list it as a dependency without being rebuilt constantly.
  // Mirror the progress reporter instead: it closes over connectivity and the
  // api, and a handler captured while either was different would keep
  // reporting through the stale one for the rest of playback.
  const reportProgressRef = useRef(playbackManager.reportPlaybackProgress);
  useEffect(() => {
    reportProgressRef.current = playbackManager.reportPlaybackProgress;
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

  // Speed held during a long press. Applied to the player only, so it is
  // never written to the per media or per show settings
  const speedBeforeHoldRef = useRef<number | null>(null);

  // Handler for changing playback speed
  const handleSetPlaybackSpeed = useCallback(
    async (speed: number, scope: PlaybackSpeedScope) => {
      // A deliberate speed choice wins over a transient hold
      speedBeforeHoldRef.current = null;

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

  const handleHoldSpeedStart = useCallback(async () => {
    if (speedBeforeHoldRef.current !== null) return;
    speedBeforeHoldRef.current = currentPlaybackSpeed;
    await videoRef.current?.setSpeed?.(settings?.holdToSpeedRate ?? 2.0);
  }, [currentPlaybackSpeed, settings?.holdToSpeedRate]);

  const handleHoldSpeedEnd = useCallback(async () => {
    const previousSpeed = speedBeforeHoldRef.current;
    if (previousSpeed === null) return;
    speedBeforeHoldRef.current = null;
    await videoRef.current?.setSpeed?.(previousSpeed);
  }, []);

  // A new item applies its own speed, so a release afterwards must not
  // restore the previous item's
  useEffect(() => {
    speedBeforeHoldRef.current = null;
  }, [item?.Id]);

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
        logAndCaptureError("Failed to fetch item for player", error, {
          offline,
        });
        setItemStatus({ isLoading: false, isError: true });
      }
    };

    if (itemId) {
      setItem(null);
      setDownloadedItem(null);
      // Clear the previous episode's stream so the loader gate stays closed
      // until the new item's stream resolves (avoids a stale MPV source frame).
      setTracksReady(false);
      setStream(null);
      // Scope the started flag and the position to the item being played. The
      // component is reused across an in-place item switch, and both are read
      // by the progress report below: left as-is, the new item is reported at
      // the previous one's position before its own playback has even started.
      setHasPlaybackStarted(false);
      progress.set(0);
      fetchItemData();
    }
  }, [itemId, offline, api, user?.Id, progress]);

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

  // Live TV opens a server-side live stream via autoOpenLiveStream. If it is
  // never closed, Jellyfin's M3U tuner limit fills up and every channel then
  // fails with "simultaneous stream limit has been reached". reportPlaybackStopped
  // handles a clean stop, but a channel switch (the player re-fetches in place)
  // or an unmount after an error bypass it, so track the open live stream and
  // release it on those paths too.
  const apiRef = useRef(api);
  useEffect(() => {
    apiRef.current = api;
  }, [api]);

  // Read connectivity without making it a dependency of the start report: a
  // network flap mid-playback would otherwise fire a second PlaybackStart and
  // move the server session back to the position playback began at.
  const isConnectedRef = useRef(isConnected);
  useEffect(() => {
    isConnectedRef.current = isConnected;
  }, [isConnected]);

  // The item the player is on as of the last commit. The MPV view holds the
  // callbacks it was last rendered with, and on an in-place switch those close
  // over the outgoing item for both the loaded item and the route param, so
  // they agree with each other and pass a comparison between the two.
  const currentItemIdRef = useRef(itemId);
  useEffect(() => {
    currentItemIdRef.current = itemId;
  }, [itemId]);

  const releaseLiveStream = useCallback(
    (liveStreamId: string | null) => {
      if (!liveStreamId || !apiRef.current || offline) return;
      // Best effort: a failed close must not break teardown, and the slot is
      // also freed by the server's reap as a backstop.
      getMediaInfoApi(apiRef.current)
        .closeLiveStream({ liveStreamId })
        .catch(() => {});
    },
    [offline],
  );

  // The effect cleanup releases the live stream both when it changes (channel
  // switch, which re-runs the effect) and when the player unmounts, so no
  // manual previous-id tracking is needed.
  useEffect(() => {
    const liveStreamId = stream?.mediaSource?.LiveStreamId ?? null;
    return () => releaseLiveStream(liveStreamId);
  }, [stream?.mediaSource?.LiveStreamId, releaseLiveStream]);

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

          const res = await getStreamUrl({
            api,
            item,
            startTimeTicks: startTicks,
            userId: user.Id,
            audioStreamIndex: audioIndex,
            maxStreamingBitrate: bitrateValue,
            mediaSourceId: mediaSourceId,
            subtitleStreamIndex: subtitleIndex,
            // Match the device profile to the player that will render the
            // stream so the server picks a codec/container the player can
            // actually decode.
            deviceProfile: generateDeviceProfile({
              player: getActivePlayerType(settings),
              audioMode: settings.audioTranscodeMode,
            }),
          });
          if (!res) {
            // Without flipping isError this path used to leave the loading
            // spinner up forever.
            logAndCaptureError("getStreamUrl returned no stream", null, {
              itemType: item.Type,
              player: getActivePlayerType(settings),
            });
            setStreamStatus({ isLoading: false, isError: true });
            return null;
          }
          const { mediaSource, sessionId, url, requiredHttpHeaders } = res;

          if (!sessionId || !mediaSource || !url) {
            logAndCaptureError("Stream response incomplete", null, {
              itemType: item.Type,
              player: getActivePlayerType(settings),
              hasSessionId: !!sessionId,
              hasMediaSource: !!mediaSource,
              hasUrl: !!url,
            });
            Alert.alert(
              t("player.error"),
              t("player.failed_to_get_stream_url"),
            );
            setStreamStatus({ isLoading: false, isError: true });
            return null;
          }
          result = { mediaSource, sessionId, url, requiredHttpHeaders };
        }
        setTracksReady(false);
        setStream(result);
        setStreamStatus({ isLoading: false, isError: false });
        return result;
      } catch (error) {
        logAndCaptureError("Failed to fetch stream", error, {
          itemType: item?.Type,
          player: getActivePlayerType(settings),
          offline,
        });
        if (isExpectedError(error)) {
          // The server itself declined to produce a stream (NoCompatibleStream
          // and friends): say so instead of only flipping the error state.
          Alert.alert(t("player.error"), t("player.failed_to_get_stream_url"));
        }
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
    // Gate on connectivity rather than on the offline flag: a downloaded item
    // played with the server reachable still reports progress and, since the
    // stop report is connectivity-based too, would otherwise close a session
    // it never opened, which the server's playback history then discards.
    if (!stream || !api || !isConnectedRef.current) return;
    const reportPlaybackStart = async () => {
      const progressInfo = currentPlayStateInfo();
      if (progressInfo) {
        await getPlaystateApi(api).reportPlaybackStart({
          playbackStartInfo: {
            ...progressInfo,
            // This runs once the stream resolves, before MPV has produced a
            // frame: the live state still says paused at 0:00. The source is
            // built with autoplay, so describe the session that is starting
            // instead, or the dashboard shows "paused at 0:00" until the first
            // progress tick.
            IsPaused: false,
            PositionTicks: startTicks,
          },
        });
      }
    };
    // Fire-and-forget, so swallow instead of leaving an unhandled rejection
    // whenever the server is unreachable at the moment playback starts.
    reportPlaybackStart().catch((error) => {
      writeToLog(
        "ERROR",
        "reportPlaybackStart failed",
        error instanceof Error ? error.message : String(error),
      );
    });
    // startTicks is read, not depended on: it is rewritten into the URL every
    // 30s during playback, and re-running this would report a new playback
    // start each time.
  }, [stream, api]);

  const togglePlay = async () => {
    lightHapticFeedback();
    // Read the ref so two taps inside one render cycle don't both see the same
    // stale state and cancel each other out.
    const wasPlaying = isPlayingRef.current;
    setPlaying(!wasPlaying);
    if (wasPlaying) {
      await videoRef.current?.pause();
    } else {
      videoRef.current?.play();
    }
  };

  // Key of the last "stopped" report, to dedupe the double teardown. The
  // PlaySessionId when there is one, the item id otherwise (see stopKey below).
  const reportedStopKeyRef = useRef<string | null>(null);

  const reportPlaybackStopped = useCallback(async () => {
    if (!item?.Id || !stream || !api || !isConnected) return;
    // Leaving the player reports "stopped" twice: once from the beforeRemove
    // listener (via stop()) and once from the unmount cleanup backstop. Dedupe
    // per session — not a plain boolean, since the component survives in-place
    // item switches and the next session must report again. Downloaded items
    // have no PlaySessionId, so fall back to the item id.
    const stopKey = stream.sessionId || item.Id;
    if (reportedStopKeyRef.current === stopKey) return;
    reportedStopKeyRef.current = stopKey;
    const currentTimeInTicks = msToTicks(progress.get());
    try {
      await getPlaystateApi(api).reportPlaybackStopped({
        playbackStopInfo: {
          ItemId: item.Id,
          MediaSourceId: mediaSourceId,
          PositionTicks: currentTimeInTicks,
          PlaySessionId: stream.sessionId || undefined,
          // Release the server-side live stream (and its tuner slot) on stop.
          // Jellyfin only closes a live stream opened via autoOpenLiveStream when
          // the stop report carries its LiveStreamId; without it the stream leaks
          // and Live TV eventually fails for everyone with "M3U simultaneous
          // stream limit has been reached". Undefined for non-live items (no-op).
          LiveStreamId: stream.mediaSource?.LiveStreamId ?? undefined,
        },
      });
    } catch (error) {
      // Un-mark the session so a later teardown path can retry: e.g. a failed
      // report from a WebSocket remote-stop (player still mounted) must not
      // suppress the report when the user then navigates away. Callers are
      // fire-and-forget, so swallow instead of rethrowing unhandled.
      if (reportedStopKeyRef.current === stopKey) {
        reportedStopKeyRef.current = null;
      }
      writeToLog(
        "ERROR",
        "reportPlaybackStopped failed",
        error instanceof Error ? error.message : String(error),
      );
    }
  }, [api, item, mediaSourceId, stream, progress, isConnected]);

  const stop = useCallback(() => {
    // Update URL with final playback position before stopping
    router.setParams({
      playbackPosition: msToTicks(progress.get()).toString(),
    });
    reportPlaybackStopped();
    markPlaybackStopped();
    // Synchronously destroy the mpv instance + decoder + surface buffers
    // BEFORE the screen unmounts. Otherwise the next screen (or the next
    // episode's player) mounts while the old 4K decoder is still alive,
    // causing OOM on low-RAM devices. Native stop() is idempotent so the
    // later React unmount cleanup is still safe.
    videoRef.current?.destroy().catch(() => {});
    // Pre-libmpv-1.0 used `stop()`:
    // videoRef.current?.stop();
    revalidateProgressCache();
    // Resume inactivity timer when leaving player (TV only)
    resumeInactivityTimer();
    // Release the keep-awake wakelock acquired during playback so it
    // doesn't follow us back to the home screen and block the TV
    // screensaver. activateKeepAwakeAsync() is tag-scoped to this module
    // and only released on the "paused" event; without this, navigating
    // away mid-play leaves FLAG_KEEP_SCREEN_ON set on the window.
    deactivateKeepAwake();
  }, [
    videoRef,
    reportPlaybackStopped,
    markPlaybackStopped,
    progress,
    resumeInactivityTimer,
  ]);

  // Keep refs to the latest stop / stopped-report so the effects below don't
  // need these churning callbacks in their dependency arrays. Reporting
  // "stopped" from an effect cleanup that re-runs during playback (e.g. when
  // the 30s router.setParams position write mutates navigation state) caused a
  // spurious PlaybackStopped every URL_UPDATE_INTERVAL.
  const stopRef = useRef(stop);
  const reportPlaybackStoppedRef = useRef(reportPlaybackStopped);

  useEffect(() => {
    stopRef.current = stop;
    reportPlaybackStoppedRef.current = reportPlaybackStopped;
  }, [stop, reportPlaybackStopped]);

  // Report playback stopped only on a real source switch or unmount.
  // itemId (the route param) is listed alongside the loaded item so the report
  // runs in the same commit as an in-place switch, before the effect that
  // resets the shared position for the incoming item: keyed on item.Id alone,
  // the report could land a commit later and carry a position of zero.
  useEffect(() => {
    return () => {
      reportPlaybackStoppedRef.current();
    };
  }, [itemId, item?.Id, stream?.sessionId, mediaSourceId]);

  // Stop on navigation-away. Re-subscribing when the navigation object identity
  // changes (e.g. after a setParams) no longer reports anything on its own.
  useEffect(() => {
    const beforeRemoveListener = navigation.addListener("beforeRemove", () =>
      stopRef.current(),
    );
    return () => {
      beforeRemoveListener();
    };
  }, [navigation]);

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
      // Read through the ref, not the isPlaying state: this is called from
      // handlers that may have been created before the last transition, and a
      // report must describe the state at the moment it is built.
      IsPaused: !isPlayingRef.current,
      PlayMethod: getPlayMethod(stream, offline),
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
    isMuted,
    offline,
  ]);

  // Report after the state commits. Deliberately excludes playbackManager:
  // usePlaybackManager returns a new object every render, which would fire this
  // on every render.
  useEffect(() => {
    if (!item?.Id || !stream || !hasPlaybackStarted) return;
    // Destroying the player emits a last paused event, which lands here: read
    // the ref so the transition report doesn't follow the "stopped" report.
    if (isPlaybackStoppedRef.current) return;
    // currentPlayStateInfo() returns undefined without a stream, and
    // reportPlaybackProgress dereferences its argument immediately. Read it
    // instead of casting so a gap between the item and its stream can't reject.
    const progressInfo = currentPlayStateInfo();
    if (!progressInfo) return;
    void reportProgressRef.current(progressInfo);
    // isPlaying is what makes a transition land here: currentPlayStateInfo now
    // reads the play state through a ref, so its identity no longer changes
    // when the user pauses or resumes.
  }, [currentPlayStateInfo, isPlaying, item?.Id, stream, hasPlaybackStarted]);

  const lastUrlUpdateTime = useSharedValue(0);
  const lastProgressReportTime = useSharedValue(0);
  const wasJustSeeking = useSharedValue(false);
  const URL_UPDATE_INTERVAL = 30000; // Update URL every 30 seconds instead of every second
  // Heartbeat cadence for the periodic progress report. MPV ticks once a
  // second, but the server only needs the position often enough for Now
  // Playing and resume: state changes (pause, resume, track, mute) are
  // reported on their own by the effect above, and a seek reports immediately.
  const PROGRESS_REPORT_INTERVAL = 10000;

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
      if (isSeeking.get() || isPlaybackStoppedRef.current) return;

      // An in-place episode switch clears the stream and resets the position
      // while MPV can still emit one last tick for the previous episode.
      // Bail before touching shared state: writing that position into the URL
      // would make it the next episode's start position, and reporting it
      // after the switch already reported "stopped" would put the outgoing
      // episode back in the server session.
      if (!item?.Id || item.Id !== itemId || !stream) return;
      if (item.Id !== currentItemIdRef.current) return;

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

      // Reporting every tick meant one request per second per player, and for
      // a downloaded item the whole downloads database was serialized and
      // written to storage on each one (plus two query invalidations). Report
      // right after a seek, since the position jumped, otherwise heartbeat.
      const shouldReportProgress =
        shouldUpdateUrl ||
        now - lastProgressReportTime.get() >= PROGRESS_REPORT_INTERVAL;
      if (!shouldReportProgress) return;
      lastProgressReportTime.value = now;

      const progressInfo = currentPlayStateInfo();
      if (!progressInfo) return;
      void reportProgressRef.current(progressInfo);
    },
    [
      // Depend on the builder itself rather than re-listing what it reads: it
      // also covers the mute state, which this list used to miss.
      currentPlayStateInfo,
      item?.Id,
      itemId,
      currentAudioIndex,
      currentSubtitleIndex,
      mediaSourceId,
      stream,
      isSeeking,
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
      artworkHeaders: getJellyfinHeadersForUrl(artworkUri, api.basePath),
    };
  }, [item, api]);

  /** Build video source config for MPV */
  const videoSource = useMemo<MpvVideoSource | undefined>(() => {
    if (!stream?.url) return undefined;

    const mediaSource = stream.mediaSource;
    const isTranscoding = Boolean(mediaSource?.TranscodingUrl);

    // Get external subtitle URLs — getExternalSubtitleUrl is the shared source
    // of truth with identity matching (online: basePath + DeliveryUrl unless
    // IsExternalUrl; offline: local file path stored in DeliveryUrl).
    const externalSubs = mediaSource?.MediaStreams?.filter(
      (s) => s.Type === "Subtitle" && s.DeliveryMethod === "External",
    )
      .map((s) =>
        getExternalSubtitleUrl(s, { offline, basePath: api?.basePath }),
      )
      .filter((u): u is string => !!u);

    // Audio maps positionally (audio tracks aren't reordered or hidden like
    // subtitles). The subtitle selection is applied later, once MPV's real track
    // list is known — see applySubtitleSelection / onTracksReady.
    const initialAudioId = getMpvAudioId(
      mediaSource,
      audioIndex,
      isTranscoding,
    );

    const startPos = ticksToSeconds(startTicks);

    // Build source config - headers only needed for online streaming
    const source: MpvVideoSource = {
      url: stream.url,
      startPosition: startPos,
      autoplay: true,
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

      // Custom proxy auth headers, but only when the stream really comes from
      // the Jellyfin server: MPV applies headers to every request it makes, so
      // sending them with a remote/external stream would leak them.
      Object.assign(
        headers,
        getJellyfinHeadersForUrl(stream.url, api?.basePath) ?? {},
      );

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
    startTicks,
    api?.basePath,
    api?.accessToken,
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
  // Mutes the player, not the device. The previous implementation zeroed the
  // system volume and kept the old value in component state, so leaving the
  // player while muted stranded the device at zero with nothing to restore it.
  // VolumeUp/VolumeDown/SetVolume below still drive the system volume.
  const toggleMuteCb = useCallback(async () => {
    toggleMute();
  }, [toggleMute]);

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
        setPlaying(true);
        setIsBuffering(false);
        setHasPlaybackStarted(true);
        // Pause inactivity timer during playback (TV only)
        pauseInactivityTimer();
        await activateKeepAwakeAsync();
        return;
      }

      if (isPaused) {
        setPlaying(false);
        // Resume inactivity timer when paused (TV only)
        resumeInactivityTimer();
        await deactivateKeepAwake();
        return;
      }

      if (isLoading !== undefined) {
        setIsBuffering(isLoading);
      }
    },
    [setPlaying, pauseInactivityTimer, resumeInactivityTimer],
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

      // A transcoded stream only carries the audio track the server encoded
      // into it — switching requires re-negotiating the stream with the new
      // index (like the mobile menu's replacePlayer), not an mpv aid change.
      if (isTranscoding) {
        const queryParams = new URLSearchParams({
          itemId: item?.Id ?? "",
          audioIndex: String(index),
          // A local (client-downloaded) sub only exists in the dying mpv
          // instance — the server must be asked for "none" (-1) instead.
          subtitleIndex: String(toServerSubtitleIndex(currentSubtitleIndex)),
          mediaSourceId: stream?.mediaSource?.Id ?? "",
          bitrateValue: bitrateValue?.toString() ?? "",
          playbackPosition: msToTicks(progress.get()).toString(),
        }).toString();
        // Destroy the current mpv instance BEFORE navigating, same rationale as
        // goToNextItem/goToPreviousItem: Expo Router briefly holds two players
        // during the transition, and two simultaneous decoders OOM-kill low-RAM
        // devices. Resume is preserved via the playbackPosition param.
        videoRef.current?.destroy().catch(() => {});
        router.replace(`player/direct-player?${queryParams}` as any);
        return;
      }

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
    [
      stream?.mediaSource,
      item?.Id,
      currentSubtitleIndex,
      bitrateValue,
      router,
      progress,
    ],
  );

  // TV subtitle track change handler
  /**
   * Resolve a Jellyfin subtitle index against MPV's *real* track list and apply
   * it. Identity-based (external by filename, embedded by language/title) so it
   * stays correct across external/embedded reordering and server-hidden embedded
   * subs — unlike positional mapping. Reused for initial selection (onTracksReady,
   * fired again after each external sub-add) and runtime changes.
   */
  const applySubtitleSelection = useCallback(
    async (jellyfinSubtitleIndex: number) => {
      const subtitleStreams = stream?.mediaSource?.MediaStreams?.filter(
        (s) => s.Type === "Subtitle",
      );
      return applyMpvSubtitleSelection(videoRef.current, {
        subtitleStreams,
        jellyfinSubtitleIndex,
        getExpectedExternalUrl: (s) =>
          getExternalSubtitleUrl(s, { offline, basePath: api?.basePath }),
      });
    },
    [stream?.mediaSource, offline, api?.basePath],
  );

  // Re-negotiate the stream with new track params (server re-processes it,
  // e.g. to burn an image sub in or out). Same-item mirror of VideoContext's
  // replacePlayer, resuming at the live position.
  const replaceWithTrackSelection = useCallback(
    (params: {
      subtitleIndex?: string;
      audioIndex?: string;
      bitrateValue?: string;
    }) => {
      const queryParams = new URLSearchParams({
        itemId: item?.Id ?? "",
        audioIndex: params.audioIndex ?? String(currentAudioIndex ?? ""),
        subtitleIndex:
          params.subtitleIndex ??
          String(toServerSubtitleIndex(currentSubtitleIndex)),
        mediaSourceId: stream?.mediaSource?.Id ?? "",
        bitrateValue: params.bitrateValue ?? bitrateValue?.toString() ?? "",
        playbackPosition: msToTicks(progress.get()).toString(),
      }).toString();
      // Destroy the current mpv instance before re-navigating, same rationale as
      // goToNextItem: Expo Router briefly holds two players during the
      // transition and two decoders/surfaces OOM-kill low-RAM devices.
      videoRef.current?.destroy().catch(() => {});
      router.replace(`player/direct-player?${queryParams}` as any);
    },
    [
      item?.Id,
      currentAudioIndex,
      currentSubtitleIndex,
      stream?.mediaSource?.Id,
      bitrateValue,
      router,
      progress,
    ],
  );

  // TV quality (max bitrate) change handler. A bitrate change always requires
  // re-negotiating the stream with the server, so it goes through the same
  // player-replace path as track changes while transcoding.
  const handleBitrateChange = useCallback(
    (bitrate: number | undefined) => {
      replaceWithTrackSelection({ bitrateValue: bitrate?.toString() ?? "" });
    },
    [replaceWithTrackSelection],
  );

  // TV/mobile subtitle track change handler
  const handleSubtitleIndexChange = useCallback(
    async (index: number) => {
      // Local (client-downloaded) subs are loaded via addSubtitleFile, not
      // resolvable against server streams — just track the live index.
      if (isLocalSubtitleIndex(index)) {
        setCurrentSubtitleIndex(index);
        return;
      }

      const subs = stream?.mediaSource?.MediaStreams?.filter(
        (s) => s.Type === "Subtitle",
      );
      const isTranscoding = Boolean(stream?.mediaSource?.TranscodingUrl);
      const target = subs?.find((s) => s.Index === index);
      const current = subs?.find((s) => s.Index === currentSubtitleIndex);
      // Burned-in subs are pixels, not tracks: switching TO one and switching
      // AWAY from an active one both need a server re-process (same guard as
      // VideoContext's needsReplace on the mobile menu path).
      const needsReplace =
        isTranscoding &&
        ((target && isImageBasedSubtitle(target)) ||
          (current && isImageBasedSubtitle(current)));
      if (needsReplace) {
        replaceWithTrackSelection({ subtitleIndex: String(index) });
        return;
      }

      setCurrentSubtitleIndex(index);
      const result = await applySubtitleSelection(index);
      // Safety net: a menu-listed sub the player can't select (server-burned
      // Encode, sidecar never sub-added) needs the server to re-process the
      // stream with it.
      if (result.kind === "notFound" || result.kind === "burnedIn") {
        replaceWithTrackSelection({ subtitleIndex: String(index) });
      }
    },
    [
      applySubtitleSelection,
      replaceWithTrackSelection,
      stream?.mediaSource,
      currentSubtitleIndex,
    ],
  );

  const subtitleStreams = useMemo(
    () =>
      stream?.mediaSource?.MediaStreams?.filter((s) => s.Type === "Subtitle") ??
      [],
    [stream?.mediaSource],
  );

  // Language of the audio actually playing. `currentAudioIndex` is undefined
  // until an explicit selection is made, so fall back to whatever the media
  // source declares as its default — otherwise the automatic subtitle picker
  // would never see the spoken language and could choose the wrong one.
  const currentAudioLanguage = useMemo(() => {
    const audioStreams =
      stream?.mediaSource?.MediaStreams?.filter((s) => s.Type === "Audio") ??
      [];
    if (audioStreams.length === 0) return undefined;

    const selected =
      currentAudioIndex !== undefined
        ? audioStreams.find((s) => s.Index === currentAudioIndex)
        : undefined;
    if (selected) return selected.Language;

    const defaultIndex = stream?.mediaSource?.DefaultAudioStreamIndex;
    return (
      audioStreams.find((s) => s.Index === defaultIndex)?.Language ??
      audioStreams.find((s) => s.IsDefault)?.Language ??
      audioStreams[0]?.Language
    );
  }, [stream?.mediaSource, currentAudioIndex]);

  const { notice: autoSubtitleNotice, clearNotice: clearAutoSubtitleNotice } =
    useAutoSubtitlesOnMute({
      enabled: settings.subtitlesOnMute,
      allowStreamRestart: settings.subtitlesOnMuteAllowRestart,
      isMuted,
      tracksReady,
      isPipMode,
      itemId: item?.Id ?? undefined,
      currentSubtitleIndex,
      subtitleStreams,
      isTranscoding: Boolean(stream?.mediaSource?.TranscodingUrl),
      preferredLanguage:
        settings.defaultSubtitleLanguage?.ThreeLetterISOLanguageName,
      audioLanguage: currentAudioLanguage,
      onSelect: handleSubtitleIndexChange,
    });

  // Technical info toggle handler
  const handleToggleTechnicalInfo = useCallback(() => {
    setShowTechnicalInfo((prev) => !prev);
  }, []);

  // Get technical info from the player
  const getTechnicalInfo = useCallback(async () => {
    return (await videoRef.current?.getTechnicalInfo?.()) ?? {};
  }, []);

  // Determine play method based on stream URL and media source
  const playMethod = useMemo<PlayMethod | undefined>(() => {
    if (!stream?.url) return undefined;
    return getPlayMethod(stream, offline);
  }, [stream, offline]);

  // Extract transcode reasons from the TranscodingUrl
  const transcodeReasons = useMemo<string[]>(
    () => parseTranscodeReasons(stream?.mediaSource?.TranscodingUrl),
    [stream?.mediaSource?.TranscodingUrl],
  );

  const handleZoomToggle = useCallback(async () => {
    const newZoomState = !isZoomedToFill;
    await videoRef.current?.setZoomedToFill?.(newZoomState);
    setIsZoomedToFill(newZoomState);
    await videoRef.current?.setSubtitlePosition?.(100);
  }, [isZoomedToFill]);

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

    // Free the current mpv instance before navigating, matching goToNextItem —
    // otherwise two decoders/surfaces overlap during the transition and can
    // OOM-kill low-RAM devices.
    videoRef.current?.destroy().catch(() => {});
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
  const addSubtitleFile = useCallback(
    async (path: string) => {
      // Set the live index to the new local sub's REAL index BEFORE the add:
      // encode the downloaded path's position, not a blanket sentinel, which
      // would collide with the first local sub and mis-record the selection.
      // Any local index resolves to notFound on the onTracksReady re-apply, so
      // it still doesn't clobber the freshly selected track; carry-over now
      // keeps the correct local sub.
      const locals = itemId ? getSubtitlesForItem(itemId) : [];
      const pos = locals.findIndex((s) => s.filePath === path);
      setCurrentSubtitleIndex(localSubtitleIndex(pos >= 0 ? pos : 0));
      await videoRef.current?.addSubtitleFile?.(path, true);
    },
    [itemId],
  );

  // TV: Refresh subtitle tracks after server-side subtitle download
  // Re-fetches the media source to pick up newly downloaded subtitles
  const handleRefreshSubtitleTracks = useCallback(async (): Promise<
    MediaStream[]
  > => {
    if (!refetchStreamRef.current) return [];

    setTracksReady(false);
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

    // Destroy the current mpv instance BEFORE navigating so the old 4K
    // decoder + surface buffers are freed before the new player screen
    // mounts. Without this, Expo Router briefly holds two simultaneous
    // mpv instances during the transition (~768 MB of surface buffers
    // for two 4K HDR10+ decoders) and OOM-kills the app on low-RAM
    // devices. Native stop() is idempotent so the subsequent React
    // unmount cleanup is still safe.
    videoRef.current?.destroy().catch(() => {});

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
    videoRef,
  ]);

  // Apply subtitle settings after MPV has enumerated tracks; applying them on
  // load is too early for ASS override/alignment on Android.
  useEffect(() => {
    if (!tracksReady || !videoRef.current) return;
    const videoStream = stream?.mediaSource?.MediaStreams?.find(
      (mediaStream) => mediaStream.Type === "Video",
    );
    const effectiveMarginY =
      settings.subtitleMarginY === undefined
        ? undefined
        : getEffectiveSubtitleMarginY(settings.subtitleMarginY);
    const effectiveScale = getEffectiveSubtitleScale(
      settings.subtitleSize,
      videoStream?.Width,
      videoStream?.Height,
      screenWidth * PixelRatio.get(),
      screenHeight * PixelRatio.get(),
      isZoomedToFill && screenHeight > screenWidth ? "cover" : "contain",
      getActivePlayerType(settings),
    );
    void applySubtitleStyle(
      videoRef.current,
      buildSubtitleStyle(settings, {
        scale: effectiveScale,
        marginY:
          effectiveMarginY !== undefined &&
          Platform.OS === "android" &&
          !Platform.isTV &&
          screenHeight > screenWidth
            ? Math.round(effectiveMarginY * 0.7)
            : effectiveMarginY,
      }),
    ).catch((error: unknown) => {
      console.error("Failed to apply subtitle settings:", error);
    });
  }, [
    tracksReady,
    settings,
    stream?.mediaSource,
    screenWidth,
    screenHeight,
    isZoomedToFill,
  ]);

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
              <VideoPlayerView
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
                  // Attach the negotiation and decode facts that make a
                  // player error diagnosable; the native probe is
                  // best-effort and must never block or swallow the error
                  // path — a wedged player may never settle the promise, so
                  // it races a timeout.
                  void (async () => {
                    const technical = await Promise.race([
                      getTechnicalInfo().catch(() => ({})),
                      new Promise<Record<string, never>>((resolve) =>
                        setTimeout(() => resolve({}), 2000),
                      ),
                    ]);
                    logAndCaptureError(
                      "Video playback error",
                      e.nativeEvent?.error ?? e.nativeEvent,
                      {
                        playMethod,
                        transcodeReasons,
                        container: stream?.mediaSource?.Container,
                        offline,
                        technical,
                      },
                    );
                  })();
                }}
                onTracksReady={() => {
                  setTracksReady(true);
                  // A mute asked for while the player was still mounting never
                  // reached a native handle; this is the first moment one
                  // exists.
                  reapplyPlayerMute();
                  // Fired after embedded tracks enumerate and again after each
                  // external sub-add; re-resolve so the final fire (full track
                  // list) selects the right track by identity.
                  void applySubtitleSelection(currentSubtitleIndex);
                }}
              />
              <AutoSubtitleNotice
                notice={autoSubtitleNotice}
                onDismiss={clearAutoSubtitleNotice}
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
                  onBitrateChange={handleBitrateChange}
                  isMuted={isMuted}
                  onToggleMute={toggleMute}
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
                  onHoldSpeedStart={handleHoldSpeedStart}
                  onHoldSpeedEnd={handleHoldSpeedEnd}
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

import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import {
  PlaybackOrder,
  type PlaybackProgressInfo,
  RepeatMode,
} from "@jellyfin/sdk/lib/generated-client";
import {
  getLibraryApi,
  getMediaInfoApi,
  getSessionApi,
  getShowApi,
} from "@jellyfin/sdk/lib/utils/api";
import { useAtomValue } from "jotai";
import type React from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { Alert, AppState, BackHandler, Platform } from "react-native";
import { SystemBars } from "react-native-edge-to-edge";
import {
  NATIVE_PLAYER_CLOSE_POLL_MS,
  NATIVE_PLAYER_CLOSE_WAIT_MS,
  NEXT_EPISODE_COUNTDOWN_MS,
  PROGRESS_REPORT_INTERVAL,
} from "@/constants/Playback";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { useOrientation } from "@/hooks/useOrientation";
import { usePlaybackManager } from "@/hooks/usePlaybackManager";
import {
  type SubtitleSearchResult,
  useRemoteSubtitles,
} from "@/hooks/useRemoteSubtitles";
import { useInvalidatePlaybackProgressCache } from "@/hooks/useRevalidatePlaybackProgressCache";
import { useServerVersion } from "@/hooks/useServerVersion";
import {
  addNativePlayerListener,
  applyNativePlayerSyncPlayCommand,
  cancelNativePlayerSyncPlayCommands,
  dismissNativePlayer,
  isNativePlayerModuleAvailable,
  isNativePlayerPresented,
  isNativePlayerSyncPlayAvailable,
  loadNativePlayerStream,
  type NativePlayerDismissReason,
  type NativePlayerEpisodeListItem,
  type NativePlayerNextEpisode,
  type NativePlayerSegment,
  type NativePlayerSegmentType,
  type NativePlayerSubtitleSearchResult,
  nativePlayerAddExternalSubtitle,
  nativePlayerDisableSubtitles,
  nativePlayerGetSubtitleTracks,
  nativePlayerPause,
  nativePlayerPlay,
  nativePlayerSeekTo,
  nativePlayerSetAudioTrack,
  nativePlayerSetSpeed,
  nativePlayerSetSubtitleTrack,
  nativePlayerShowNotice,
  nativePlayerToggleMute,
  presentNativePlayer,
  updateNativePlayerEpisodeList,
  updateNativePlayerNextEpisode,
  updateNativePlayerSegments,
  updateNativePlayerSubtitleSearch,
  updateNativePlayerSyncPlay,
  updateNativePlayerTrackMenus,
} from "@/modules/mpv-player";
// The TV-safe wrapper, NOT expo-screen-orientation directly: the native
// module is absent from TV binaries and a top-level import crashes on launch.
import { OrientationLock } from "@/packages/expo-screen-orientation";
import { useDownload } from "@/providers/DownloadProvider";
import type { MediaTimeSegment } from "@/providers/Downloads/types";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { useSyncPlay } from "@/providers/SyncPlayProvider";
import { useWebSocketContext } from "@/providers/WebSocketProvider";
import {
  getActivePlayerType,
  isPlayerSupported,
  type SegmentSkipMode,
  useSettings,
} from "@/utils/atoms/settings";
import {
  type AutoSubtitleState,
  carryAutoSubtitleState,
  INITIAL_AUTO_SUBTITLE_STATE,
  resolveAutoSubtitleAction,
} from "@/utils/autoSubtitleOnMute";
import {
  getAdjacentStartTicks,
  getDefaultPlaySettings,
} from "@/utils/jellyfin/getDefaultPlaySettings";
import { getPrimaryImageUrl } from "@/utils/jellyfin/image/getPrimaryImageUrl";
import { getPlayingRunTimeTicks } from "@/utils/jellyfin/mediaSourceVersion";
import { subtitleSearchErrorMessage } from "@/utils/jellyfin/subtitleSearchAccess";
import {
  applyMpvSubtitleSelection,
  findSubtitleTrackIdentity,
  getExternalSubtitleUrl,
  isImageBasedSubtitle,
  pickAutoSubtitleTrack,
  resolveAudioSwitch,
  type SubtitleSelectablePlayer,
} from "@/utils/jellyfin/subtitleUtils";
import { logAndCaptureError, writeErrorLog, writeToLog } from "@/utils/log";
import { applyLoadEvent } from "@/utils/nativePlayer/applyLoadEvent";
import { applyProgressTick } from "@/utils/nativePlayer/applyProgressTick";
import {
  buildNativePlayerConfig,
  buildNativePlayerStrings,
  buildTrackMenus,
  type NativePlayerSessionSeed,
} from "@/utils/nativePlayer/buildNativePlayerConfig";
import { clearSubtitlePrefetchCache } from "@/utils/nativePlayer/externalSubtitles";
import { parseRemotePlayCommand } from "@/utils/nativePlayer/parseRemotePlayCommand";
import { NativePlaybackReportQueue } from "@/utils/nativePlayer/playbackReportQueue";
import type { PlayRequest } from "@/utils/nativePlayer/playRequest";
import { resolveFailedPresentation } from "@/utils/nativePlayer/resolveFailedPresentation";
import { resolveTeardownReport } from "@/utils/nativePlayer/resolveTeardownReport";
import {
  buildNativeSyncPlayState,
  dispatchNativeSyncPlayAction,
  type SyncPlayQueueDisplay,
} from "@/utils/nativePlayer/syncPlay";
import { NativeSyncPlayBufferingReporter } from "@/utils/nativePlayer/syncPlayBuffering";
import { warmUpcomingSubtitles } from "@/utils/nativePlayer/warmUpcomingSubtitles";
import {
  PlaybackSpeedScope,
  updatePlaybackSpeedSettings,
} from "@/utils/playbackSpeedSettings";
import { generateDeviceProfile } from "@/utils/profiles/native";
import {
  fetchAndParseSegments,
  getSegmentsForItem,
  type SegmentBuckets,
} from "@/utils/segments";
import { rememberSeriesTrack } from "@/utils/seriesTrackMemory";
import {
  decideStillWatchingOnce,
  isStillWatchingDueAtEnd,
  recordStillWatchingAutoplay,
  resetStillWatchingSession,
  revertStillWatchingAutoplay,
} from "@/utils/stillWatching";
import {
  isLocalSubtitleIndex,
  localSubtitleIndex,
  SUBTITLES_OFF,
} from "@/utils/subtitles/subtitleIndex";
import {
  syncPlayQueuePosterUrl,
  syncPlayQueueSubtitle,
} from "@/utils/syncplay/queueDisplay";
import { syncPlayLookupKey } from "@/utils/syncplay/queueItems";
import { msToTicks, ticksToMs, ticksToSeconds } from "@/utils/time";
import { useVideoSession } from "@/utils/videoSession";

const NEXT_EPISODE_COUNTDOWN_SECONDS = NEXT_EPISODE_COUNTDOWN_MS / 1000;

/**
 * One presented native-player session. Everything the event handlers read
 * must live here, not in React state, so a tick already in flight can't
 * observe a stale value.
 */
interface NativeSession extends NativePlayerSessionSeed {
  isReady: boolean;
  isBuffering: boolean;
  syncPlaylistItemId?: string;
  currentAudioIndex: number | undefined;
  currentSubtitleIndex: number;
  positionMs: number;
  isPlaying: boolean;
  hasPlaybackStarted: boolean;
  /** Dedupe key of the last "stopped" report (sessionId || itemId). */
  reportedStopKey: string | null;
  /**
   * True from session creation until the new stream's onLoad arrives. The
   * engine is swapped in place, so events from the OUTGOING stream can still
   * arrive after sessionRef points at the new session — the handlers that
   * write playback state drop events while this is set. onDismiss
   * still tears the session down, but the position it carries belongs to
   * the outgoing stream, so a committed session's teardown reports the
   * tracked position instead and an uncommitted one reports nothing
   * (resolveTeardownReport).
   */
  awaitingLoad: boolean;
  /**
   * Set on the edge where the present/load promise resolved with sessionRef
   * still pointing here: the start report goes out on that edge, and only a
   * committed session sends the final progress and stop reports at teardown.
   * A session torn down before it committed never took the player, so a stop
   * for it would describe a playback the server never saw start and
   * overwrite the item's resume position with wherever the outgoing stream
   * was. Not derived from awaitingLoad: on both platforms present() and
   * load() resolve before onLoad, so every swap passes through a committed
   * but still loading moment.
   */
  committed: boolean;
  lastProgressReportAt: number;
  /** Results of the last remote-subtitle search — download taps key into it. */
  subtitleSearchResults: SubtitleSearchResult[] | null;
  /** Monotonic per-search token: only the newest in-flight search may push. */
  subtitleSearchToken: number;
  /**
   * Client-side downloaded sidecar subtitle (OpenSubtitles fallback). It only
   * exists on the live mpv handle, never in the Jellyfin media source; while
   * active, the server-facing subtitle index reports -1.
   */
  localSubtitle: { path: string; label: string; active: boolean } | null;
  /** Consecutive sidecar-lookup misses on onTracksReady (see self-heal). */
  localSubtitleMisses: number;
  /**
   * Last mute state the native player reported: the device output volume
   * hitting zero, or the player's own mute where the volume is invisible
   * (Apple TV over HDMI, Android boxes on a receiver).
   */
  isMuted: boolean;
  /**
   * Automatic-subtitles-on-mute policy state. The rules live in
   * `utils/autoSubtitleOnMute`.
   */
  autoSubtitle: AutoSubtitleState;
  /** Mute value the policy last acted on. */
  autoSubtitleWasMuted: boolean;
}

interface NativePlayerContextValue {
  /**
   * Fetch the item, negotiate the stream and present the native player.
   * Resolves false when it could not (unsupported platform, config-build
   * failure, a native throw with the player still up). Resolves true when the
   * request was taken, including when the player was closed while it was in
   * flight: the user just closed that item. A request superseded by a newer
   * one before it took the player resolves false; one superseded after its
   * load was issued resolves true, since the newer request owns the player.
   *
   * There is no other player to try, so `alertOnFailure` has a play that
   * leaves the user without one say why. A superseded request stays quiet,
   * and so does a failed swap that left the item on screen playing.
   */
  presentFromRequest: (
    req: PlayRequest,
    options?: { isCurrent?: () => boolean; alertOnFailure?: boolean },
  ) => Promise<boolean>;
  isActive: boolean;
}

const NativePlayerContext = createContext<NativePlayerContextValue>({
  presentFromRequest: async () => false,
  isActive: false,
});

export const useNativePlayer = (): NativePlayerContextValue =>
  useContext(NativePlayerContext);

/** SubtitleSelectablePlayer facade over the module-level track functions. */
const nativePlayerSubtitleFacade: SubtitleSelectablePlayer = {
  getSubtitleTracks: nativePlayerGetSubtitleTracks,
  setSubtitleTrack: nativePlayerSetSubtitleTrack,
  disableSubtitles: nativePlayerDisableSubtitles,
};

/**
 * Persist a deliberate in-player track pick as the series preference (stored
 * by language — indexes differ between episode files). Client-side sidecar
 * selections carry no server-side identity and are skipped.
 */
const rememberSeriesSelection = (
  session: NativeSession,
  kind: "audio" | "subtitle",
  jellyfinIndex: number,
  settings:
    | {
        rememberAudioSelections?: boolean;
        rememberSubtitleSelections?: boolean;
      }
    | null
    | undefined,
) => {
  const item = session.item;
  if (item?.Type !== "Episode" || !item.SeriesId) return;
  // A sidecar has no server-side stream to read a language off, so there is
  // nothing to remember for the next episode.
  if (isLocalSubtitleIndex(jellyfinIndex)) return;
  const streams = session.stream.mediaSource.MediaStreams;
  if (kind === "audio") {
    if (!settings?.rememberAudioSelections) return;
    const lang = streams?.find(
      (s) => s.Index === jellyfinIndex && s.Type === "Audio",
    )?.Language;
    if (lang) rememberSeriesTrack(item.SeriesId, { audioLang: lang });
    return;
  }
  if (!settings?.rememberSubtitleSelections) return;
  if (jellyfinIndex === -1) {
    rememberSeriesTrack(item.SeriesId, { subtitleLang: "off" });
    return;
  }
  const lang = streams?.find(
    (s) => s.Index === jellyfinIndex && s.Type === "Subtitle",
  )?.Language;
  if (lang) rememberSeriesTrack(item.SeriesId, { subtitleLang: lang });
};

const mapSearchResults = (
  results: SubtitleSearchResult[],
): NativePlayerSubtitleSearchResult[] =>
  results.map((r) => ({
    id: r.id,
    name: r.name,
    providerName: r.providerName,
    format: r.format,
    language: r.language,
    communityRating: r.communityRating,
    downloadCount: r.downloadCount,
    isHashMatch: r.isHashMatch,
    hearingImpaired: r.hearingImpaired,
    aiTranslated: r.aiTranslated,
  }));

/**
 * Waits, briefly, for a native player that is closing to be gone. On iOS the
 * module keeps its session until the cross-dissolve of the closing player has
 * ended, a few hundred ms after onDismiss tore the JS session down, and
 * refuses a new player until then (Sentry REACT-NATIVE-BR). Android drops it
 * within the pass that emits onDismiss. Past the wait the present goes ahead,
 * and a refusal then is reported as before.
 */
const waitForClosingNativePlayer = async () => {
  const deadline = Date.now() + NATIVE_PLAYER_CLOSE_WAIT_MS;
  while (isNativePlayerPresented() && Date.now() < deadline) {
    await new Promise((resolve) =>
      setTimeout(resolve, NATIVE_PLAYER_CLOSE_POLL_MS),
    );
  }
};

export const NativePlayerProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const enabled = isPlayerSupported && isNativePlayerModuleAvailable();

  if (!enabled) {
    return <NativePlayerUnavailable>{children}</NativePlayerUnavailable>;
  }

  return <NativePlayerProviderInner>{children}</NativePlayerProviderInner>;
};

/**
 * No player on this device (an Apple TV below tvOS 26): a play, from here or
 * from another client, says why instead of doing nothing.
 */
const NativePlayerUnavailable: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const { subscribe } = useWebSocketContext();
  const { t } = useTranslation();

  const explain = useCallback(() => {
    Alert.alert(
      t("player.error"),
      isPlayerSupported
        ? t("player.an_error_occurred_while_playing_the_video")
        : t("player.requires_tvos_26"),
    );
  }, [t]);

  // The app advertises the "Play" command everywhere.
  useEffect(
    () =>
      subscribe("Play", (data: unknown) => {
        if (parseRemotePlayCommand(data)) explain();
      }),
    [subscribe, explain],
  );

  const value = useMemo<NativePlayerContextValue>(
    () => ({
      presentFromRequest: async (_req, options) => {
        if (options?.alertOnFailure) explain();
        return false;
      },
      isActive: false,
    }),
    [explain],
  );

  return (
    <NativePlayerContext.Provider value={value}>
      {children}
    </NativePlayerContext.Provider>
  );
};

const NativePlayerProviderInner: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);
  const { t } = useTranslation();
  const { settings, updateSettings, pluginSettings } = useSettings();
  const { isConnected } = useNetworkStatus();
  const { lockOrientation, unlockOrientation } = useOrientation();
  const downloadUtils = useDownload();
  const revalidateProgressCache = useInvalidatePlaybackProgressCache();
  const { subscribe, retainInBackground } = useWebSocketContext();
  const syncPlay = useSyncPlay();
  const syncRef = useRef(syncPlay);
  syncRef.current = syncPlay;
  const [syncBufferingReporter] = useState(
    () =>
      new NativeSyncPlayBufferingReporter((buffering) => {
        if (syncRef.current.enabled) syncRef.current.notifyBuffering(buffering);
      }),
  );
  useEffect(() => () => syncBufferingReporter.reset(), [syncBufferingReporter]);
  const [syncDisplay, setSyncDisplay] = useState<SyncPlayQueueDisplay>({});
  const nativeSyncState = useMemo(
    () => buildNativeSyncPlayState(syncPlay, syncDisplay, t),
    [syncPlay, syncDisplay, t],
  );
  const nativeSyncStateRef = useRef(nativeSyncState);
  nativeSyncStateRef.current = nativeSyncState;
  const syncIds = syncPlayLookupKey(syncPlay.playlist);
  useEffect(() => {
    let current = true;
    if (!syncIds) {
      setSyncDisplay({});
      return;
    }
    void syncPlay
      .resolveVideos(syncIds.split(","))
      .then((items) => {
        if (current)
          setSyncDisplay(
            Object.fromEntries(
              items.map((item) => [
                item.Id,
                {
                  title: item.Name || "",
                  subtitle: syncPlayQueueSubtitle(item),
                  imageUrl:
                    syncPlayQueuePosterUrl(apiRef.current, item) || undefined,
                },
              ]),
            ),
          );
      })
      .catch(() => {});
    return () => {
      current = false;
    };
  }, [syncIds, syncPlay.resolveVideos]);

  const sessionRef = useRef<NativeSession | null>(null);
  const reportQueue = useRef(new NativePlaybackReportQueue()).current;
  // Monotonic id per beginSession call: the config build awaits a PlaybackInfo
  // round trip, so overlapping play requests (double-fired next-episode, WS
  // Play mid-swap, fast taps) can interleave — only the newest may commit.
  const playRequestTokenRef = useRef(0);
  const [activeItem, setActiveItem] = useState<BaseItemDto | null>(null);
  const [isActive, setIsActive] = useState(false);
  const nativePipRef = useRef(false);
  // How the last session's player closed, for a request that was meant to
  // swap into it (beginSession).
  const lastDismissalRef = useRef<{
    session: NativeSession;
    reason: NativePlayerDismissReason;
  } | null>(null);
  // The last session whose player never opened, for a request that was
  // meant to swap into it.
  const unpresentedRef = useRef<NativeSession | null>(null);

  useEffect(() => {
    if (isActive && syncPlay.enabled && isNativePlayerSyncPlayAvailable())
      return retainInBackground();
  }, [isActive, syncPlay.enabled, retainInBackground]);

  useEffect(() => {
    if (isActive && isNativePlayerSyncPlayAvailable())
      void updateNativePlayerSyncPlay(nativeSyncState).catch(() => {});
  }, [isActive, nativeSyncState]);

  // Dropped from the group (socket lost, playback failed) the player is left
  // paused with no SyncPlay state to carry the reason, so it is said here.
  // Only an error that arrives while the player is up: one left behind by
  // the sheet says nothing about a video played later.
  const noticedSyncErrorRef = useRef<string | null>(null);
  useEffect(() => {
    const error = syncPlay.error;
    if (
      isActive &&
      !syncPlay.enabled &&
      error &&
      error !== noticedSyncErrorRef.current
    )
      void nativePlayerShowNotice(error);
    noticedSyncErrorRef.current = error;
  }, [isActive, syncPlay.enabled, syncPlay.error]);

  useEffect(() => {
    if (!isNativePlayerSyncPlayAvailable()) return;
    let commandId = 0;
    return syncPlay.registerPlayer({
      // MPV releases its file at EOF; queue restarts need a fresh stream and
      // session identity even when another entry refers to the same media.
      reloadOnQueueRestart: true,
      getState: () => {
        const session = sessionRef.current;
        return {
          itemId: session?.item.Id || null,
          positionTicks: session ? Math.round(session.positionMs * 10_000) : 0,
          isPlaying: session?.isPlaying ?? false,
          isReady: !!session && !session.awaitingLoad && session.isReady,
          isBuffering: session?.isBuffering ?? false,
        };
      },
      pause: async () => {
        await nativePlayerPause();
      },
      resume: async () => {
        await nativePlayerPlay();
      },
      seek: async (ticks) => {
        const session = sessionRef.current;
        if (session) session.positionMs = ticks / 10_000;
        await nativePlayerSeekTo(ticks / 10_000_000);
      },
      stop: async () => {
        ++playRequestTokenRef.current;
        await dismissNativePlayer();
      },
      cancelScheduledCommands: () => {
        void cancelNativePlayerSyncPlayCommands().catch(() => {});
      },
      scheduleCommand: async (command, executeAtMs) => {
        if (command.Command === "Stop") ++playRequestTokenRef.current;
        if (command.Command === "Stop" && !sessionRef.current) return;
        const applied = await applyNativePlayerSyncPlayCommand({
          commandId: String(++commandId),
          groupId: command.GroupId,
          playlistItemId:
            command.PlaylistItemId ||
            syncRef.current.currentPlaylistItemId ||
            "",
          command: command.Command,
          executeAtMs,
          positionSec: (command.PositionTicks || 0) / 10_000_000,
        });
        if (!applied) throw new Error("Native SyncPlay command canceled");
      },
    });
  }, [syncPlay.registerPlayer]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (
        state !== "background" ||
        !syncRef.current.enabled ||
        // Nobody waits for a member who is not watching, so there is nothing
        // to step out of. A socket lost in the background is rejoined.
        !syncRef.current.watching ||
        nativePipRef.current ||
        // Native lifecycle callbacks can distinguish PiP from a real stop.
        // AppState reaches background before Android's PiP event reaches JS.
        (sessionRef.current && isNativePlayerSyncPlayAvailable())
      )
        return;
      void syncRef.current.suspendGroup().catch(() => {});
      void nativePlayerPause().catch(() => {});
    });
    return () => subscription.remove();
  }, []);

  const playbackManager = usePlaybackManager({
    item: activeItem,
    isOffline: sessionRef.current?.offline ?? false,
  });

  // usePlaybackManager returns a fresh object per render; handlers below live
  // in refs, so mirror the pieces they need.
  const saveLocalProgressRef = useRef(
    playbackManager.saveLocalPlaybackProgress,
  );
  const reportRemoteProgressRef = useRef(
    playbackManager.reportRemotePlaybackProgress,
  );
  const nextItemRef = useRef<BaseItemDto | null>(playbackManager.nextItem);
  const previousItemRef = useRef<BaseItemDto | null>(
    playbackManager.previousItem,
  );
  useEffect(() => {
    saveLocalProgressRef.current = playbackManager.saveLocalPlaybackProgress;
    reportRemoteProgressRef.current =
      playbackManager.reportRemotePlaybackProgress;
    nextItemRef.current = playbackManager.nextItem;
    previousItemRef.current = playbackManager.previousItem;
  });

  // Decides where a matched alternate version starts, see
  // getAdjacentStartTicks. Whatever is cached will do: a server does not go
  // back a major version.
  const serverVersion = useServerVersion({
    staleTime: Number.POSITIVE_INFINITY,
  });
  const serverVersionRef = useRef(serverVersion);
  const apiRef = useRef(api);
  const settingsRef = useRef(settings);
  const pluginSettingsRef = useRef(pluginSettings);
  const userRef = useRef(user);
  const isConnectedRef = useRef(isConnected);
  useEffect(() => {
    serverVersionRef.current = serverVersion;
    apiRef.current = api;
    settingsRef.current = settings;
    pluginSettingsRef.current = pluginSettings;
    userRef.current = user;
    isConnectedRef.current = isConnected;
  });

  // Remote subtitle search/download for the native search sheet (Jellyfin
  // server plugin first, client-side OpenSubtitles fallback when an API key
  // is configured — same backend logic as the TV subtitle modal).
  const remoteSubtitles = useRemoteSubtitles({
    itemId: activeItem?.Id ?? "",
    item: activeItem ?? ({} as BaseItemDto),
  });
  const remoteSubtitlesRef = useRef(remoteSubtitles);
  useEffect(() => {
    remoteSubtitlesRef.current = remoteSubtitles;
  });

  // MARK: - Session reporting

  const buildProgressInfo = useCallback(
    (session: NativeSession): PlaybackProgressInfo => ({
      ItemId: session.item.Id!,
      // Live selections so server-side session/resume state reflects
      // mid-playback track changes; 0 is valid, -1 means "off".
      AudioStreamIndex: session.currentAudioIndex,
      SubtitleStreamIndex: session.currentSubtitleIndex,
      MediaSourceId: session.mediaSourceId,
      PositionTicks: msToTicks(session.positionMs),
      IsPaused: !session.isPlaying,
      PlayMethod: session.playMethod,
      PlaySessionId: session.stream.sessionId,
      IsMuted: session.isMuted,
      CanSeek: true,
      RepeatMode: syncRef.current.enabled
        ? syncRef.current.repeatMode
        : RepeatMode.RepeatNone,
      PlaybackOrder:
        syncRef.current.enabled && syncRef.current.shuffleMode === "Shuffle"
          ? PlaybackOrder.Shuffle
          : PlaybackOrder.Default,
    }),
    [],
  );

  const reportPlaybackStart = useCallback(
    (session: NativeSession) => {
      const currentApi = apiRef.current;
      // Gate on connectivity, not on the offline flag: a downloaded item
      // played with the server reachable still reports.
      if (!currentApi || !isConnectedRef.current) return;
      const playbackStartInfo = {
        ...buildProgressInfo(session),
        // The stream just resolved; describe the session that is starting
        // (autoplay) instead of "paused at 0:00".
        IsPaused: syncRef.current.enabled,
        PositionTicks: session.startTicks,
      };
      const playstate = getSessionApi(currentApi);
      reportQueue
        .enqueue(session, "start", playbackStartInfo, (info, signal) =>
          playstate.reportPlaybackStart(
            { playbackStartInfo: info },
            { signal },
          ),
        )
        .catch((error) => {
          writeToLog(
            "ERROR",
            "NativePlayer reportPlaybackStart failed",
            error instanceof Error ? error.message : String(error),
          );
        });
    },
    [buildProgressInfo, reportQueue],
  );

  const reportNativeProgress = useCallback(
    (session: NativeSession, info: PlaybackProgressInfo, final = false) => {
      // The downloads database is written here, not in the queue: the resume
      // position of a downloaded item must not wait for a server that has
      // stopped answering.
      saveLocalProgressRef.current(info);
      return reportQueue.enqueue(
        session,
        final ? "final-progress" : "progress",
        info,
        reportRemoteProgressRef.current,
      );
    },
    [reportQueue],
  );

  const releaseLiveStream = useCallback(
    (session: Pick<NativeSession, "stream" | "offline">) => {
      const liveStreamId = session.stream.mediaSource?.LiveStreamId;
      const currentApi = apiRef.current;
      if (!liveStreamId || !currentApi || session.offline) return;
      getMediaInfoApi(currentApi)
        .closeLiveStream({ liveStreamId })
        .catch(() => {});
    },
    [],
  );

  const reportPlaybackStopped = useCallback(
    async (session: NativeSession, positionTicks?: number) => {
      reportQueue.closeSession(session);
      const currentApi = apiRef.current;
      if (!session.item.Id || !currentApi || !isConnectedRef.current) return;
      // No start report went out for a session that never committed; a stop
      // would still overwrite the item's resume position on the server.
      if (!session.committed) return;
      // Dedupe per session: dismissal and stream replacement can both try to
      // close the same session (sessionId, or item id for downloads).
      const stopKey = session.stream.sessionId || session.item.Id;
      if (session.reportedStopKey === stopKey) return;
      session.reportedStopKey = stopKey;
      const playbackStopInfo = {
        ItemId: session.item.Id,
        MediaSourceId: session.mediaSourceId,
        PositionTicks: positionTicks ?? msToTicks(session.positionMs),
        PlaySessionId: session.stream.sessionId || undefined,
        // Required to release the server-side live stream's tuner slot.
        LiveStreamId: session.stream.mediaSource?.LiveStreamId ?? undefined,
      };
      const playstate = getSessionApi(currentApi);
      try {
        await reportQueue.enqueue(
          session,
          "stop",
          playbackStopInfo,
          (info, signal) =>
            playstate.reportPlaybackStopped(
              { playbackStopInfo: info },
              { signal },
            ),
        );
      } catch (error) {
        // Un-mark so a later teardown path can retry.
        if (session.reportedStopKey === stopKey) {
          session.reportedStopKey = null;
        }
        writeToLog(
          "ERROR",
          "NativePlayer reportPlaybackStopped failed",
          error instanceof Error ? error.message : String(error),
        );
      }
    },
    [reportQueue],
  );

  // MARK: - Aux data pushes (segments / next episode / episode list)

  const pushSegments = useCallback(async (session: NativeSession) => {
    try {
      const currentApi = apiRef.current;
      let segments: SegmentBuckets;
      if (session.offline && session.downloadedItem) {
        segments = getSegmentsForItem(session.downloadedItem);
      } else if (currentApi && session.item.Id) {
        segments = await fetchAndParseSegments(session.item.Id, currentApi);
      } else {
        return;
      }
      if (sessionRef.current !== session) return;

      // The skip mode is resolved here rather than natively, so the native
      // player never reads settings.
      const currentSettings = settingsRef.current;
      // Emitted in overlap priority
      // (Commercial > Recap > Intro > Preview > Outro). The native side picks
      // the first segment containing the playhead, so array order IS the
      // priority.
      const bucketsByType: Array<
        [NativePlayerSegmentType, MediaTimeSegment[], SegmentSkipMode]
      > = [
        [
          "Commercial",
          segments.commercialSegments,
          currentSettings?.skipCommercial ?? "ask",
        ],
        ["Recap", segments.recapSegments, currentSettings?.skipRecap ?? "ask"],
        ["Intro", segments.introSegments, currentSettings?.skipIntro ?? "ask"],
        [
          "Preview",
          segments.previewSegments,
          currentSettings?.skipPreview ?? "ask",
        ],
        ["Outro", segments.creditSegments, currentSettings?.skipOutro ?? "ask"],
      ];

      const mapped: NativePlayerSegment[] = bucketsByType.flatMap(
        ([type, bucket, skipMode]) =>
          // "none" segments are dropped outright: nothing to show, nothing to
          // skip, and it keeps the native payload small.
          skipMode === "none"
            ? []
            : bucket.map((s) => ({
                type,
                startSec: s.startTime,
                endSec: s.endTime,
                skipMode,
              })),
      );
      await updateNativePlayerSegments(mapped);
    } catch {
      // Segments are progressive enhancement — never fail playback for them.
    }
  }, []);

  // Sessions whose countdown already advanced; see onNextEpisodeRequested.
  const [countdownAdvanced] = useState(() => new WeakSet<NativeSession>());
  const countdownAdvancedRef = useRef(countdownAdvanced);
  // Items whose subtitles a background warm already started; one negotiation
  // per item, not one per payload push.
  const warmedSubtitleItemIdsRef = useRef(new Set<string>());

  const buildNextEpisodePayload = useCallback(
    (session: NativeSession, next: BaseItemDto): NativePlayerNextEpisode => {
      const currentSettings = settingsRef.current;
      const autoplayWanted = currentSettings?.autoPlayNextEpisode ?? false;
      // The swap's inline prefetch (buildNativePlayerConfig) blocks the
      // next-episode load for the whole subtitle budget on a slow path; warm
      // the files now, while this episode still plays, so the swap finds them
      // cached. Best effort and once per item.
      const api = apiRef.current;
      // Only ExoPlayer prefetches its sidecars (buildNativePlayerConfig).
      if (
        api &&
        !session.offline &&
        !syncRef.current.enabled &&
        getActivePlayerType(currentSettings) === "exoplayer" &&
        next.Id &&
        !warmedSubtitleItemIdsRef.current.has(next.Id)
      ) {
        const nextId = next.Id;
        warmedSubtitleItemIdsRef.current.add(nextId);
        // Resolved as playAdjacentItem resolves the swap (version matched to
        // the playing one, tracks carried, the session's bitrate cap), so the
        // warm negotiates the very source and sidecars the swap will ask for.
        const nextSettings = getDefaultPlaySettings(next, currentSettings, {
          indexes: {
            subtitleIndex: session.currentSubtitleIndex,
            audioIndex: session.currentAudioIndex,
          },
          source: session.stream.mediaSource,
          offline: session.offline,
        });
        void warmUpcomingSubtitles({
          api,
          item: next,
          userId: userRef.current?.Id,
          mediaSourceId: nextSettings.mediaSource?.Id,
          audioStreamIndex: nextSettings.audioIndex,
          subtitleStreamIndex: nextSettings.subtitleIndex,
          maxStreamingBitrate: session.bitrateValue,
          deviceProfile: generateDeviceProfile({
            player: getActivePlayerType(currentSettings),
            audioMode: currentSettings?.audioTranscodeMode,
          }),
        }).then((complete) => {
          // A sidecar is still off disk: the next payload push tries again.
          if (!complete) warmedSubtitleItemIdsRef.current.delete(nextId);
        });
      }
      // Decided once per episode, against its projected end at 1x. A pause
      // makes the prompt come an episode late; a faster speed can bring it
      // early.
      const stillWatchingRequired =
        autoplayWanted &&
        decideStillWatchingOnce(session.item.Id ?? "", () =>
          isStillWatchingDueAtEnd({
            preset: currentSettings?.stillWatchingPreset,
            // The playing version's runtime: another cut ends elsewhere.
            remainingMs:
              ticksToMs(
                getPlayingRunTimeTicks(
                  session.item,
                  session.stream.mediaSource,
                ),
              ) - session.positionMs,
          }),
        );
      const autoplayAllowed = autoplayWanted && !stillWatchingRequired;
      const epNumber =
        next.ParentIndexNumber !== undefined && next.IndexNumber !== undefined
          ? `S${next.ParentIndexNumber}E${next.IndexNumber}`
          : undefined;
      return {
        itemId: next.Id ?? "",
        title: next.Name ?? "",
        subtitle: [next.SeriesName, epNumber].filter(Boolean).join(" · "),
        imageUrl:
          getPrimaryImageUrl({
            api: apiRef.current,
            item: next,
            quality: 80,
            width: 300,
          }) ?? undefined,
        countdownSeconds: autoplayAllowed ? NEXT_EPISODE_COUNTDOWN_SECONDS : 0,
        // Autoplay would have run but the session is long enough to ask:
        // EOF shows the "Still watching?" card instead.
        stillWatchingRequired,
      };
    },
    [],
  );

  const pushEpisodeList = useCallback(
    async (session: NativeSession) => {
      const item = session.item;
      if (item.Type !== "Episode" || !item.SeriesId) {
        await updateNativePlayerEpisodeList([]);
        return;
      }
      try {
        let episodes: BaseItemDto[] = [];
        if (session.offline) {
          episodes = (downloadUtils.getDownloadedItems() ?? [])
            .filter((d) => d.item.SeriesId === item.SeriesId)
            .map((d) => d.item as BaseItemDto)
            .sort(
              (a, b) =>
                (a.ParentIndexNumber ?? 0) - (b.ParentIndexNumber ?? 0) ||
                (a.IndexNumber ?? 0) - (b.IndexNumber ?? 0),
            );
        } else if (apiRef.current) {
          const res = await getShowApi(apiRef.current).getEpisodes({
            seriesId: item.SeriesId,
            seasonId: item.SeasonId ?? undefined,
            userId: userRef.current?.Id,
          });
          episodes = res.data.Items ?? [];
        }
        if (sessionRef.current !== session) return;
        const mapped: NativePlayerEpisodeListItem[] = episodes
          .filter((ep) => ep.LocationType !== "Virtual")
          .map((ep) => ({
            itemId: ep.Id ?? "",
            title: ep.Name ?? "",
            indexNumber: ep.IndexNumber ?? undefined,
            imageUrl:
              getPrimaryImageUrl({
                api: apiRef.current,
                item: ep,
                quality: 80,
                width: 300,
              }) ?? undefined,
            progressPercent: ep.UserData?.PlayedPercentage ?? 0,
            isCurrent: ep.Id === item.Id,
          }));
        await updateNativePlayerEpisodeList(mapped);
      } catch {
        // Episode list is progressive enhancement.
      }
    },
    [downloadUtils],
  );

  // Push the next-episode preview whenever the adjacent-items query resolves.
  useEffect(() => {
    const session = sessionRef.current;
    if (!isActive || !session) return;
    if (syncRef.current.enabled) {
      void updateNativePlayerNextEpisode(null);
      return;
    }
    const next = playbackManager.nextItem;
    if (next?.Id) {
      void updateNativePlayerNextEpisode(
        buildNextEpisodePayload(session, next),
      );
    } else {
      void updateNativePlayerNextEpisode(null);
    }
  }, [
    playbackManager.nextItem,
    isActive,
    buildNextEpisodePayload,
    syncPlay.enabled,
  ]);

  // MARK: - Present / load

  const beginSession = useCallback(
    async (
      req: PlayRequest,
      options: {
        item?: BaseItemDto;
        replace: boolean;
        /** The session a swap is for, when the caller holds it. */
        over?: NativeSession;
        isCurrent?: () => boolean;
        /** See presentFromRequest. */
        alertOnFailure?: boolean;
      },
    ): Promise<boolean> => {
      const currentSettings = settingsRef.current;
      if (!currentSettings) return false;
      // Another session took the player before this swap got here (an episode
      // picked while its item was still being fetched, the player closed and
      // something else played): it is not this swap's to replace, nor to win
      // the play request token from.
      if (
        options.over &&
        sessionRef.current &&
        sessionRef.current !== options.over
      ) {
        return true;
      }
      syncBufferingReporter.reset();
      const token = ++playRequestTokenRef.current;
      // The session a swap is meant for: the caller's, or the one on screen
      // when it was asked for.
      const requestedOver = options.over ?? sessionRef.current;

      const built = await buildNativePlayerConfig({
        api: apiRef.current,
        userId: userRef.current?.Id,
        settings: currentSettings,
        subtitleSizeLocked:
          pluginSettingsRef.current?.subtitleSize?.locked === true,
        req,
        getDownloadedItemById: downloadUtils.getDownloadedItemById,
        strings: buildNativePlayerStrings(t),
        originalLabel: t("common.original_audio"),
        item: options.item,
      }).catch((error) => {
        logAndCaptureError("NativePlayer config build failed", error, {
          offline: req.offline,
        });
        return null;
      });
      if (!built) {
        // With a player up, its item keeps playing. With none, and no newer
        // request on its way to open one, the user is left with nothing.
        if (
          options.alertOnFailure &&
          sessionRef.current === null &&
          token === playRequestTokenRef.current &&
          options.isCurrent?.() !== false
        ) {
          Alert.alert(t("player.error"), t("player.failed_to_get_stream_url"));
        }
        return false;
      }
      if (options.isCurrent?.() === false) {
        // The build may have opened a live stream nothing will play.
        releaseLiveStream(built.seed);
        return false;
      }
      if (syncRef.current.enabled && !req.offline) {
        built.config.syncPlay = nativeSyncStateRef.current || undefined;
        built.config.stream.autoplay = false;
        built.config.stream.startPositionSec =
          built.seed.startTicks / 10_000_000;
        built.config.nextEpisode = undefined;
        built.config.ui = {
          ...built.config.ui,
          initialPlaybackSpeed: 1,
          holdToSpeedEnabled: false,
        };
      }

      const session: NativeSession = {
        ...built.seed,
        isReady: false,
        isBuffering: true,
        syncPlaylistItemId: built.config.syncPlay?.currentPlaylistItemId,
        currentAudioIndex: built.seed.audioIndex,
        currentSubtitleIndex: built.seed.subtitleIndex,
        positionMs: built.seed.startTicks / 10_000,
        isPlaying: false,
        hasPlaybackStarted: false,
        reportedStopKey: null,
        awaitingLoad: true,
        committed: false,
        lastProgressReportAt: 0,
        subtitleSearchResults: null,
        subtitleSearchToken: 0,
        localSubtitle: null,
        localSubtitleMisses: 0,
        isMuted: false,
        autoSubtitle: INITIAL_AUTO_SUBTITLE_STATE,
        autoSubtitleWasMuted: false,
      };

      if (
        token !== playRequestTokenRef.current ||
        options.isCurrent?.() === false
      ) {
        // A newer play request started while this stream was negotiating —
        // abandon before touching sessionRef or the native player, and close
        // the live stream this build just opened on the server.
        releaseLiveStream(session);
        return false;
      }

      const previous = sessionRef.current;

      // A swap whose player closed before the swap could happen. Closed
      // because its stream ended, a request for another item (an episode
      // picked in the last seconds, a remote Play) still plays, in a new
      // player. Closed any other way (the close button, an error, the sleep
      // timer) the request is dropped: presenting would reopen a player that
      // was just closed, and iOS refuses it while that one still fades out
      // (Sentry REACT-NATIVE-BR).
      const continuesAfterStreamEnd = (closed: NativeSession | null) =>
        closed !== null &&
        lastDismissalRef.current?.session === closed &&
        lastDismissalRef.current.reason === "playbackEnded" &&
        closed.item.Id !== session.item.Id;
      // A swap whose player never opened (its presentation was refused while
      // this request negotiated) reopens nothing: it plays, in a new player.
      const neverOpened = (target: NativeSession | null) =>
        target !== null && unpresentedRef.current === target;
      const dropSwap = () => {
        writeToLog(
          "INFO",
          "NativePlayer swap dropped: the player closed during negotiation",
        );
        releaseLiveStream(session);
      };
      if (
        options.replace &&
        !previous &&
        !continuesAfterStreamEnd(requestedOver) &&
        !neverOpened(requestedOver)
      ) {
        dropSwap();
        return true;
      }

      // Same-item swap: the search results stay valid on the new session, and
      // an ACTIVE client-side sidecar must survive the reload (mpv's loadfile
      // drops sub-added tracks; onLoad re-attaches it).
      if (options.replace && previous && previous.item.Id === session.item.Id) {
        session.subtitleSearchResults = previous.subtitleSearchResults;
        if (previous.localSubtitle?.active) {
          session.localSubtitle = previous.localSubtitle;
        }
      }

      if (previous) {
        // Mute belongs to the device and the engine, not to the item: it does
        // not reset when the next episode starts.
        session.isMuted = previous.isMuted;
        session.autoSubtitle =
          previous.item.Id === session.item.Id
            ? previous.autoSubtitle
            : // A new item: the app hands the previous subtitle selection over
              // (rememberSubtitleSelections), so a track this feature applied
              // can arrive already active and would otherwise never be turned
              // back off. onLoad adopts it while the sound is still off.
              carryAutoSubtitleState(previous.autoSubtitle, {
                isMuted: previous.isMuted,
              });
        session.autoSubtitleWasMuted =
          previous.item.Id === session.item.Id
            ? previous.autoSubtitleWasMuted
            : false;
      }

      // Into the player on screen (load), or into a new one (present).
      let swapIn = !!(options.replace && previous);
      try {
        if (swapIn && previous) {
          // Close the OLD server session only now that the new stream is
          // fully negotiated — a config-build failure above must leave the
          // old session playing and reportable.
          await reportPlaybackStopped(previous);
          releaseLiveStream(previous);
          // A newer request started during that round trip: yield to it, as
          // the token check above does, so the newest request still wins.
          if (
            token !== playRequestTokenRef.current ||
            options.isCurrent?.() === false
          ) {
            releaseLiveStream(session);
            return false;
          }
          // A dismiss landed during the round trip (teardownSession clears
          // sessionRef at once): there is no `previous` to swap out, and a
          // load issued now would land on a dismissing session. The rule
          // above decides between a new player and none.
          if (sessionRef.current !== previous) {
            if (!continuesAfterStreamEnd(previous) && !neverOpened(previous)) {
              dropSwap();
              return true;
            }
            swapIn = false;
          }
        }
        if (swapIn && previous) {
          if (syncRef.current.enabled) {
            previous.isReady = false;
            previous.isBuffering = true;
            syncRef.current.notifyBuffering(true);
          }
          sessionRef.current = session;
          await loadNativePlayerStream(built.config);
        } else {
          // iOS refuses a new player while the one that closed is still
          // fading out, after it has emitted onDismiss.
          await waitForClosingNativePlayer();
          if (
            token !== playRequestTokenRef.current ||
            options.isCurrent?.() === false
          ) {
            releaseLiveStream(session);
            return false;
          }
          // Lock orientation BEFORE presenting: expo-screen-orientation owns
          // the window orientation mask, and presenting a landscape-only VC
          // against a portrait-only mask crashes with
          // UIApplicationInvalidInterfaceOrientation.
          if (currentSettings.defaultVideoOrientation !== undefined) {
            lockOrientation(currentSettings.defaultVideoOrientation);
          }
          sessionRef.current = session;
          await presentNativePlayer(built.config);
        }
      } catch (error) {
        if (String(error).includes("NoActivePlayerException")) {
          // The user dismissed the player while the replace negotiation was
          // still in flight — a routine race, recovered below.
          writeErrorLog("NativePlayer load raced dismissal", {
            replace: !!options.replace,
          });
        } else {
          logAndCaptureError("NativePlayer present/load failed", error, {
            replace: !!options.replace,
          });
        }
        const outcome = resolveFailedPresentation({
          sessionIsCurrent: sessionRef.current === session,
          swapped: swapIn,
          playerPresented: isNativePlayerPresented(),
        });
        if (outcome === "restore") {
          // The swap failed with the player still up on the old stream: its
          // server session is already closed and the stream state is unknown,
          // so tear the whole player down (onDismiss handles the rest)
          // instead of leaving a half-dead session behind.
          releaseLiveStream(session);
          sessionRef.current = previous;
          void dismissNativePlayer();
          // That leaves the viewer with no player, as a refused presentation
          // does.
          if (
            options.alertOnFailure &&
            token === playRequestTokenRef.current &&
            options.isCurrent?.() !== false
          ) {
            Alert.alert(
              t("player.error"),
              t("player.an_error_occurred_while_playing_the_video"),
            );
          }
        } else if (outcome === "player-gone") {
          // The player closed while the swap was in flight (a close tap, or
          // the outgoing stream reaching its end) and no onDismiss can be
          // relied on for this session: one may still be queued, but
          // dismiss() with nothing presented resolves silently. Restoring
          // `previous` here left a session nothing could clear once its own
          // teardown had finished, so every later play took the replace path
          // against no player.
          releaseLiveStream(session);
          sessionRef.current = null;
          setActiveItem(null);
          setIsActive(false);
          revalidateProgressCache();
          unlockOrientation();
        } else if (outcome === "unpresented") {
          // Only a new player goes unpresented, with no session left behind:
          // a request whose own player closed has none to restore.
          releaseLiveStream(session);
          sessionRef.current = null;
          unpresentedRef.current = session;
          unlockOrientation();
          // A newer request that is still negotiating opens its own player.
          if (
            options.alertOnFailure &&
            token === playRequestTokenRef.current &&
            options.isCurrent?.() !== false
          ) {
            Alert.alert(
              t("player.error"),
              t("player.an_error_occurred_while_playing_the_video"),
            );
          }
        }
        // "closed": onDismiss or a newer request already moved sessionRef and
        // released this session's stream. Both it and "player-gone" resolve
        // true: the player was closed under this request or a newer request
        // took it, and a false return would report a failure for an item the
        // user just closed.
        return outcome === "closed" || outcome === "player-gone";
      }

      // The player can go away while the native call is in flight (a close
      // tap, or the outgoing stream reaching its end; iOS load() still
      // resolves during the dismiss fade). onDismiss has already torn this
      // session down: a start report now would describe a player that no
      // longer exists, and a false return would report a failure for an item
      // the user just closed.
      if (sessionRef.current !== session) return true;
      session.committed = true;
      setActiveItem(session.item);
      setIsActive(true);
      reportPlaybackStart(session);
      void pushSegments(session);
      void pushEpisodeList(session);
      // A stream swap of the same episode reloads native, which drops the
      // next-episode payload, and nextItem does not change to push it again.
      const next = nextItemRef.current;
      if (previous?.item.Id === session.item.Id && next?.Id) {
        void updateNativePlayerNextEpisode(
          buildNextEpisodePayload(session, next),
        );
      }
      return true;
    },
    [
      downloadUtils,
      t,
      lockOrientation,
      unlockOrientation,
      reportPlaybackStart,
      reportPlaybackStopped,
      releaseLiveStream,
      revalidateProgressCache,
      pushSegments,
      pushEpisodeList,
      buildNextEpisodePayload,
      syncBufferingReporter,
    ],
  );

  const presentFromRequest = useCallback(
    async (
      req: PlayRequest,
      options?: { isCurrent?: () => boolean; alertOnFailure?: boolean },
    ): Promise<boolean> => {
      // Present while a session is active (e.g. WS Play command) swaps in
      // place; beginSession closes the old server session once the new
      // stream is negotiated. A new player starts from an empty subtitle
      // cache (see clearSubtitlePrefetchCache) and warms its next items again.
      if (sessionRef.current === null) {
        clearSubtitlePrefetchCache();
        warmedSubtitleItemIdsRef.current.clear();
      }
      return beginSession(req, {
        replace: sessionRef.current !== null,
        isCurrent: options?.isCurrent,
        alertOnFailure: options?.alertOnFailure,
      });
    },
    [beginSession],
  );

  /**
   * Same-item stream re-negotiation (tracks/bitrate), resuming in place.
   * Resolves false when the swap failed (beginSession swallows and reports
   * its own errors) — callers that promise success must check. A swap
   * abandoned because the player closed under it resolves true.
   */
  const replaceStream = useCallback(
    async (
      session: NativeSession,
      overrides: {
        audioIndex?: number;
        subtitleIndex?: number;
        positionTicks?: number;
        /** New max bitrate; null = "Max" (no cap). Omit to keep the current. */
        bitrateValue?: number | null;
      },
    ): Promise<boolean> => {
      const req: PlayRequest = {
        itemId: session.item.Id!,
        audioIndex: overrides.audioIndex ?? session.currentAudioIndex,
        subtitleIndex: overrides.subtitleIndex ?? session.currentSubtitleIndex,
        mediaSourceId: session.mediaSourceId,
        bitrateValue:
          overrides.bitrateValue === undefined
            ? session.bitrateValue
            : (overrides.bitrateValue ?? undefined),
        offline: session.offline,
        playbackPositionTicks:
          overrides.positionTicks ?? msToTicks(session.positionMs),
      };
      return beginSession(req, {
        item: session.item,
        replace: true,
        over: session,
      });
    },
    [beginSession],
  );

  /** Switch to another episode in place, carrying over live selections. */
  const playAdjacentItem = useCallback(
    async (session: NativeSession, target: BaseItemDto) => {
      const currentSettings = settingsRef.current;
      if (!currentSettings || !target.Id) return;

      const {
        mediaSource: newMediaSource,
        audioIndex: defaultAudioIndex,
        subtitleIndex: defaultSubtitleIndex,
      } = getDefaultPlaySettings(target, currentSettings, {
        indexes: {
          subtitleIndex: session.currentSubtitleIndex,
          audioIndex: session.currentAudioIndex,
        },
        source: session.stream.mediaSource,
        offline: session.offline,
      });

      const req: PlayRequest = {
        itemId: target.Id,
        audioIndex: defaultAudioIndex,
        subtitleIndex: defaultSubtitleIndex,
        mediaSourceId: newMediaSource?.Id ?? undefined,
        bitrateValue: session.bitrateValue,
        offline: session.offline,
        playbackPositionTicks:
          getAdjacentStartTicks(
            target,
            newMediaSource,
            session.offline,
            serverVersionRef.current,
          ) ?? undefined,
      };
      // Target came from the adjacent-items query without full MediaSources —
      // let the builder refetch it online; offline uses the downloads DB.
      await beginSession(req, {
        item: session.offline ? target : undefined,
        replace: true,
        over: session,
      });
    },
    [beginSession],
  );

  const teardownSession = useCallback(
    async (session: NativeSession, finalPositionSec?: number) => {
      // Release the ref before the report round trips: a play request that
      // lands during them must see no session, or it takes the replace path
      // against a player that is already gone.
      if (sessionRef.current === session) {
        sessionRef.current = null;
        setActiveItem(null);
        setIsActive(false);
      }
      const positionMs = resolveTeardownReport(session, finalPositionSec);
      if (positionMs !== null) {
        session.positionMs = positionMs;
        const positionTicks = msToTicks(positionMs);
        // Final progress write first: it also lands in the downloads DB for
        // offline items (5%/90% thresholds), then close the server session.
        const info = buildProgressInfo(session);
        // Enqueue both before yielding: a newly presented session must not
        // start on the server before this outgoing session's Stop arrives.
        const finalProgress = reportNativeProgress(session, info, true);
        const stopped = reportPlaybackStopped(session, positionTicks);
        try {
          await finalProgress;
        } catch {}
        // Both reports carry the ticks resolved above; the stop report does
        // not re-read session.positionMs after the await.
        await stopped;
      } else {
        reportQueue.closeSession(session);
      }
      // The stream was negotiated on the server whether or not it loaded.
      releaseLiveStream(session);
      revalidateProgressCache();
      // A play request that landed during the report round trips owns the
      // player now and holds its own orientation lock.
      if (sessionRef.current === null) {
        unlockOrientation();
      }
    },
    [
      buildProgressInfo,
      reportNativeProgress,
      reportQueue,
      reportPlaybackStopped,
      releaseLiveStream,
      revalidateProgressCache,
      unlockOrientation,
    ],
  );

  // MARK: - Track selection

  const applySubtitleSelection = useCallback(
    async (session: NativeSession, jellyfinIndex: number) => {
      const subtitleStreams = session.stream.mediaSource.MediaStreams?.filter(
        (s) => s.Type === "Subtitle",
      );
      return applyMpvSubtitleSelection(nativePlayerSubtitleFacade, {
        subtitleStreams,
        jellyfinSubtitleIndex: jellyfinIndex,
        getExpectedExternalUrl: (s) =>
          getExternalSubtitleUrl(s, {
            offline: session.offline,
            basePath: apiRef.current?.basePath,
          }),
      });
    },
    [],
  );

  const pushTrackMenus = useCallback(
    (session: NativeSession) => {
      void updateNativePlayerTrackMenus(
        buildTrackMenus({
          mediaSource: session.stream.mediaSource,
          audioIndex: session.currentAudioIndex,
          // While the local sidecar is active no server stream (nor "Off")
          // may show a checkmark — a sidecar index matches no server row.
          subtitleIndex: session.localSubtitle?.active
            ? localSubtitleIndex(0)
            : session.currentSubtitleIndex,
          offline: session.offline,
          downloadedItem: session.downloadedItem,
          offLabel: buildNativePlayerStrings(t).off ?? "None",
          originalLabel: t("common.original_audio"),
          bitrateValue: session.bitrateValue,
          localSubtitle: session.localSubtitle
            ? {
                label: session.localSubtitle.label,
                selected: session.localSubtitle.active,
              }
            : undefined,
        }),
      );
    },
    [t],
  );

  /** Select the client-side downloaded sidecar on the mpv handle by filename. */
  const applyLocalSubtitleSelection = useCallback(
    async (session: NativeSession) => {
      const local = session.localSubtitle;
      if (!local) return;
      const tracks = await nativePlayerGetSubtitleTracks();
      const fileName = local.path.split("/").pop();
      // Newest-first: a re-download with the same filename adds a SECOND
      // track with an identical external-filename — mpv ids grow, so the
      // last match is the fresh one.
      const track = [...tracks]
        .reverse()
        .find(
          (candidate) =>
            candidate.external &&
            typeof candidate.externalFilename === "string" &&
            (candidate.externalFilename === local.path ||
              (!!fileName && candidate.externalFilename.endsWith(fileName))),
        );
      if (track) {
        session.localSubtitleMisses = 0;
        await nativePlayerSetSubtitleTrack(track.id);
      } else if (sessionRef.current === session && session.localSubtitle) {
        // Tolerate one miss — after a swap, the embedded tracks' onTracksReady
        // can fire before the re-added sidecar lands. Two consecutive misses
        // mean it's genuinely gone (failed re-add, cleared cache): stop
        // claiming it rather than leaving a dead checkmark with no subtitles
        // and no way back to the server selection.
        session.localSubtitleMisses += 1;
        if (session.localSubtitleMisses >= 2) {
          session.localSubtitle.active = false;
          pushTrackMenus(session);
        }
      }
    },
    [pushTrackMenus],
  );

  const handleAudioSelection = useCallback(
    async (
      session: NativeSession,
      jellyfinIndex: number,
      positionSec: number,
    ) => {
      // A track the stream does not carry (any other on a transcode, an
      // external audio file on a direct stream) needs a re-negotiated stream
      // (mirror of handleAudioIndexChange).
      const target = resolveAudioSwitch(
        session.stream.mediaSource,
        jellyfinIndex,
      );
      if (target.reload) {
        await replaceStream(session, {
          audioIndex: jellyfinIndex,
          positionTicks: msToTicks(positionSec * 1000),
        });
        return;
      }
      session.currentAudioIndex = jellyfinIndex;
      await nativePlayerSetAudioTrack(target.mpvId);
      pushTrackMenus(session);
    },
    [replaceStream, pushTrackMenus],
  );

  const handleSubtitleSelection = useCallback(
    async (
      session: NativeSession,
      jellyfinIndex: number,
      positionSec: number,
    ) => {
      if (isLocalSubtitleIndex(jellyfinIndex)) {
        // Re-activating the client-side sidecar — an mpv-only selection.
        if (session.localSubtitle) {
          session.localSubtitle.active = true;
          session.currentSubtitleIndex = -1;
          await applyLocalSubtitleSelection(session);
          pushTrackMenus(session);
        }
        return;
      }
      if (session.localSubtitle) {
        // Any server track (or Off) deactivates the sidecar; it stays in the
        // menu for switching back.
        session.localSubtitle.active = false;
      }
      const subs = session.stream.mediaSource.MediaStreams?.filter(
        (s) => s.Type === "Subtitle",
      );
      const isTranscoding = Boolean(session.stream.mediaSource.TranscodingUrl);
      const target = subs?.find((s) => s.Index === jellyfinIndex);
      const current = subs?.find(
        (s) => s.Index === session.currentSubtitleIndex,
      );
      // Burned-in subs are pixels, not tracks: switching TO one and switching
      // AWAY from an active one both need a server re-process.
      const needsReplace =
        isTranscoding &&
        ((target && isImageBasedSubtitle(target)) ||
          (current && isImageBasedSubtitle(current)));
      if (needsReplace) {
        await replaceStream(session, {
          subtitleIndex: jellyfinIndex,
          positionTicks: msToTicks(positionSec * 1000),
        });
        return;
      }

      session.currentSubtitleIndex = jellyfinIndex;
      const result = await applySubtitleSelection(session, jellyfinIndex);
      // The native round trip is not session-bound: a swap landing during it
      // makes `session` the outgoing one.
      if (sessionRef.current !== session) return;
      if (result.kind === "notFound" || result.kind === "burnedIn") {
        // A sidecar the prefetch left out has no track yet: renegotiating
        // prefetches it again, first and with a fresh budget, and keeps its
        // remote URL if the budget runs out, so the pick is never lost.
        await replaceStream(session, {
          subtitleIndex: jellyfinIndex,
          positionTicks: msToTicks(positionSec * 1000),
        });
        return;
      }
      pushTrackMenus(session);
    },
    [
      applySubtitleSelection,
      applyLocalSubtitleSelection,
      replaceStream,
      pushTrackMenus,
    ],
  );

  /**
   * Run the automatic-subtitles-on-mute policy (`utils/autoSubtitleOnMute`)
   * for this session.
   */
  const evaluateAutoSubtitle = useCallback(
    (session: NativeSession, isMuted: boolean, positionSec: number) => {
      const settings = settingsRef.current;
      if (!settings?.subtitlesOnMute) return;

      const streams = session.stream.mediaSource.MediaStreams ?? [];
      const subtitleStreams = streams.filter((s) => s.Type === "Subtitle");
      // A client-side sidecar shows without a server index. Report it in the
      // sentinel block so the policy sees "a subtitle is already on" rather
      // than "off".
      const currentSubtitleIndex = session.localSubtitle?.active
        ? localSubtitleIndex(0)
        : session.currentSubtitleIndex;

      const audioStreams = streams.filter((s) => s.Type === "Audio");
      const audioLanguage = (
        audioStreams.find((s) => s.Index === session.currentAudioIndex) ??
        audioStreams.find(
          (s) => s.Index === session.stream.mediaSource.DefaultAudioStreamIndex,
        ) ??
        audioStreams.find((s) => s.IsDefault) ??
        audioStreams[0]
      )?.Language;

      const { action, state } = resolveAutoSubtitleAction({
        state: session.autoSubtitle,
        isMuted,
        wasMuted: session.autoSubtitleWasMuted,
        currentSubtitleIndex,
        currentTrack: findSubtitleTrackIdentity(
          subtitleStreams,
          currentSubtitleIndex,
        ),
        pick: () =>
          pickAutoSubtitleTrack({
            subtitleStreams,
            preferredLanguage:
              settings.defaultSubtitleLanguage?.ThreeLetterISOLanguageName,
            audioLanguage,
            isTranscoding: Boolean(session.stream.mediaSource.TranscodingUrl),
            allowStreamRestart: settings.subtitlesOnMuteAllowRestart,
          }),
      });

      session.autoSubtitle = state;
      session.autoSubtitleWasMuted = isMuted;

      if (action.kind === "apply") {
        void handleSubtitleSelection(session, action.index, positionSec);
        void nativePlayerShowNotice(t("player.auto_subtitles_enabled"));
      } else if (action.kind === "revert") {
        void handleSubtitleSelection(session, SUBTITLES_OFF, positionSec);
      } else if (action.kind === "notice") {
        void nativePlayerShowNotice(
          action.reason === "restart-required"
            ? t("player.auto_subtitles_restart_required")
            : t("player.auto_subtitles_none"),
        );
      }
    },
    [handleSubtitleSelection, t],
  );

  const handleMuteChanged = useCallback(
    (session: NativeSession, muted: boolean, positionSec: number) => {
      session.isMuted = muted;
      evaluateAutoSubtitle(session, muted, positionSec);
    },
    [evaluateAutoSubtitle],
  );

  // MARK: - Remote subtitle search/download (native search sheet)

  const handleSubtitleSearch = useCallback(
    async (session: NativeSession, language: string) => {
      // Only the newest in-flight search may push — a slow response for a
      // previously picked language must not overwrite fresher results.
      const token = ++session.subtitleSearchToken;
      try {
        const results = await remoteSubtitlesRef.current.searchAsync({
          language,
        });
        if (
          sessionRef.current !== session ||
          session.subtitleSearchToken !== token
        ) {
          return;
        }
        session.subtitleSearchResults = results;
        await updateNativePlayerSubtitleSearch({
          status: "results",
          results: mapSearchResults(results),
        });
      } catch (error) {
        if (
          sessionRef.current !== session ||
          session.subtitleSearchToken !== token
        ) {
          return;
        }
        const message = subtitleSearchErrorMessage(
          error,
          remoteSubtitlesRef.current.hasOpenSubtitlesApiKey,
          t,
        );
        void updateNativePlayerSubtitleSearch({
          status: "error",
          results: [],
          errorMessage: message,
        });
      }
    },
    [t],
  );

  /**
   * A server-side download saves the file next to the media and refreshes the
   * item asynchronously — poll until a subtitle stream that wasn't in the
   * pre-download set appears, so the stream reload can select it.
   */
  const waitForNewServerSubtitle = useCallback(
    async (
      session: NativeSession,
      result: SubtitleSearchResult,
    ): Promise<number | undefined> => {
      const before = new Set(
        session.stream.mediaSource.MediaStreams?.filter(
          (s) => s.Type === "Subtitle",
        ).map((s) => s.Index),
      );
      for (let attempt = 0; attempt < 8; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        if (sessionRef.current !== session || !apiRef.current) return undefined;
        const res = await getLibraryApi(apiRef.current)
          .getItem({ itemId: session.item.Id!, userId: userRef.current?.Id })
          .catch(() => null);
        const source =
          res?.data?.MediaSources?.find(
            (s) => s.Id === session.mediaSourceId,
          ) ?? res?.data?.MediaSources?.[0];
        const fresh = source?.MediaStreams?.filter(
          (s) => s.Type === "Subtitle" && !before.has(s.Index),
        );
        if (fresh?.length) {
          const match =
            fresh.find((s) => s.Language === result.language) ?? fresh[0];
          return match.Index ?? undefined;
        }
      }
      return undefined;
    },
    [],
  );

  /** Push a download failure as an inline banner over the intact result list. */
  const pushDownloadFailure = useCallback(
    (session: NativeSession, message: string) => {
      void updateNativePlayerSubtitleSearch({
        status: "results",
        results: mapSearchResults(session.subtitleSearchResults ?? []),
        errorMessage: message,
      });
    },
    [],
  );

  const handleSubtitleDownload = useCallback(
    async (session: NativeSession, resultId: string) => {
      const result = session.subtitleSearchResults?.find(
        (r) => r.id === resultId,
      );
      if (!result) {
        void updateNativePlayerSubtitleSearch({ status: "idle", results: [] });
        return;
      }
      try {
        const downloaded =
          await remoteSubtitlesRef.current.downloadAsync(result);
        if (sessionRef.current !== session) return;
        if (downloaded.type === "server") {
          // The subtitle now lives in the server library — re-negotiate the
          // stream so the fresh PlaybackInfo carries it, selected when found.
          // Resume from the live position: playback kept running while the
          // download and the poll were in flight.
          const newIndex = await waitForNewServerSubtitle(session, result);
          if (sessionRef.current !== session) return;
          if (newIndex === undefined) {
            // Downloaded, but the server hasn't surfaced the stream yet —
            // don't reload into the old selection and call it a success.
            pushDownloadFailure(session, t("player.subtitle_apply_failed"));
            return;
          }
          const replaced = await replaceStream(session, {
            subtitleIndex: newIndex,
            positionTicks: msToTicks(session.positionMs),
          });
          if (!replaced) {
            if (sessionRef.current === session) {
              pushDownloadFailure(session, t("player.subtitle_apply_failed"));
            }
            return;
          }
          void updateNativePlayerSubtitleSearch({
            status: "applied",
            results: [],
          });
        } else if (downloaded.type === "local" && downloaded.path) {
          // Client-side OpenSubtitles file: attach the sidecar to the live
          // mpv handle. The server never learns about it, so the reported
          // subtitle index drops to "off".
          let target = session;
          const isTranscoding = Boolean(
            session.stream.mediaSource.TranscodingUrl,
          );
          const currentStream = session.stream.mediaSource.MediaStreams?.find(
            (s) =>
              s.Type === "Subtitle" && s.Index === session.currentSubtitleIndex,
          );
          if (
            isTranscoding &&
            currentStream &&
            isImageBasedSubtitle(currentStream)
          ) {
            // The active subtitle is burned into the transcode — without a
            // re-negotiation to plain video, both would render at once.
            const replaced = await replaceStream(session, {
              subtitleIndex: -1,
              positionTicks: msToTicks(session.positionMs),
            });
            const fresh = sessionRef.current;
            if (!replaced || !fresh || fresh.item.Id !== session.item.Id) {
              if (sessionRef.current === session) {
                pushDownloadFailure(session, t("player.subtitle_apply_failed"));
              }
              return;
            }
            target = fresh;
          }
          // Attach and VERIFY before committing any state — native swallows
          // mpv sub-add errors, and a silently failed add must not latch the
          // sidecar branch over the user's server selection.
          await nativePlayerAddExternalSubtitle(downloaded.path);
          const tracks = await nativePlayerGetSubtitleTracks();
          const fileName = downloaded.path.split("/").pop();
          const added = [...tracks]
            .reverse()
            .find(
              (candidate) =>
                candidate.external &&
                typeof candidate.externalFilename === "string" &&
                (candidate.externalFilename === downloaded.path ||
                  (!!fileName &&
                    candidate.externalFilename.endsWith(fileName))),
            );
          if (sessionRef.current !== target) return;
          if (!added) {
            pushDownloadFailure(target, t("player.subtitle_apply_failed"));
            return;
          }
          target.localSubtitle = {
            path: downloaded.path,
            label: result.name,
            active: true,
          };
          target.localSubtitleMisses = 0;
          target.currentSubtitleIndex = -1;
          await nativePlayerSetSubtitleTrack(added.id);
          pushTrackMenus(target);
          void updateNativePlayerSubtitleSearch({
            status: "applied",
            results: [],
          });
        }
      } catch (error) {
        if (sessionRef.current !== session) return;
        pushDownloadFailure(
          session,
          error instanceof Error ? error.message : String(error),
        );
      }
    },
    [
      replaceStream,
      waitForNewServerSubtitle,
      pushTrackMenus,
      pushDownloadFailure,
      t,
    ],
  );

  // MARK: - Native event listeners

  useEffect(() => {
    const subscriptions = [
      addNativePlayerListener("onSyncPlayAction", (payload) => {
        const session = sessionRef.current;
        if (payload.action === "ended") {
          if (
            !session?.isReady ||
            session.awaitingLoad ||
            session.syncPlaylistItemId !== syncRef.current.currentPlaylistItemId
          )
            return;
          payload = {
            ...payload,
            playlistItemId: session.syncPlaylistItemId,
          };
        }
        void dispatchNativeSyncPlayAction(syncRef.current, payload).catch(
          () => {
            if (syncRef.current.error)
              void nativePlayerShowNotice(syncRef.current.error);
          },
        );
      }),
      addNativePlayerListener("onLoad", (payload) => {
        const session = sessionRef.current;
        if (!session) return;
        // An in-place swap can deliver the outgoing stream's onLoad late; in a
        // group it would report Ready for an item still loading, and solo its
        // progress would land on the new item.
        if (!applyLoadEvent(session, payload)) {
          // Without the URLs: they carry the access token. A session that
          // keeps waiting after this line never got its own load event.
          writeToLog(
            "INFO",
            "NativePlayer ignored a load event for another stream",
          );
          return;
        }
        if (session.localSubtitle?.active) {
          // The swap's loadfile dropped the sub-added sidecar — re-attach it
          // (selection re-applies on onTracksReady) and restore its menu
          // entry, which the fresh config's menus lack.
          void nativePlayerAddExternalSubtitle(session.localSubtitle.path);
          pushTrackMenus(session);
        }
      }),

      addNativePlayerListener("onProgress", (payload) => {
        const session = sessionRef.current;
        if (!session || session.awaitingLoad) return;
        const due = applyProgressTick(
          session,
          payload,
          Date.now(),
          PROGRESS_REPORT_INTERVAL,
        );
        const info = due ? buildProgressInfo(session) : null;
        if (syncRef.current.enabled && !payload.trackingOnly) {
          syncRef.current.notifyProgress();
        }
        if (info) void reportNativeProgress(session, info).catch(() => {});
      }),

      addNativePlayerListener("onPlaybackStateChange", (payload) => {
        const session = sessionRef.current;
        if (!session || session.awaitingLoad) return;
        if (typeof payload.isReadyToSeek === "boolean") {
          session.isReady = payload.isReadyToSeek;
        }
        if (typeof payload.isLoading === "boolean") {
          session.isBuffering = payload.isLoading;
          if (syncRef.current.enabled)
            syncBufferingReporter.update(payload.isLoading, session.isReady);
        }
        if (payload.isReadyToSeek === true) {
          if (syncRef.current.enabled) syncRef.current.notifyReady();
        }
        if (payload.isPlaying === undefined && payload.isPaused === undefined) {
          return;
        }
        const nowPlaying = payload.isPlaying ?? !payload.isPaused;
        const changed = session.isPlaying !== nowPlaying;
        session.isPlaying = nowPlaying;
        if (nowPlaying) session.hasPlaybackStarted = true;
        // Pause/resume transitions report immediately.
        if (changed && session.hasPlaybackStarted && !session.reportedStopKey) {
          void reportNativeProgress(session, buildProgressInfo(session)).catch(
            () => {},
          );
        }
      }),

      addNativePlayerListener("onTracksReady", () => {
        const session = sessionRef.current;
        if (!session || session.awaitingLoad) return;
        // Re-apply the current selection on every fire — it fires again after
        // each external sub-add and the identity re-apply is idempotent.
        if (session.localSubtitle?.active) {
          // The active selection is the client-side sidecar, which the
          // Jellyfin-index resolver knows nothing about.
          void applyLocalSubtitleSelection(session);
        } else {
          // The session's subtitle is the prefetch's preferred one, never left
          // without a URL, so it always resolves to a track here.
          void applySubtitleSelection(session, session.currentSubtitleIndex);
        }
        // The automation waits for tracksReady: a track picked before mpv has
        // enumerated them would resolve to notFound and pointlessly
        // re-negotiate the stream.
        // Covers both a player opened muted and a track carried over from the
        // previous episode while the sound stayed off.
        evaluateAutoSubtitle(
          session,
          session.isMuted,
          session.positionMs / 1000,
        );
      }),

      // NO awaitingLoad gate on these two: they originate from sheet taps,
      // not from the outgoing stream, and sessionRef already points at the
      // new session during a swap. Dropping them would leave the sheet's
      // "searching"/"downloading" state spinning forever.
      addNativePlayerListener("onSubtitleSearchRequested", (payload) => {
        const session = sessionRef.current;
        if (!session) return;
        void handleSubtitleSearch(session, payload.language);
      }),

      addNativePlayerListener("onSubtitleDownloadRequested", (payload) => {
        const session = sessionRef.current;
        if (!session) return;
        void handleSubtitleDownload(session, payload.resultId);
      }),

      addNativePlayerListener("onTrackSelectionRequested", (payload) => {
        const session = sessionRef.current;
        if (!session || session.awaitingLoad) return;
        if (payload.kind === "audio") {
          rememberSeriesSelection(
            session,
            "audio",
            payload.jellyfinIndex,
            settingsRef.current,
          );
          void handleAudioSelection(
            session,
            payload.jellyfinIndex,
            payload.positionSec,
          );
        } else {
          // A manual pick takes ownership back from the mute automation, but
          // only when it had something to own: a pick made before the feature
          // ever acted must not disable it for the rest of the item.
          if (
            session.autoSubtitle.appliedIndex !== null ||
            session.autoSubtitle.carriedTrack !== null
          ) {
            session.autoSubtitle = {
              ...INITIAL_AUTO_SUBTITLE_STATE,
              released: true,
            };
          }
          rememberSeriesSelection(
            session,
            "subtitle",
            payload.jellyfinIndex,
            settingsRef.current,
          );
          void handleSubtitleSelection(
            session,
            payload.jellyfinIndex,
            payload.positionSec,
          );
        }
      }),

      addNativePlayerListener("onMuteStateChanged", (payload) => {
        const session = sessionRef.current;
        if (!session || session.awaitingLoad) return;
        handleMuteChanged(session, payload.muted, payload.positionSec);
      }),

      addNativePlayerListener("onNextEpisodeRequested", (payload) => {
        const session = sessionRef.current;
        // awaitingLoad guard: the outgoing stream can reach EOF during an
        // in-place swap and re-request the next episode — advancing twice.
        if (!session || session.awaitingLoad) return;
        session.positionMs = payload.positionSec * 1000;
        if (syncRef.current.enabled) {
          void syncRef.current.requestNext().catch(() => {});
          return;
        }
        const next = nextItemRef.current;
        if (!next) {
          void dismissNativePlayer();
          return;
        }
        const currentSettings = settingsRef.current;
        const isAutoplay = payload.reason === "countdown";
        if (isAutoplay) {
          // A countdown fired twice for one session (before the swap lands)
          // is one autoplay, not two.
          if (countdownAdvancedRef.current.has(session)) return;
          countdownAdvancedRef.current.add(session);
          // Native only counts down on a payload that allowed autoplay, so
          // the prompt has had its say; only autoplay itself may refuse.
          if (!(currentSettings?.autoPlayNextEpisode ?? false)) {
            void dismissNativePlayer();
            return;
          }
          recordStillWatchingAutoplay();
        } else {
          // A deliberate tap, "Continue watching" included, starts a new
          // session.
          resetStillWatchingSession();
        }
        // Recorded before the swap, so the next episode's prompt is decided
        // with this autoplay counted; taken back when the swap does not take.
        const onSwapSettled = () => {
          if (sessionRef.current !== session) return;
          // Still on the episode that ended: a later countdown on this
          // session is a real request again, and no autoplay happened.
          countdownAdvancedRef.current.delete(session);
          if (isAutoplay) revertStillWatchingAutoplay();
        };
        playAdjacentItem(session, next).then(onSwapSettled, (error) => {
          // A swap that throws would otherwise leave the session marked as
          // advanced, and every later countdown on it ignored.
          logAndCaptureError("NativePlayer next episode swap failed", error, {
            itemId: next.Id,
          });
          onSwapSettled();
        });
      }),

      addNativePlayerListener("onPreviousEpisodeRequested", (payload) => {
        const session = sessionRef.current;
        if (!session || session.awaitingLoad) return;
        session.positionMs = payload.positionSec * 1000;
        if (syncRef.current.enabled) {
          void syncRef.current.requestPrevious().catch(() => {});
          return;
        }
        const previous = previousItemRef.current;
        if (!previous) return;
        resetStillWatchingSession();
        void playAdjacentItem(session, previous);
      }),

      addNativePlayerListener("onEpisodeSelected", (payload) => {
        const session = sessionRef.current;
        if (!session || session.awaitingLoad || !payload.itemId) return;
        session.positionMs = payload.positionSec * 1000;
        if (syncRef.current.enabled) {
          void syncRef.current
            .playItems([payload.itemId], 0, 0)
            .catch(() => {});
          return;
        }
        void (async () => {
          let target: BaseItemDto | undefined;
          if (session.offline) {
            target = downloadUtils.getDownloadedItemById(payload.itemId)
              ?.item as BaseItemDto | undefined;
          } else if (apiRef.current) {
            const res = await getLibraryApi(apiRef.current)
              .getItem({ itemId: payload.itemId, userId: userRef.current?.Id })
              .catch(() => null);
            target = res?.data;
          }
          if (!target) return;
          resetStillWatchingSession();
          await playAdjacentItem(session, target);
        })();
      }),

      addNativePlayerListener("onQualitySelected", (payload) => {
        const session = sessionRef.current;
        if (!session || session.awaitingLoad || session.offline) return;
        // -1 is the "Max" entry → no bitrate cap (undefined in the request).
        const requested =
          payload.bitrateValue === -1 ? null : payload.bitrateValue;
        if ((requested ?? null) === (session.bitrateValue ?? null)) return;
        void replaceStream(session, {
          bitrateValue: requested,
          positionTicks: msToTicks(payload.positionSec * 1000),
        });
      }),

      addNativePlayerListener("onSubtitleScaleChange", (payload) => {
        const session = sessionRef.current;
        if (!session) return;
        // Global setting. Native already applied it live on the engine.
        updateSettings({ subtitleSize: payload.scale });
      }),

      addNativePlayerListener("onOrientationChangeRequested", (payload) => {
        if (!sessionRef.current) return;
        // The in-player rotate button. The VC flipped its own mask, but when
        // the landscape-on-open setting armed a window-level
        // expo-screen-orientation lock, that mask outvotes the VC — re-lock
        // it to the requested orientation so the rotation actually happens.
        void lockOrientation(
          payload.orientation === "portrait"
            ? OrientationLock.PORTRAIT_UP
            : OrientationLock.LANDSCAPE,
        );
      }),

      addNativePlayerListener("onSpeedChange", (payload) => {
        // Persisted for every item (scope "all") so the next stream load
        // resolves the same speed instead of a stale one.
        const session = sessionRef.current;
        const currentSettings = settingsRef.current;
        if (!session || session.awaitingLoad || !currentSettings) return;
        if (syncRef.current.enabled) {
          void nativePlayerSetSpeed(1);
          return;
        }
        updatePlaybackSpeedSettings(
          payload.speed,
          PlaybackSpeedScope.All,
          session.item,
          currentSettings,
          updateSettings,
        );
      }),

      addNativePlayerListener("onPictureInPictureChange", (payload) => {
        nativePipRef.current = payload.isActive;
        // Informational; reporting continues off onProgress either way.
      }),

      addNativePlayerListener("onError", (payload) => {
        const session = sessionRef.current;
        logAndCaptureError("NativePlayer playback error", payload.error, {
          container: session?.stream?.mediaSource?.Container,
          transcoding: !!session?.stream?.mediaSource?.TranscodingUrl,
          offline: session?.offline,
          itemType: session?.item?.Type,
        });
      }),

      addNativePlayerListener("onPlaybackEnded", (payload) => {
        const session = sessionRef.current;
        // The outgoing stream's end during an in-place swap arrives here
        // first and its dismiss right behind it; the tracked position has to
        // survive intact for the teardown of a session whose own onLoad has
        // not arrived (resolveTeardownReport).
        if (!session || session.awaitingLoad) return;
        session.positionMs = payload.positionSec * 1000;
        if (
          syncRef.current.enabled &&
          session.isReady &&
          session.syncPlaylistItemId === syncRef.current.currentPlaylistItemId
        )
          syncRef.current.notifyEnded(session.syncPlaylistItemId);
      }),

      addNativePlayerListener("onDismiss", (payload) => {
        syncBufferingReporter.reset();
        const session = sessionRef.current;
        if (!session) return;
        nativePipRef.current = false;
        lastDismissalRef.current = { session, reason: payload.reason };
        // Closing the player is not leaving the group: only Leave is.
        if (syncRef.current.enabled && payload.reason !== "programmatic")
          void syncRef.current.stopWatching().catch(() => {});
        void teardownSession(session, payload.positionSec);
      }),
    ];

    return () => {
      for (const subscription of subscriptions) {
        subscription?.remove();
      }
    };
  }, [
    buildProgressInfo,
    reportNativeProgress,
    applySubtitleSelection,
    applyLocalSubtitleSelection,
    handleAudioSelection,
    handleSubtitleSelection,
    handleSubtitleSearch,
    handleSubtitleDownload,
    handleMuteChanged,
    evaluateAutoSubtitle,
    playAdjacentItem,
    pushTrackMenus,
    replaceStream,
    teardownSession,
    downloadUtils,
    updateSettings,
    lockOrientation,
    syncBufferingReporter,
  ]);

  // MARK: - Remote control (Jellyfin WebSocket)

  // Server-initiated "Play me this item". Lives here, not in
  // WebSocketProvider, so it sits next to the session logic.
  useEffect(
    () =>
      subscribe("Play", (data: unknown) => {
        const req = parseRemotePlayCommand(data);
        if (!req) return;
        if (syncRef.current.enabled && !req.offline) {
          void syncRef.current
            .playItems([req.itemId], 0, req.playbackPositionTicks || 0)
            .catch(() => {});
          return;
        }
        // Someone chose this play, from another client: a new session.
        resetStillWatchingSession();
        void presentFromRequest(req, { alertOnFailure: true });
      }),
    [subscribe, presentFromRequest],
  );

  // Remote control while the native player is up.
  useEffect(() => {
    const handle = (
      command: string | undefined,
      args?: Record<string, any>,
    ) => {
      if (!command) return;
      const session = sessionRef.current;
      if (!session) return;

      if (syncRef.current.enabled) {
        const sync = syncRef.current;
        switch (command) {
          case "PlayPause":
            void (
              session.isPlaying ? sync.requestPause() : sync.requestUnpause()
            ).catch(() => {});
            return;
          case "Pause":
            void sync.requestPause().catch(() => {});
            return;
          case "Unpause":
            void sync.requestUnpause().catch(() => {});
            return;
          case "Stop":
            void sync.requestStop().catch(() => {});
            return;
          case "Seek": {
            const ticks = Number(args?.SeekPositionTicks);
            if (Number.isFinite(ticks))
              void sync.requestSeek(ticks).catch(() => {});
            return;
          }
          case "NextTrack":
            void sync.requestNext().catch(() => {});
            return;
          case "PreviousTrack":
            void sync.requestPrevious().catch(() => {});
            return;
        }
      }

      switch (command) {
        case "PlayPause":
          void (session.isPlaying ? nativePlayerPause() : nativePlayerPlay());
          break;
        case "Pause":
          void nativePlayerPause();
          break;
        case "Unpause":
          void nativePlayerPlay();
          break;
        case "Stop":
          void dismissNativePlayer();
          break;
        case "ToggleMute":
          // Mutes the player, not the device: leaving the player while muted
          // must not strand the device at zero with nothing to restore it.
          void nativePlayerToggleMute();
          break;
        case "Seek": {
          const ticks = Number(args?.SeekPositionTicks);
          if (Number.isFinite(ticks)) {
            void nativePlayerSeekTo(ticksToSeconds(ticks));
          }
          break;
        }
        case "SetAudioStreamIndex": {
          const index = Number(args?.Index);
          if (Number.isFinite(index)) {
            void handleAudioSelection(
              session,
              index,
              session.positionMs / 1000,
            );
          }
          break;
        }
        case "SetSubtitleStreamIndex": {
          const index = Number(args?.Index);
          if (Number.isFinite(index)) {
            void handleSubtitleSelection(
              session,
              index,
              session.positionMs / 1000,
            );
          }
          break;
        }
        // Picked from another client: plays someone chose, new sessions.
        case "NextTrack": {
          const next = nextItemRef.current;
          if (!next) break;
          resetStillWatchingSession();
          void playAdjacentItem(session, next);
          break;
        }
        case "PreviousTrack": {
          const previous = previousItemRef.current;
          if (!previous) break;
          resetStillWatchingSession();
          void playAdjacentItem(session, previous);
          break;
        }
        default:
          break;
      }
    };

    const unsubscribeGeneral = subscribe("GeneralCommand", (data: any) =>
      handle(data?.Name, data?.Arguments),
    );
    // Playstate carries its own payload flat rather than under Arguments.
    const unsubscribePlaystate = subscribe("Playstate", (data: any) =>
      handle(data?.Command, data),
    );
    return () => {
      unsubscribeGeneral();
      unsubscribePlaystate();
    };
  }, [
    subscribe,
    handleAudioSelection,
    handleSubtitleSelection,
    playAdjacentItem,
  ]);

  // Logout mid-playback tears the player down.
  useEffect(() => {
    if (!user && sessionRef.current) {
      void dismissNativePlayer();
    }
  }, [user]);

  // The music player reads this to leave a remote's command to the video.
  useVideoSession(isActive);

  // BackHandler for Android: hardware back button dismisses presented native player
  useEffect(() => {
    if (!isActive) return;
    const backSub = BackHandler.addEventListener("hardwareBackPress", () => {
      void dismissNativePlayer();
      return true;
    });
    return () => {
      backSub.remove();
    };
  }, [isActive]);

  const contextValue = useMemo(
    () => ({ presentFromRequest, isActive }),
    [presentFromRequest, isActive],
  );

  return (
    <NativePlayerContext.Provider value={contextValue}>
      {children}
      {/* The Android player overlays the current screen without navigating,
          so the layouts' <SystemBars hidden={false} /> stays mounted and
          react-native-edge-to-edge re-shows the bars on every bar-style
          re-apply, undoing NativePlayerSession's native hide(). Winning the
          SystemBars stack for the session's lifetime keeps them hidden. */}
      {isActive && Platform.OS === "android" && <SystemBars hidden />}
    </NativePlayerContext.Provider>
  );
};

import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import {
  PlaybackOrder,
  type PlaybackProgressInfo,
  RepeatMode,
} from "@jellyfin/sdk/lib/generated-client";
import {
  getMediaInfoApi,
  getPlaystateApi,
  getTvShowsApi,
  getUserLibraryApi,
} from "@jellyfin/sdk/lib/utils/api";
import { router } from "expo-router";
import { OrientationLock } from "expo-screen-orientation";
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
import {
  PlaybackSpeedScope,
  updatePlaybackSpeedSettings,
} from "@/components/video-player/controls/utils/playback-speed-settings";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { useOrientation } from "@/hooks/useOrientation";
import { usePlaybackManager } from "@/hooks/usePlaybackManager";
import { useInvalidatePlaybackProgressCache } from "@/hooks/useRevalidatePlaybackProgressCache";
import {
  addNativePlayerListener,
  dismissNativePlayer,
  isNativePlayerModuleAvailable,
  isNativePlayerPresented,
  loadNativePlayerStream,
  type NativePlayerEpisodeListItem,
  type NativePlayerNextEpisode,
  type NativePlayerSegment,
  nativePlayerDisableSubtitles,
  nativePlayerGetSubtitleTracks,
  nativePlayerPause,
  nativePlayerPlay,
  nativePlayerSeekTo,
  nativePlayerSetAudioTrack,
  nativePlayerSetSubtitleTrack,
  presentNativePlayer,
  updateNativePlayerEpisodeList,
  updateNativePlayerNextEpisode,
  updateNativePlayerSegments,
  updateNativePlayerTrackMenus,
} from "@/modules/mpv-player";
import { useDownload } from "@/providers/DownloadProvider";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { useWebSocketContext } from "@/providers/WebSocketProvider";
import {
  getActiveVideoPlayer,
  isNativePlayerSupported,
  useSettings,
  VideoPlayer,
} from "@/utils/atoms/settings";
import { getDefaultPlaySettings } from "@/utils/jellyfin/getDefaultPlaySettings";
import { getPrimaryImageUrl } from "@/utils/jellyfin/image/getPrimaryImageUrl";
import {
  applyMpvSubtitleSelection,
  getExternalSubtitleUrl,
  getMpvAudioId,
  isImageBasedSubtitle,
  type SubtitleSelectablePlayer,
} from "@/utils/jellyfin/subtitleUtils";
import { writeToLog } from "@/utils/log";
import {
  buildNativePlayerConfig,
  buildNativePlayerStrings,
  buildTrackMenus,
  type NativePlayerSessionSeed,
} from "@/utils/nativePlayer/buildNativePlayerConfig";
import {
  type PlayRequest,
  toDirectPlayerQuery,
} from "@/utils/nativePlayer/playRequest";
import { fetchAndParseSegments, getSegmentsForItem } from "@/utils/segments";
import { msToTicks, ticksToSeconds } from "@/utils/time";

const PROGRESS_REPORT_INTERVAL = 10_000;
const NEXT_EPISODE_COUNTDOWN_SECONDS = 10;

/**
 * One presented native-player session. Mirrors the ref discipline of
 * direct-player.tsx: everything the event handlers read must live here, not
 * in React state, so a tick already in flight can't observe a stale value.
 */
interface NativeSession extends NativePlayerSessionSeed {
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
   * arrive after sessionRef points at the new session — every handler except
   * onLoad/onDismiss drops events while this is set (the fix for the class
   * of races direct-player guards with currentItemIdRef).
   */
  awaitingLoad: boolean;
  lastProgressReportAt: number;
}

interface NativePlayerContextValue {
  /**
   * Fetch the item, negotiate the stream and present the native player.
   * Resolves false when it declined (unsupported platform, config-build
   * failure, native throw) so the caller can fall back to the JS route.
   */
  presentFromRequest: (req: PlayRequest) => Promise<boolean>;
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

export const NativePlayerProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const enabled = isNativePlayerSupported && isNativePlayerModuleAvailable();

  if (!enabled) {
    // The server-initiated "Play" command still needs a handler on platforms
    // without the native player (Android, TV, stale iOS binaries) — the app
    // advertises SupportedCommands: ["Play"] everywhere.
    return <PlayCommandRouteFallback>{children}</PlayCommandRouteFallback>;
  }

  return <NativePlayerProviderInner>{children}</NativePlayerProviderInner>;
};

/** Routes WS "Play" commands to the JS player route (pre-native behavior). */
const PlayCommandRouteFallback: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const { subscribe } = useWebSocketContext();

  useEffect(
    () =>
      subscribe("Play", (data: any) => {
        if (!data?.ItemIds?.length) return;
        const req: PlayRequest = {
          itemId: data.ItemIds[0],
          audioIndex:
            data.AudioStreamIndex !== undefined
              ? Number(data.AudioStreamIndex)
              : undefined,
          subtitleIndex:
            data.SubtitleStreamIndex !== undefined
              ? Number(data.SubtitleStreamIndex)
              : undefined,
          mediaSourceId: data.MediaSourceId || undefined,
          offline: false,
          playbackPositionTicks:
            data.StartPositionTicks !== undefined
              ? Number(data.StartPositionTicks)
              : undefined,
        };
        router.push(
          `/(auth)/player/direct-player?${toDirectPlayerQuery(req)}` as any,
        );
      }),
    [subscribe],
  );

  return <>{children}</>;
};

const NativePlayerProviderInner: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);
  const { t } = useTranslation();
  const { settings, updateSettings } = useSettings();
  const { isConnected } = useNetworkStatus();
  const { lockOrientation, unlockOrientation } = useOrientation();
  const downloadUtils = useDownload();
  const revalidateProgressCache = useInvalidatePlaybackProgressCache();
  const { lastMessage, subscribe, clearLastMessage } = useWebSocketContext();

  const sessionRef = useRef<NativeSession | null>(null);
  // Monotonic id per beginSession call: the config build awaits a PlaybackInfo
  // round trip, so overlapping play requests (double-fired next-episode, WS
  // Play mid-swap, fast taps) can interleave — only the newest may commit.
  const playRequestTokenRef = useRef(0);
  const [activeItem, setActiveItem] = useState<BaseItemDto | null>(null);
  const [isActive, setIsActive] = useState(false);

  const playbackManager = usePlaybackManager({
    item: activeItem,
    isOffline: sessionRef.current?.offline ?? false,
  });

  // usePlaybackManager returns a fresh object per render; handlers below live
  // in refs, so mirror the pieces they need (same pattern as direct-player).
  const reportProgressRef = useRef(playbackManager.reportPlaybackProgress);
  const nextItemRef = useRef<BaseItemDto | null>(playbackManager.nextItem);
  const previousItemRef = useRef<BaseItemDto | null>(
    playbackManager.previousItem,
  );
  useEffect(() => {
    reportProgressRef.current = playbackManager.reportPlaybackProgress;
    nextItemRef.current = playbackManager.nextItem;
    previousItemRef.current = playbackManager.previousItem;
  });

  const apiRef = useRef(api);
  const settingsRef = useRef(settings);
  const userRef = useRef(user);
  const isConnectedRef = useRef(isConnected);
  useEffect(() => {
    apiRef.current = api;
    settingsRef.current = settings;
    userRef.current = user;
    isConnectedRef.current = isConnected;
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
      IsMuted: false,
      CanSeek: true,
      RepeatMode: RepeatMode.RepeatNone,
      PlaybackOrder: PlaybackOrder.Default,
    }),
    [],
  );

  const reportPlaybackStart = useCallback(
    (session: NativeSession) => {
      const currentApi = apiRef.current;
      // Gate on connectivity, not on the offline flag: a downloaded item
      // played with the server reachable still reports (direct-player.tsx).
      if (!currentApi || !isConnectedRef.current) return;
      getPlaystateApi(currentApi)
        .reportPlaybackStart({
          playbackStartInfo: {
            ...buildProgressInfo(session),
            // The stream just resolved; describe the session that is starting
            // (autoplay) instead of "paused at 0:00".
            IsPaused: false,
            PositionTicks: session.startTicks,
          },
        })
        .catch((error) => {
          writeToLog(
            "ERROR",
            "NativePlayer reportPlaybackStart failed",
            error instanceof Error ? error.message : String(error),
          );
        });
    },
    [buildProgressInfo],
  );

  const releaseLiveStream = useCallback((session: NativeSession) => {
    const liveStreamId = session.stream.mediaSource?.LiveStreamId;
    const currentApi = apiRef.current;
    if (!liveStreamId || !currentApi || session.offline) return;
    getMediaInfoApi(currentApi)
      .closeLiveStream({ liveStreamId })
      .catch(() => {});
  }, []);

  const reportPlaybackStopped = useCallback(
    async (session: NativeSession, positionTicks?: number) => {
      const currentApi = apiRef.current;
      if (!session.item.Id || !currentApi || !isConnectedRef.current) return;
      // Dedupe per session: dismissal and stream replacement can both try to
      // close the same session (sessionId, or item id for downloads).
      const stopKey = session.stream.sessionId || session.item.Id;
      if (session.reportedStopKey === stopKey) return;
      session.reportedStopKey = stopKey;
      try {
        await getPlaystateApi(currentApi).reportPlaybackStopped({
          playbackStopInfo: {
            ItemId: session.item.Id,
            MediaSourceId: session.mediaSourceId,
            PositionTicks: positionTicks ?? msToTicks(session.positionMs),
            PlaySessionId: session.stream.sessionId || undefined,
            // Required to release the server-side live stream's tuner slot.
            LiveStreamId: session.stream.mediaSource?.LiveStreamId ?? undefined,
          },
        });
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
    [],
  );

  // MARK: - Aux data pushes (segments / next episode / episode list)

  const pushSegments = useCallback(async (session: NativeSession) => {
    try {
      const currentApi = apiRef.current;
      let segments: {
        introSegments: { startTime: number; endTime: number }[];
        creditSegments: { startTime: number; endTime: number }[];
      };
      if (session.offline && session.downloadedItem) {
        segments = getSegmentsForItem(session.downloadedItem);
      } else if (currentApi && session.item.Id) {
        segments = await fetchAndParseSegments(session.item.Id, currentApi);
      } else {
        return;
      }
      if (sessionRef.current !== session) return;
      const mapped: NativePlayerSegment[] = [
        ...segments.introSegments.map((s) => ({
          type: "Intro" as const,
          startSec: s.startTime,
          endSec: s.endTime,
        })),
        ...segments.creditSegments.map((s) => ({
          type: "Outro" as const,
          startSec: s.startTime,
          endSec: s.endTime,
        })),
      ];
      await updateNativePlayerSegments(mapped);
    } catch {
      // Segments are progressive enhancement — never fail playback for them.
    }
  }, []);

  const buildNextEpisodePayload = useCallback(
    (_session: NativeSession, next: BaseItemDto): NativePlayerNextEpisode => {
      const currentSettings = settingsRef.current;
      const max = currentSettings?.maxAutoPlayEpisodeCount?.value ?? -1;
      const autoplayWanted = currentSettings?.autoPlayNextEpisode ?? false;
      const capReached =
        max !== -1 && (currentSettings?.autoPlayEpisodeCount ?? 0) >= max;
      const autoplayAllowed = autoplayWanted && !capReached;
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
        // Autoplay would have run but the episode cap stops it: EOF shows
        // the "Still watching?" card instead (JS ContinueWatchingOverlay).
        stillWatchingRequired: autoplayWanted && capReached,
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
          const res = await getTvShowsApi(apiRef.current).getEpisodes({
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
    const next = playbackManager.nextItem;
    if (next?.Id) {
      void updateNativePlayerNextEpisode(
        buildNextEpisodePayload(session, next),
      );
    } else {
      void updateNativePlayerNextEpisode(null);
    }
  }, [playbackManager.nextItem, isActive, buildNextEpisodePayload]);

  // MARK: - Present / load

  const beginSession = useCallback(
    async (
      req: PlayRequest,
      options: { item?: BaseItemDto; replace: boolean },
    ): Promise<boolean> => {
      const currentSettings = settingsRef.current;
      if (!currentSettings) return false;
      const token = ++playRequestTokenRef.current;

      const built = await buildNativePlayerConfig({
        api: apiRef.current,
        userId: userRef.current?.Id,
        settings: currentSettings,
        req,
        getDownloadedItemById: downloadUtils.getDownloadedItemById,
        strings: buildNativePlayerStrings(t),
        item: options.item,
      }).catch((error) => {
        writeToLog(
          "ERROR",
          "NativePlayer config build failed",
          error instanceof Error ? error.message : String(error),
        );
        return null;
      });
      if (!built) return false;

      const session: NativeSession = {
        ...built.seed,
        currentAudioIndex: built.seed.audioIndex,
        currentSubtitleIndex: built.seed.subtitleIndex,
        positionMs: ticksToSeconds(built.seed.startTicks) * 1000,
        isPlaying: false,
        hasPlaybackStarted: false,
        reportedStopKey: null,
        awaitingLoad: true,
        lastProgressReportAt: 0,
      };

      if (token !== playRequestTokenRef.current) {
        // A newer play request started while this stream was negotiating —
        // abandon before touching sessionRef or the native player, and close
        // the live stream this build just opened on the server.
        releaseLiveStream(session);
        return false;
      }

      const previous = sessionRef.current;

      try {
        if (options.replace && previous) {
          // Close the OLD server session only now that the new stream is
          // fully negotiated — a config-build failure above must leave the
          // old session playing and reportable.
          await reportPlaybackStopped(previous);
          releaseLiveStream(previous);
          sessionRef.current = session;
          await loadNativePlayerStream(built.config);
        } else {
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
        writeToLog(
          "ERROR",
          "NativePlayer present/load failed",
          error instanceof Error ? error.message : String(error),
        );
        if (options.replace && previous) {
          // The in-place swap failed midway: the old server session is
          // already closed and the stream state is unknown — tear the whole
          // player down (onDismiss handles the rest) instead of leaving a
          // half-dead session behind.
          sessionRef.current = previous;
          void dismissNativePlayer();
        } else {
          sessionRef.current = previous;
          unlockOrientation();
        }
        return false;
      }

      setActiveItem(session.item);
      setIsActive(true);
      // Drop any WS command that arrived before this session existed — a
      // stale coalesced "Stop"/"Seek" must not execute the moment isActive
      // flips (lastMessage has no other consumer while browsing).
      clearLastMessage();
      reportPlaybackStart(session);
      void pushSegments(session);
      void pushEpisodeList(session);
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
      clearLastMessage,
      pushSegments,
      pushEpisodeList,
    ],
  );

  const presentFromRequest = useCallback(
    async (req: PlayRequest): Promise<boolean> => {
      // Present while a session is active (e.g. WS Play command) swaps in
      // place; beginSession closes the old server session once the new
      // stream is negotiated.
      return beginSession(req, { replace: sessionRef.current !== null });
    },
    [beginSession],
  );

  /** Same-item stream re-negotiation (tracks/bitrate), resuming in place. */
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
    ) => {
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
      await beginSession(req, { item: session.item, replace: true });
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
      });

      const req: PlayRequest = {
        itemId: target.Id,
        audioIndex: defaultAudioIndex,
        subtitleIndex: defaultSubtitleIndex,
        mediaSourceId: newMediaSource?.Id ?? undefined,
        bitrateValue: session.bitrateValue,
        offline: session.offline,
        playbackPositionTicks: target.UserData?.PlaybackPositionTicks,
      };
      // Target came from the adjacent-items query without full MediaSources —
      // let the builder refetch it online; offline uses the downloads DB.
      await beginSession(req, {
        item: session.offline ? target : undefined,
        replace: true,
      });
    },
    [beginSession],
  );

  const teardownSession = useCallback(
    async (session: NativeSession, finalPositionSec?: number) => {
      if (finalPositionSec !== undefined) {
        session.positionMs = finalPositionSec * 1000;
      }
      // Final progress write first: it also lands in the downloads DB for
      // offline items (5%/90% thresholds), then close the server session.
      const info = buildProgressInfo(session);
      try {
        await reportProgressRef.current(info);
      } catch {}
      await reportPlaybackStopped(session);
      releaseLiveStream(session);
      revalidateProgressCache();
      unlockOrientation();
      if (sessionRef.current === session) {
        sessionRef.current = null;
        setActiveItem(null);
        setIsActive(false);
      }
    },
    [
      buildProgressInfo,
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
          subtitleIndex: session.currentSubtitleIndex,
          offline: session.offline,
          downloadedItem: session.downloadedItem,
          offLabel: buildNativePlayerStrings(t).off ?? "None",
          bitrateValue: session.bitrateValue,
        }),
      );
    },
    [t],
  );

  const handleAudioSelection = useCallback(
    async (
      session: NativeSession,
      jellyfinIndex: number,
      positionSec: number,
    ) => {
      const isTranscoding = Boolean(session.stream.mediaSource.TranscodingUrl);
      // A transcoded stream only carries the encoded audio track — switching
      // requires re-negotiating the stream (mirror of handleAudioIndexChange).
      if (isTranscoding) {
        await replaceStream(session, {
          audioIndex: jellyfinIndex,
          positionTicks: msToTicks(positionSec * 1000),
        });
        return;
      }
      session.currentAudioIndex = jellyfinIndex;
      const mpvId = getMpvAudioId(
        session.stream.mediaSource,
        jellyfinIndex,
        isTranscoding,
      );
      if (mpvId !== undefined) {
        await nativePlayerSetAudioTrack(mpvId);
      }
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
      if (result.kind === "notFound" || result.kind === "burnedIn") {
        await replaceStream(session, {
          subtitleIndex: jellyfinIndex,
          positionTicks: msToTicks(positionSec * 1000),
        });
        return;
      }
      pushTrackMenus(session);
    },
    [applySubtitleSelection, replaceStream, pushTrackMenus],
  );

  // MARK: - Native event listeners

  useEffect(() => {
    const subscriptions = [
      addNativePlayerListener("onLoad", () => {
        const session = sessionRef.current;
        if (!session) return;
        // The engine has taken the new stream; events from here on belong to
        // this session.
        session.awaitingLoad = false;
      }),

      addNativePlayerListener("onProgress", (payload) => {
        const session = sessionRef.current;
        if (!session || session.awaitingLoad) return;
        session.positionMs = payload.position * 1000;
        const now = Date.now();
        const shouldReport =
          payload.didSeek === true ||
          now - session.lastProgressReportAt >= PROGRESS_REPORT_INTERVAL;
        if (!shouldReport || !session.hasPlaybackStarted) return;
        session.lastProgressReportAt = now;
        void reportProgressRef.current(buildProgressInfo(session));
      }),

      addNativePlayerListener("onPlaybackStateChange", (payload) => {
        const session = sessionRef.current;
        if (!session || session.awaitingLoad) return;
        if (payload.isPlaying === undefined && payload.isPaused === undefined) {
          return;
        }
        const nowPlaying = payload.isPlaying ?? !payload.isPaused;
        const changed = session.isPlaying !== nowPlaying;
        session.isPlaying = nowPlaying;
        if (nowPlaying) session.hasPlaybackStarted = true;
        // Pause/resume transitions report immediately (mirror of the
        // state-transition effect in direct-player).
        if (changed && session.hasPlaybackStarted && !session.reportedStopKey) {
          void reportProgressRef.current(buildProgressInfo(session));
        }
      }),

      addNativePlayerListener("onTracksReady", () => {
        const session = sessionRef.current;
        if (!session || session.awaitingLoad) return;
        // Re-apply the current selection on every fire — it fires again after
        // each external sub-add and the identity re-apply is idempotent.
        void applySubtitleSelection(session, session.currentSubtitleIndex);
      }),

      addNativePlayerListener("onTrackSelectionRequested", (payload) => {
        const session = sessionRef.current;
        if (!session || session.awaitingLoad) return;
        if (payload.kind === "audio") {
          void handleAudioSelection(
            session,
            payload.jellyfinIndex,
            payload.positionSec,
          );
        } else {
          void handleSubtitleSelection(
            session,
            payload.jellyfinIndex,
            payload.positionSec,
          );
        }
      }),

      addNativePlayerListener("onNextEpisodeRequested", (payload) => {
        const session = sessionRef.current;
        // awaitingLoad guard: the outgoing stream can reach EOF during an
        // in-place swap and re-request the next episode — advancing twice.
        if (!session || session.awaitingLoad) return;
        session.positionMs = payload.positionSec * 1000;
        const next = nextItemRef.current;
        if (!next) {
          void dismissNativePlayer();
          return;
        }
        const currentSettings = settingsRef.current;
        if (payload.reason === "countdown") {
          const max = currentSettings?.maxAutoPlayEpisodeCount?.value ?? -1;
          const count = currentSettings?.autoPlayEpisodeCount ?? 0;
          const allowed =
            (currentSettings?.autoPlayNextEpisode ?? false) &&
            (max === -1 || count < max);
          if (!allowed) {
            void dismissNativePlayer();
            return;
          }
          if (max !== -1) {
            updateSettings({ autoPlayEpisodeCount: count + 1 });
          }
        } else if (currentSettings?.maxAutoPlayEpisodeCount?.value !== -1) {
          // A deliberate tap resets the auto-play chain counter.
          updateSettings({ autoPlayEpisodeCount: 0 });
        }
        void playAdjacentItem(session, next);
      }),

      addNativePlayerListener("onPreviousEpisodeRequested", (payload) => {
        const session = sessionRef.current;
        if (!session || session.awaitingLoad) return;
        session.positionMs = payload.positionSec * 1000;
        const previous = previousItemRef.current;
        if (previous) void playAdjacentItem(session, previous);
      }),

      addNativePlayerListener("onEpisodeSelected", (payload) => {
        const session = sessionRef.current;
        if (!session || session.awaitingLoad || !payload.itemId) return;
        session.positionMs = payload.positionSec * 1000;
        void (async () => {
          let target: BaseItemDto | undefined;
          if (session.offline) {
            target = downloadUtils.getDownloadedItemById(payload.itemId)
              ?.item as BaseItemDto | undefined;
          } else if (apiRef.current) {
            const res = await getUserLibraryApi(apiRef.current)
              .getItem({ itemId: payload.itemId, userId: userRef.current?.Id })
              .catch(() => null);
            target = res?.data;
          }
          if (target) await playAdjacentItem(session, target);
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
        // Global setting, same as the JS player's in-menu subtitle scale.
        // Native already applied it live on the engine.
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
        // Persist like the JS player's plain speed rows (scope "all") so the
        // next stream load resolves the same speed instead of a stale one.
        const session = sessionRef.current;
        const currentSettings = settingsRef.current;
        if (!session || session.awaitingLoad || !currentSettings) return;
        updatePlaybackSpeedSettings(
          payload.speed,
          PlaybackSpeedScope.All,
          session.item,
          currentSettings,
          updateSettings,
        );
      }),

      addNativePlayerListener("onPictureInPictureChange", () => {
        // Informational; reporting continues off onProgress either way.
      }),

      addNativePlayerListener("onError", (payload) => {
        writeToLog("ERROR", "NativePlayer playback error", payload.error);
      }),

      addNativePlayerListener("onPlaybackEnded", (payload) => {
        const session = sessionRef.current;
        if (!session) return;
        session.positionMs = payload.positionSec * 1000;
      }),

      addNativePlayerListener("onDismiss", (payload) => {
        const session = sessionRef.current;
        if (!session) return;
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
    applySubtitleSelection,
    handleAudioSelection,
    handleSubtitleSelection,
    playAdjacentItem,
    replaceStream,
    teardownSession,
    downloadUtils,
    updateSettings,
    lockOrientation,
  ]);

  // MARK: - Remote control (Jellyfin WebSocket)

  // Server-initiated "Play me this item". Moved here from WebSocketProvider so
  // the native/route decision lives next to the session logic. Falls back to
  // the JS route when the native player declines.
  useEffect(
    () =>
      subscribe("Play", (data: any) => {
        if (!data?.ItemIds?.length) return;
        const req: PlayRequest = {
          itemId: data.ItemIds[0],
          audioIndex:
            data.AudioStreamIndex !== undefined
              ? Number(data.AudioStreamIndex)
              : undefined,
          subtitleIndex:
            data.SubtitleStreamIndex !== undefined
              ? Number(data.SubtitleStreamIndex)
              : undefined,
          mediaSourceId: data.MediaSourceId || undefined,
          offline: false,
          // Previously dropped by WebSocketProvider's handler; pass through.
          playbackPositionTicks:
            data.StartPositionTicks !== undefined
              ? Number(data.StartPositionTicks)
              : undefined,
        };
        void (async () => {
          // Respect the user's explicit MPV opt-out — the WS Play path must
          // pick the same player the play button would.
          const useNative =
            getActiveVideoPlayer(settingsRef.current) === VideoPlayer.Native;
          const presented = useNative && (await presentFromRequest(req));
          if (!presented) {
            // Never stack the JS route under a still-presented native player
            // (e.g. a config-build failure left the old session playing).
            if (isNativePlayerPresented()) return;
            router.push(
              `/(auth)/player/direct-player?${toDirectPlayerQuery(req)}` as any,
            );
          }
        })();
      }),
    [subscribe, presentFromRequest],
  );

  // General commands while the native player is up. The JS player route and a
  // native session are mutually exclusive, so consuming lastMessage here can't
  // double-handle with hooks/useWebsockets.
  useEffect(() => {
    if (!isActive || !lastMessage) return;
    const session = sessionRef.current;
    if (!session) return;

    const command: string | undefined =
      lastMessage?.Data?.Command || lastMessage?.Data?.Name;
    const args = lastMessage?.Data?.Arguments as
      | Record<string, string>
      | undefined;
    if (!command) return;

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
          void handleAudioSelection(session, index, session.positionMs / 1000);
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
      case "NextTrack": {
        const next = nextItemRef.current;
        if (next) void playAdjacentItem(session, next);
        break;
      }
      case "PreviousTrack": {
        const previous = previousItemRef.current;
        if (previous) void playAdjacentItem(session, previous);
        break;
      }
      default:
        return;
    }
    clearLastMessage();
  }, [
    lastMessage,
    isActive,
    clearLastMessage,
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

  const contextValue = useMemo(
    () => ({ presentFromRequest, isActive }),
    [presentFromRequest, isActive],
  );

  return (
    <NativePlayerContext.Provider value={contextValue}>
      {children}
    </NativePlayerContext.Provider>
  );
};

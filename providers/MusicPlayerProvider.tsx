import type { Api } from "@jellyfin/sdk";
import type {
  BaseItemDto,
  MediaSourceInfo,
} from "@jellyfin/sdk/lib/generated-client/models";
import { getSessionApi } from "@jellyfin/sdk/lib/utils/api";
import { useAtomValue } from "jotai";
import React, {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Platform } from "react-native";
import {
  DEFAULT_MUSIC_NORMALIZATION_MODE,
  PREVIOUS_RESTARTS_TRACK_AFTER_SECONDS,
} from "@/constants/Music";
import { PROGRESS_REPORT_INTERVAL } from "@/constants/Playback";
import { useMusicCast } from "@/hooks/useMusicCast";
import {
  type MusicCastRemoteView,
  useMusicCastRemote,
} from "@/hooks/useMusicCastRemote";
import { CastState, useRemoteTarget } from "@/modules/mpv-player/src/cast";
import {
  downloadTrack,
  getLocalPath,
  initAudioStorage,
  isDownloading,
  setMaxCacheSizeMB,
} from "@/providers/AudioStorage";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { useNetworkStatus } from "@/providers/NetworkStatusProvider";
import { useWebSocketContext } from "@/providers/WebSocketProvider";
import {
  setMusicNormalizationMode,
  setMusicNormalizationTrack,
} from "@/services/MusicNormalization";
import { settingsAtom } from "@/utils/atoms/settings";
import { isPressForTargetHeld } from "@/utils/cast/playTarget";
import { getJellyfinHeadersForUrl } from "@/utils/customHeaders";
import { markExpectedError } from "@/utils/errors";
import { getAudioStreamUrl } from "@/utils/jellyfin/audio/getAudioStreamUrl";
import {
  type MusicRepeatMode,
  parsePlaybackModeCommand,
  toJellyfinRepeatMode,
  toPlaybackOrder,
} from "@/utils/jellyfin/playbackModes";
import { logAndCaptureError } from "@/utils/log";
import { storage } from "@/utils/mmkv";
import {
  editNativeQueue,
  nativeIndexOf,
  nativeInsertIndexFor,
} from "@/utils/music/nativeQueue";
import { toTrackNormalizationGains } from "@/utils/music/normalization";
import { isVideoSessionOpen } from "@/utils/videoSession";

// Conditionally import TrackPlayer only on non-TV platforms
// This prevents the native module from being loaded on TV where it doesn't exist
const TrackPlayer = Platform.isTV
  ? null
  : require("react-native-track-player").default;

const TrackPlayerModule = Platform.isTV
  ? null
  : require("react-native-track-player");

// Extract types and enums from the module (only available on non-TV)
const Capability = TrackPlayerModule?.Capability;
const TPRepeatMode = TrackPlayerModule?.RepeatMode;
type Track = NonNullable<typeof TrackPlayerModule>["Track"];
type Progress = NonNullable<typeof TrackPlayerModule>["Progress"];

// Storage keys
const STORAGE_KEYS = {
  QUEUE: "music_player_queue",
  QUEUE_INDEX: "music_player_queue_index",
  REPEAT_MODE: "music_player_repeat_mode",
  SHUFFLE_ENABLED: "music_player_shuffle_enabled",
  CURRENT_PROGRESS: "music_player_progress",
  // Which account the persisted queue belongs to, as `serverId:userId`.
  QUEUE_OWNER: "music_player_queue_owner",
} as const;

// A queue belongs to one account: same server, other user is a different queue.
const sessionKeyFor = (
  user?: { Id?: string | null; ServerId?: string | null } | null,
) => (user?.Id ? `${user.ServerId ?? ""}:${user.Id}` : null);

export type RepeatMode = MusicRepeatMode;

interface TrackMediaInfo {
  mediaSource: MediaSourceInfo | null;
  isTranscoding: boolean;
}

interface PreparedTrack {
  track: Track;
  sessionId: string | null;
  mediaSource: MediaSourceInfo | null;
  isTranscoding: boolean;
  mediaInfo: TrackMediaInfo | null;
}

interface MusicPlayerState {
  currentTrack: BaseItemDto | null;
  queue: BaseItemDto[];
  originalQueue: BaseItemDto[]; // Original order before shuffle
  queueIndex: number;
  isPlaying: boolean;
  isLoading: boolean;
  loadingTrackId: string | null; // Track ID being loaded
  progress: number;
  duration: number;
  streamUrl: string | null;
  playSessionId: string | null;
  repeatMode: RepeatMode;
  shuffleEnabled: boolean;
  mediaSource: MediaSourceInfo | null;
  isTranscoding: boolean;
  trackMediaInfoMap: Record<string, TrackMediaInfo>;
}

interface MusicPlayerContextType extends MusicPlayerState {
  // The native player exists. Nothing may poll it before this is true.
  isPlayerReady: boolean;

  // Playback control
  playTrack: (track: BaseItemDto, queue?: BaseItemDto[]) => void;
  playQueue: (queue: BaseItemDto[], startIndex?: number) => void;
  playAlbum: (albumId: string, startIndex?: number) => void;
  playPlaylist: (playlistId: string, startIndex?: number) => void;
  pause: () => void;
  resume: () => void;
  togglePlayPause: () => void;
  next: () => void;
  previous: () => void;
  seek: (position: number) => void;
  stop: () => void;

  // Queue management
  addToQueue: (tracks: BaseItemDto | BaseItemDto[]) => void;
  playNext: (tracks: BaseItemDto | BaseItemDto[]) => void;
  removeFromQueue: (index: number) => void;
  moveInQueue: (fromIndex: number, toIndex: number) => void;
  reorderQueue: (newQueue: BaseItemDto[]) => void;
  clearQueue: () => void;
  jumpToIndex: (index: number) => void;
  /**
   * Whether tracks can be taken out of the queue, moved or shuffled: not while
   * a Cast receiver plays it, which has no command for any of those.
   */
  canEditQueue: boolean;

  // Modes
  setRepeatMode: (mode: RepeatMode) => void;
  toggleShuffle: () => void;

  // Internal setters (for playback engine)
  setProgress: (progress: number) => void;
  setDuration: (duration: number) => void;
  setIsPlaying: (isPlaying: boolean) => void;
  reportProgress: () => void;
  onTrackEnd: () => void;
  syncFromTrackPlayer: () => void;

  // Audio caching
  triggerLookahead: () => void;
}

const defaultState: MusicPlayerState = {
  currentTrack: null,
  queue: [],
  originalQueue: [],
  queueIndex: 0,
  isPlaying: false,
  isLoading: false,
  loadingTrackId: null,
  progress: 0,
  duration: 0,
  streamUrl: null,
  playSessionId: null,
  repeatMode: "off",
  shuffleEnabled: false,
  mediaSource: null,
  isTranscoding: false,
  trackMediaInfoMap: {},
};

// No-op function for TV stub
const noop = () => {};

const MusicPlayerContext = createContext<MusicPlayerContextType | undefined>(
  undefined,
);

export const useMusicPlayer = () => {
  const context = useContext(MusicPlayerContext);
  if (!context) {
    throw new Error("useMusicPlayer must be used within MusicPlayerProvider");
  }
  return context;
};

interface MusicPlayerProviderProps {
  children: ReactNode;
}

// Stub provider for tvOS - music playback is not supported
const TVMusicPlayerProvider: React.FC<MusicPlayerProviderProps> = ({
  children,
}) => {
  const value: MusicPlayerContextType = {
    ...defaultState,
    isPlayerReady: false,
    playTrack: noop,
    playQueue: noop,
    playAlbum: noop,
    playPlaylist: noop,
    pause: noop,
    resume: noop,
    togglePlayPause: noop,
    next: noop,
    previous: noop,
    seek: noop,
    stop: noop,
    addToQueue: noop,
    playNext: noop,
    removeFromQueue: noop,
    moveInQueue: noop,
    reorderQueue: noop,
    clearQueue: noop,
    jumpToIndex: noop,
    canEditQueue: false,
    setRepeatMode: noop,
    toggleShuffle: noop,
    setProgress: noop,
    setDuration: noop,
    setIsPlaying: noop,
    reportProgress: noop,
    onTrackEnd: noop,
    syncFromTrackPlayer: noop,
    triggerLookahead: noop,
  };

  return (
    <MusicPlayerContext.Provider value={value}>
      {children}
    </MusicPlayerContext.Provider>
  );
};

// Persistence helpers
const saveQueueToStorage = (
  queue: BaseItemDto[],
  queueIndex: number,
  owner: string | null,
) => {
  try {
    storage.set(STORAGE_KEYS.QUEUE, JSON.stringify(queue));
    storage.set(STORAGE_KEYS.QUEUE_INDEX, queueIndex.toString());
    if (owner) storage.set(STORAGE_KEYS.QUEUE_OWNER, owner);
  } catch {
    // Silently fail
  }
};

const loadQueueFromStorage = (): {
  queue: BaseItemDto[];
  queueIndex: number;
} | null => {
  try {
    const queueJson = storage.getString(STORAGE_KEYS.QUEUE);
    const indexStr = storage.getString(STORAGE_KEYS.QUEUE_INDEX);

    if (queueJson && indexStr) {
      const queue = JSON.parse(queueJson) as BaseItemDto[];
      const queueIndex = parseInt(indexStr, 10);
      if (queue.length > 0 && queueIndex >= 0 && queueIndex < queue.length) {
        return { queue, queueIndex };
      }
    }
  } catch {
    // Silently fail
  }
  return null;
};

const clearPersistedQueue = () => {
  // Per key: one failing removal must not leave the others behind.
  for (const key of [
    STORAGE_KEYS.QUEUE,
    STORAGE_KEYS.QUEUE_INDEX,
    STORAGE_KEYS.CURRENT_PROGRESS,
    STORAGE_KEYS.QUEUE_OWNER,
  ]) {
    try {
      storage.remove(key);
    } catch {
      // Silently fail
    }
  }
};

const loadQueueOwner = (): string | null => {
  try {
    return storage.getString(STORAGE_KEYS.QUEUE_OWNER) ?? null;
  } catch {
    return null;
  }
};

const loadRepeatMode = (): RepeatMode => {
  try {
    const mode = storage.getString(STORAGE_KEYS.REPEAT_MODE);
    if (mode === "off" || mode === "all" || mode === "one") {
      return mode;
    }
  } catch {
    // Silently fail
  }
  return "off";
};

const loadShuffleEnabled = (): boolean => {
  try {
    return storage.getBoolean(STORAGE_KEYS.SHUFFLE_ENABLED) ?? false;
  } catch {
    return false;
  }
};

const saveProgress = (progress: number) => {
  try {
    storage.set(STORAGE_KEYS.CURRENT_PROGRESS, progress.toString());
  } catch {
    // Silently fail
  }
};

const loadProgress = (): number => {
  try {
    const progressStr = storage.getString(STORAGE_KEYS.CURRENT_PROGRESS);
    if (progressStr) {
      return parseFloat(progressStr);
    }
  } catch {
    // Silently fail
  }
  return 0;
};

// Shuffle array using Fisher-Yates
const shuffleArray = <T,>(array: T[], currentIndex: number): T[] => {
  const result = [...array];
  const currentItem = result[currentIndex];

  // Remove current item
  result.splice(currentIndex, 1);

  // Shuffle remaining
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }

  // Put current item at the beginning
  result.unshift(currentItem);

  return result;
};

// Turns shuffle on or off for a queue that is already loaded, keeping the
// current track current.
const applyShuffle = (
  prev: MusicPlayerState,
  shuffleEnabled: boolean,
): MusicPlayerState => {
  if (shuffleEnabled) {
    return {
      ...prev,
      shuffleEnabled: true,
      queue: shuffleArray(prev.queue, prev.queueIndex),
      queueIndex: 0,
    };
  }

  const currentTrackId = prev.currentTrack?.Id;
  const newIndex = prev.originalQueue.findIndex((t) => t.Id === currentTrackId);
  return {
    ...prev,
    shuffleEnabled: false,
    queue: prev.originalQueue,
    queueIndex: Math.max(newIndex, 0),
  };
};

// Filter queue to only include downloaded items (for offline playback)
const filterQueueForOffline = (
  queue: BaseItemDto[],
  startIndex: number,
): { queue: BaseItemDto[]; startIndex: number } => {
  const startItem = queue[startIndex];
  const downloadedOnly = queue.filter((item) => getLocalPath(item.Id) !== null);
  const newStartIndex = downloadedOnly.findIndex((t) => t.Id === startItem?.Id);
  return {
    queue: downloadedOnly,
    startIndex: Math.max(newStartIndex, 0),
  };
};

// Convert BaseItemDto to TrackPlayer Track
const itemToTrack = (
  item: BaseItemDto,
  url: string,
  api: Api,
  preferLocalAudio = true,
): Track => {
  const albumId = item.AlbumId || item.ParentId;
  const artworkId = albumId || item.Id;
  const artwork = artworkId
    ? `${api.basePath}/Items/${artworkId}/Images/Primary?maxHeight=512&maxWidth=512&quality=90`
    : undefined;
  const artworkHeaders = getJellyfinHeadersForUrl(artwork, api.basePath);

  // Check if track is cached locally (permanent downloads take precedence)
  // getLocalPath returns full file:// URI if cached, null otherwise
  const cachedUrl = preferLocalAudio ? getLocalPath(item.Id) : null;
  const finalUrl = cachedUrl || url;

  if (cachedUrl) {
    console.log(
      `[MusicPlayer] Using cached file for ${item.Name}: ${cachedUrl}`,
    );
  }

  const track: Track = {
    id: item.Id || "",
    url: finalUrl,
    title: item.Name || "Unknown",
    artist: item.Artists?.join(", ") || item.AlbumArtist || "Unknown Artist",
    album: item.Album || undefined,
    artwork:
      artwork && artworkHeaders
        ? { uri: artwork, headers: artworkHeaders }
        : artwork,
    duration: item.RunTimeTicks ? item.RunTimeTicks / 10000000 : undefined,
    // The gains ride on the track itself: the playback service sets the volume
    // from them when the track becomes active, with no queue to look it up in.
    ...toTrackNormalizationGains(item),
  };

  // A local file needs no headers; a stream from a protected server does.
  const streamHeaders = cachedUrl
    ? undefined
    : getJellyfinHeadersForUrl(finalUrl, api.basePath);
  if (streamHeaders) track.headers = streamHeaders;

  return track;
};

// Adds a track where the app queue has it rather than at the end, for a native
// queue that was filled out of order. A track that is already there is left.
const addInQueueOrder = async (
  appQueue: BaseItemDto[],
  appIndex: number,
  track: Track,
  isStale: () => boolean,
) => {
  const nativeQueue: Track[] = await TrackPlayer.getQueue();
  // The read was a wait like any other: see the note on isStale at the caller.
  if (isStale()) return;
  if (nativeIndexOf(nativeQueue, track.id) >= 0) return;
  await TrackPlayer.add(
    track,
    nativeInsertIndexFor(appQueue, appIndex, nativeQueue),
  );
};

// Points the state at the track the native player was just moved to. By id:
// the two queues only share indexes once the native one is fully loaded. When
// they do line up at `nativeIndex`, that row is the one, which matters for a
// track that is queued twice.
const withCurrentTrack = (
  prev: MusicPlayerState,
  nativeQueue: Track[],
  nativeIndex: number,
): MusicPlayerState => {
  const trackId: string | undefined = nativeQueue[nativeIndex]?.id;
  if (!trackId) return prev;

  const index =
    prev.queue[nativeIndex]?.Id === trackId
      ? nativeIndex
      : prev.queue.findIndex((t) => t.Id === trackId);
  if (index < 0) return prev;

  const track = prev.queue[index];
  const mediaInfo = track.Id ? prev.trackMediaInfoMap[track.Id] : null;
  return {
    ...prev,
    queueIndex: index,
    currentTrack: track,
    mediaSource: mediaInfo?.mediaSource ?? null,
    isTranscoding: mediaInfo?.isTranscoding ?? false,
  };
};

// Moves a queue that exists only on screen — restored after a restart, with
// nothing loaded natively — to another one of its tracks.
const withRestoredTrack = (
  prev: MusicPlayerState,
  index: number,
): MusicPlayerState => {
  const track = prev.queue[index];
  if (!track) return prev;
  return {
    ...prev,
    queueIndex: index,
    currentTrack: track,
    progress: 0,
    duration: track.RunTimeTicks
      ? Math.floor(track.RunTimeTicks / 10000000)
      : 0,
    mediaSource: null,
    isTranscoding: false,
  };
};

// Full implementation for non-TV platforms
const MobileMusicPlayerProvider: React.FC<MusicPlayerProviderProps> = ({
  children,
}) => {
  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);
  const settings = useAtomValue(settingsAtom);
  const { isConnected, serverConnected } = useNetworkStatus();
  const { subscribe } = useWebSocketContext();
  const isOffline = !isConnected || serverConnected === false;
  const { castQueue, castState } = useMusicCast({ api, userId: user?.Id });
  // Offline, the downloaded tracks stay on the phone: the receiver streams.
  const castConnected = castState === CastState.CONNECTED && !isOffline;
  const initializedRef = useRef(false);
  // Shared by every caller that needs the native player, so setup runs once.
  const playerSetupRef = useRef<Promise<void> | null>(null);
  const playerReadyRef = useRef(false);
  const [isPlayerReady, setIsPlayerReady] = useState(false);

  // Identifies the account the player currently belongs to, and lets async work
  // notice that the session moved on while it was awaiting.
  const sessionKey = sessionKeyFor(user);
  const sessionKeyRef = useRef<string | null>(null);
  const sessionGenerationRef = useRef(0);
  // A playback start that is still waiting on the player loses to the next
  // one: they resume together when setup finishes, and only the last may
  // reach the native queue.
  const startSequenceRef = useRef(0);
  // The latest written position: a resume finishing its own waits seeks to
  // this, not to what its render saw.
  const progressRef = useRef(0);
  // Which start put the spinner up: two starts of the same track share its
  // loadingTrackId, so the id alone cannot tell them apart.
  const loadingStartSeqRef = useRef(0);

  // Set once jumpToIndex has loaded a track ahead of the background load. From
  // then on that load can no longer append: it has to place each track, and
  // skip the one that is already there. Read and written inside
  // editNativeQueue, so the load sees it together with the track it stands for.
  const loadedOutOfOrderRef = useRef(false);

  // Moves on whenever the native queue is dropped: another queue played, the
  // player stopped or the queue cleared. The background load of the queue
  // before then stops there instead of adding its tracks to what replaced it.
  const queueGenerationRef = useRef(0);

  const [state, setState] = useState<MusicPlayerState>({
    currentTrack: null,
    queue: [],
    originalQueue: [],
    queueIndex: 0,
    isPlaying: false,
    isLoading: false,
    loadingTrackId: null,
    progress: 0,
    duration: 0,
    streamUrl: null,
    playSessionId: null,
    repeatMode: loadRepeatMode(),
    shuffleEnabled: loadShuffleEnabled(),
    mediaSource: null,
    isTranscoding: false,
    trackMediaInfoMap: {},
  });

  useEffect(() => {
    progressRef.current = state.progress;
  }, [state.progress]);

  const lastReportRef = useRef<number>(0);

  // The server only knows the repeat and shuffle state a report told it, and a
  // remote control shows what the server knows. Read through a ref so a report
  // sent from a callback created earlier still carries the current modes.
  const playbackModes = {
    RepeatMode: toJellyfinRepeatMode(state.repeatMode),
    PlaybackOrder: toPlaybackOrder(state.shuffleEnabled),
  };
  const playbackModesRef = useRef(playbackModes);
  playbackModesRef.current = playbackModes;

  // Sets up TrackPlayer and AudioStorage on first need, not at launch: on
  // Android this binds `MusicService` and builds two ExoPlayers on the main
  // thread. A failed setup clears the memo so the next caller retries.
  const ensurePlayerReady = useCallback((): Promise<void> => {
    if (!TrackPlayer) return Promise.resolve();
    if (playerSetupRef.current) return playerSetupRef.current;

    const setup = (async () => {
      await initAudioStorage();

      try {
        await TrackPlayer.setupPlayer({
          minBuffer: 120, // Minimum 2 minutes buffer for network resilience
          maxBuffer: 240, // Maximum 4 minutes buffer
          playBuffer: 5, // Start playback after 5 seconds buffered
          backBuffer: 30, // Keep 30 seconds behind for seeking
        });
      } catch (error) {
        // A JS reload with the native module alive means the player exists.
        // On an Android relaunch that finds `MusicService` still running, a new
        // `MusicModule` instance gets a resolve from `onServiceConnected`, and
        // only a surviving instance gets `player_already_initialized`. Both
        // mean the player exists.
        if (
          (error as { code?: string } | null)?.code !==
          "player_already_initialized"
        ) {
          throw error;
        }
      }
      await TrackPlayer.updateOptions({
        capabilities: [
          Capability.Play,
          Capability.Pause,
          Capability.SkipToNext,
          Capability.SkipToPrevious,
          Capability.SeekTo,
          Capability.Stop,
        ],
        compactCapabilities: [
          Capability.Play,
          Capability.Pause,
          Capability.SkipToNext,
          Capability.SkipToPrevious,
        ],
      });
      playerReadyRef.current = true;
      setIsPlayerReady(true);
    })().catch((error) => {
      playerSetupRef.current = null;
      throw error;
    });
    playerSetupRef.current = setup;
    return setup;
  }, []);

  const playerReadyForControl = useCallback(
    () =>
      ensurePlayerReady().then(
        () => true,
        () => false,
      ),
    [ensurePlayerReady],
  );

  // Update audio cache size when settings change
  useEffect(() => {
    if (settings?.audioMaxCacheSizeMB) {
      setMaxCacheSizeMB(settings.audioMaxCacheSizeMB);
    }
  }, [settings?.audioMaxCacheSizeMB]);

  // Hand the normalization mode to the playback service, which sets the volume
  // and outlives this provider.
  const normalizationMode =
    settings?.musicNormalizationMode ?? DEFAULT_MUSIC_NORMALIZATION_MODE;
  useEffect(() => {
    setMusicNormalizationMode(normalizationMode);
  }, [normalizationMode]);

  // Sync repeat mode to TrackPlayer
  useEffect(() => {
    if (!TrackPlayer) return;

    const syncRepeatMode = async () => {
      if (!isPlayerReady) return;

      let tpRepeatMode: typeof TPRepeatMode;
      switch (state.repeatMode) {
        case "one":
          tpRepeatMode = TPRepeatMode?.Track;
          break;
        case "all":
          tpRepeatMode = TPRepeatMode?.Queue;
          break;
        default:
          tpRepeatMode = TPRepeatMode?.Off;
      }
      await TrackPlayer.setRepeatMode(tpRepeatMode);
    };

    syncRepeatMode();
  }, [state.repeatMode, isPlayerReady]);

  // Restore queue on mount (when api is available)
  useEffect(() => {
    if (!api || !user?.Id || initializedRef.current) return;
    initializedRef.current = true;

    const saved = loadQueueFromStorage();
    if (saved && saved.queue.length > 0) {
      const currentTrack = saved.queue[saved.queueIndex];

      // A queue persisted by another account must not resurface here — its item
      // ids and stream URLs are meaningless on this one. The owner key covers
      // both cases (other server, other user on the same server); queues written
      // before that key existed are judged on their items' ServerId instead.
      const owner = loadQueueOwner();
      const foreignOwner = owner !== null && owner !== sessionKey;
      const foreignItem = saved.queue.some(
        (track) =>
          track.ServerId && user.ServerId && track.ServerId !== user.ServerId,
      );
      if (foreignOwner || foreignItem) {
        clearPersistedQueue();
        return;
      }

      const savedProgress = loadProgress();

      setState((prev) => ({
        ...prev,
        queue: saved.queue,
        originalQueue: saved.queue,
        queueIndex: saved.queueIndex,
        currentTrack,
        progress: savedProgress,
        duration: currentTrack?.RunTimeTicks
          ? Math.floor(currentTrack.RunTimeTicks / 10000000)
          : 0,
        isPlaying: false, // Don't auto-play on restore
      }));

      // On Android the service outlives a swipe-away and keeps playing. Reattach
      // to it now, or audio plays on with no way to pause it from the app's own
      // UI (the media notification still can). A failure here must not
      // surface: the next playback start retries the setup.
      ensurePlayerReady().catch((error) =>
        console.warn("[MusicPlayer] Failed to reattach on restore:", error),
      );
    }
  }, [api, user?.Id, user?.ServerId, sessionKey, ensurePlayerReady]);

  // Stop playback and drop the queue when the session moves to another
  // server/user or logs out — the previous server's tracks must not keep
  // playing (or resurface in the mini player) on the new session. No stopped
  // report is sent to the old server: its api instance is already replaced by
  // the time this runs, so that session ages out server-side instead.
  useEffect(() => {
    const prev = sessionKeyRef.current;
    sessionKeyRef.current = sessionKey;
    if (prev === null || prev === sessionKey) return;

    // Bump first and synchronously: work already in flight for the previous
    // account checks this before touching TrackPlayer or state, so it can no
    // longer re-add the old queue behind the reset below.
    sessionGenerationRef.current += 1;
    clearPersistedQueue();
    if (playerReadyRef.current) TrackPlayer.reset().catch(() => {});
    // A reattach still in flight ends with a live service: reset behind it.
    else
      playerSetupRef.current?.then(() => TrackPlayer.reset()).catch(() => {});
    setState((prevState) => ({
      ...defaultState,
      // Repeat/shuffle are user preferences, not server state — keep them.
      repeatMode: prevState.repeatMode,
      shuffleEnabled: prevState.shuffleEnabled,
    }));
  }, [sessionKey]);

  // Save queue whenever it changes.
  // The session teardown above clears storage and resets the state, but this
  // effect still runs once with the queue it had before that reset lands, so it
  // would write the previous account's queue straight back — with no owner when
  // logging out, or under the new owner when switching account. Only persist a
  // queue that still belongs to the signed-in session.
  useEffect(() => {
    if (!sessionKey || state.queue.length === 0) return;
    const first = state.queue[0];
    if (first?.ServerId && user?.ServerId && first.ServerId !== user.ServerId)
      return;
    saveQueueToStorage(state.queue, state.queueIndex, sessionKey);
  }, [state.queue, state.queueIndex, sessionKey, user?.ServerId]);

  // Save progress periodically
  useEffect(() => {
    if (state.progress > 0 && state.currentTrack) {
      saveProgress(state.progress);
    }
  }, [state.progress, state.currentTrack]);

  const reportPlaybackStart = useCallback(
    async (track: BaseItemDto, sessionId: string | null) => {
      if (!api || !user?.Id || !track.Id) return;

      try {
        await getSessionApi(api).reportPlaybackStart({
          playbackStartInfo: {
            ItemId: track.Id,
            PlaySessionId: sessionId || undefined,
            CanSeek: true,
            IsPaused: false,
            IsMuted: false,
            VolumeLevel: 100,
            PlayMethod: "DirectStream",
            ...playbackModesRef.current,
          },
        });
      } catch {
        // Silently fail
      }
    },
    [api, user?.Id],
  );

  const sendPlaybackProgress = useCallback(async () => {
    if (!api || !user?.Id || !state.currentTrack?.Id) return;

    try {
      await getSessionApi(api).reportPlaybackProgress({
        playbackProgressInfo: {
          ItemId: state.currentTrack.Id,
          PlaySessionId: state.playSessionId || undefined,
          PositionTicks: Math.floor(state.progress * 10000000),
          CanSeek: true,
          IsPaused: !state.isPlaying,
          IsMuted: false,
          VolumeLevel: 100,
          PlayMethod: "DirectStream",
          ...playbackModesRef.current,
        },
      });
    } catch {
      // Silently fail
    }
  }, [
    api,
    user?.Id,
    state.currentTrack?.Id,
    state.playSessionId,
    state.progress,
    state.isPlaying,
  ]);

  // The heartbeat. Its throttle counts heartbeats only: a mode change reported
  // in between must not push the next one back.
  const reportPlaybackProgress = useCallback(async () => {
    const now = Date.now();
    if (now - lastReportRef.current < PROGRESS_REPORT_INTERVAL) return;
    lastReportRef.current = now;
    await sendPlaybackProgress();
  }, [sendPlaybackProgress]);

  // A repeat or shuffle change is reported at once, whoever made it: a remote
  // control that just sent the command would otherwise keep showing the old
  // state until the next heartbeat. A queue restored from storage has no
  // stream yet and was never reported as playing, so it stays quiet: a
  // progress report for it would make the server list a session that is not
  // there.
  const sendPlaybackProgressRef = useRef(sendPlaybackProgress);
  sendPlaybackProgressRef.current = sendPlaybackProgress;
  const hasLiveTrack = !!state.currentTrack && !!state.streamUrl;
  const hasLiveTrackRef = useRef(hasLiveTrack);
  hasLiveTrackRef.current = hasLiveTrack;
  useEffect(() => {
    if (!hasLiveTrackRef.current) return;
    sendPlaybackProgressRef.current();
  }, [state.repeatMode, state.shuffleEnabled]);

  const reportPlaybackStopped = useCallback(
    async (
      track: BaseItemDto,
      positionTicks: number,
      sessionId: string | null,
    ) => {
      if (!api || !user?.Id || !track.Id) return;

      try {
        await getSessionApi(api).reportPlaybackStopped({
          playbackStopInfo: {
            ItemId: track.Id,
            PlaySessionId: sessionId || undefined,
            PositionTicks: Math.floor(positionTicks),
          },
        });
      } catch {
        // Silently fail
      }
    },
    [api, user?.Id],
  );

  // Helper to prepare a single track - checks cache first, then fetches from server
  const prepareTrack = useCallback(
    async (
      item: BaseItemDto,
      preferLocal: boolean,
    ): Promise<PreparedTrack | null> => {
      if (!api || !user?.Id || !item.Id) return null;

      // Check for local/cached version first
      const cachedUrl = preferLocal ? getLocalPath(item.Id) : null;

      if (cachedUrl) {
        // Downloaded track - instant return, no API call needed
        return {
          track: itemToTrack(item, cachedUrl, api, false), // false to avoid redundant cache check
          sessionId: null,
          mediaSource: null,
          isTranscoding: false,
          mediaInfo: null,
        };
      }

      // Not downloaded - need to fetch stream URL from server
      try {
        const result = await getAudioStreamUrl(api, user.Id, item.Id);
        if (!result) return null;

        return {
          track: itemToTrack(item, result.url, api, false),
          sessionId: result.sessionId,
          mediaSource: result.mediaSource,
          isTranscoding: result.isTranscoding,
          mediaInfo: {
            mediaSource: result.mediaSource,
            isTranscoding: result.isTranscoding,
          },
        };
      } catch (error) {
        console.warn(
          `[MusicPlayer] Failed to prepare track ${item.Id}:`,
          error,
        );
        // If server unreachable, check for cached version as fallback
        const fallbackCached = getLocalPath(item.Id);
        if (fallbackCached) {
          return {
            track: itemToTrack(item, fallbackCached, api, false),
            sessionId: null,
            mediaSource: null,
            isTranscoding: false,
            mediaInfo: null,
          };
        }
        return null;
      }
    },
    [api, user?.Id],
  );

  // Load remaining tracks in the background without blocking playback
  const loadRemainingTracksInBackground = useCallback(
    async (queue: BaseItemDto[], startIndex: number, preferLocal: boolean) => {
      if (!api || !user?.Id || !TrackPlayer) return;

      // This runs for a long time, one network round trip per track. If the
      // session switches meanwhile, every remaining track belongs to an account
      // that is no longer signed in, so stop instead of adding them; a new
      // queue start supersedes this queue the same way, and if the queue is
      // dropped, the remaining tracks are not in what replaced it.
      // Checked again inside every turn on the native queue, right before the
      // call that adds: the turn may have waited behind another edit, and the
      // session teardown bumps the generation before it resets the player, so
      // an add that passes the check is ahead of that reset.
      const generation = sessionGenerationRef.current;
      const startSequence = startSequenceRef.current;
      const queueGeneration = queueGenerationRef.current;
      const isStale = () =>
        generation !== sessionGenerationRef.current ||
        startSequence !== startSequenceRef.current ||
        queueGeneration !== queueGenerationRef.current;

      const mediaInfoMap: Record<string, TrackMediaInfo> = {};
      const failedItemIds: string[] = []; // Track items that failed to prepare

      // Process tracks BEFORE the start index (insert at position 0, pushing current track forward)
      const beforeTracks: { track: Track; index: number }[] = [];
      for (let i = 0; i < startIndex; i++) {
        const item = queue[i];
        if (!item.Id) continue;

        const prepared = await prepareTrack(item, preferLocal);
        if (isStale()) return;
        if (prepared) {
          beforeTracks.push({ track: prepared.track, index: i });
          if (prepared.mediaInfo) {
            mediaInfoMap[item.Id] = prepared.mediaInfo;
          }
        } else {
          failedItemIds.push(item.Id);
        }
      }

      // Insert tracks before current track (they go at index 0)
      if (beforeTracks.length > 0) {
        const addedTogether = await editNativeQueue(async () => {
          if (isStale() || loadedOutOfOrderRef.current) return false;
          await TrackPlayer.add(
            beforeTracks.map(({ track }) => track),
            0,
          );
          return true;
        });
        if (!addedTogether) {
          for (const { track, index } of beforeTracks) {
            if (isStale()) return;
            await editNativeQueue(() =>
              addInQueueOrder(queue, index, track, isStale),
            );
          }
        }
        if (isStale()) return;
        // Update queue index since we inserted tracks before the current one,
        // unless a jump has moved playback off the track this load started on
        // and set the index itself.
        setState((prev) => ({
          ...prev,
          queueIndex:
            prev.currentTrack?.Id === queue[startIndex]?.Id
              ? beforeTracks.length
              : prev.queueIndex,
          trackMediaInfoMap: { ...prev.trackMediaInfoMap, ...mediaInfoMap },
        }));
      }

      // Process tracks AFTER the start index (append to end)
      for (let i = startIndex + 1; i < queue.length; i++) {
        const item = queue[i];
        if (!item.Id) continue;

        const prepared = await prepareTrack(item, preferLocal);
        if (isStale()) return;
        if (prepared) {
          await editNativeQueue(async () => {
            if (isStale()) return;
            if (loadedOutOfOrderRef.current) {
              await addInQueueOrder(queue, i, prepared.track, isStale);
            } else {
              await TrackPlayer.add(prepared.track); // Append to end
            }
          });
          if (isStale()) return;
          if (prepared.mediaInfo && item.Id) {
            setState((prev) => ({
              ...prev,
              trackMediaInfoMap: {
                ...prev.trackMediaInfoMap,
                [item.Id!]: prepared.mediaInfo!,
              },
            }));
          }
        } else {
          failedItemIds.push(item.Id);
        }
      }

      // Remove failed items from queue to keep it in sync with TrackPlayer
      if (failedItemIds.length > 0 && !isStale()) {
        console.log(
          `[MusicPlayer] Removing ${failedItemIds.length} unavailable tracks from queue`,
        );
        setState((prev) => {
          const newQueue = prev.queue.filter(
            (t) => !failedItemIds.includes(t.Id!),
          );
          const newOriginalQueue = prev.originalQueue.filter(
            (t) => !failedItemIds.includes(t.Id!),
          );
          // Recalculate queue index based on current track position in filtered queue
          const currentTrackId = prev.currentTrack?.Id;
          const newQueueIndex = currentTrackId
            ? newQueue.findIndex((t) => t.Id === currentTrackId)
            : 0;
          return {
            ...prev,
            queue: newQueue,
            originalQueue: newOriginalQueue,
            queueIndex: newQueueIndex >= 0 ? newQueueIndex : prev.queueIndex,
          };
        });
      }
    },
    [api, user?.Id, prepareTrack],
  );

  const loadAndPlayQueue = useCallback(
    async (queue: BaseItemDto[], startIndex: number) => {
      if (!api || !user?.Id || queue.length === 0 || !TrackPlayer) return;

      // Preparing a track is a network round trip; a session switch during it
      // would otherwise let this call re-add the previous account's track and
      // report a playback start against the wrong server. A later start
      // supersedes one still preparing: both would resume behind the same
      // setup and interleave their resets and adds.
      const generation = sessionGenerationRef.current;
      const startSequence = ++startSequenceRef.current;
      const isStale = () =>
        generation !== sessionGenerationRef.current ||
        startSequence !== startSequenceRef.current;

      const preferLocal = settings?.preferLocalAudio ?? true;

      // Apply offline filtering at the start to ensure state.queue matches TrackPlayer queue
      let finalQueue = queue;
      let finalIndex = startIndex;

      if (isOffline) {
        const filtered = filterQueueForOffline(queue, startIndex);
        finalQueue = filtered.queue;
        finalIndex = filtered.startIndex;

        if (finalQueue.length === 0) {
          console.warn(
            "[MusicPlayer] No downloaded tracks available for offline playback",
          );
          return;
        }
      }

      const targetItem = finalQueue[finalIndex];
      loadingStartSeqRef.current = startSequence;
      setState((prev) => ({
        ...prev,
        isLoading: true,
        loadingTrackId: targetItem?.Id ?? null,
      }));

      // A bail clears only the spinner this call put up: a superseding start
      // shows its own, which may be for the same track.
      const clearOwnLoading = () =>
        setState((prev) =>
          prev.loadingTrackId === (targetItem?.Id ?? null) &&
          loadingStartSeqRef.current === startSequence
            ? { ...prev, isLoading: false, loadingTrackId: null }
            : prev,
        );
      const bailIfStale = () => {
        if (!isStale()) return false;
        clearOwnLoading();
        return true;
      };

      try {
        // Wait for the setup before preparing, not after: the starts waiting
        // on it resume together, and the sequence check drops all but the
        // last of them.
        await ensurePlayerReady();
        if (bailIfStale()) return;

        // PHASE 1: Prepare and play the target track immediately
        const targetTrackResult = await prepareTrack(targetItem, preferLocal);
        if (bailIfStale()) return;

        if (!targetTrackResult) {
          clearOwnLoading();
          return;
        }

        // Reset and start playback immediately with just the target track.
        // One turn on the native queue: a superseding or superseded start
        // cannot interleave between the reset and the add.
        loadedOutOfOrderRef.current = false;
        const played = await editNativeQueue(async () => {
          if (isStale()) return false;
          // The queue before this one is dropped here: its background load
          // stops instead of adding its tracks to this one.
          queueGenerationRef.current += 1;
          await TrackPlayer.reset();
          if (isStale()) return false;
          // Before the first sample: the track change event that also sets
          // the volume reaches JS only once the track is already loading.
          setMusicNormalizationTrack(targetTrackResult.track);
          await TrackPlayer.add(targetTrackResult.track);
          await TrackPlayer.play();
          return !isStale();
        });
        if (!played) {
          bailIfStale();
          return;
        }

        // Update state for immediate playback
        setState((prev) => ({
          ...prev,
          queue: finalQueue,
          originalQueue: finalQueue,
          queueIndex: 0, // Target track is at index 0 in TrackPlayer initially
          currentTrack: targetItem,
          isLoading: false,
          loadingTrackId: null,
          isPlaying: true,
          streamUrl: targetTrackResult.track.url || null,
          playSessionId: targetTrackResult.sessionId,
          duration: targetItem?.RunTimeTicks
            ? Math.floor(targetItem.RunTimeTicks / 10000000)
            : 0,
          mediaSource: targetTrackResult.mediaSource,
          isTranscoding: targetTrackResult.isTranscoding,
          trackMediaInfoMap:
            targetTrackResult.mediaInfo && targetItem.Id
              ? { [targetItem.Id]: targetTrackResult.mediaInfo }
              : {},
        }));

        reportPlaybackStart(targetItem, targetTrackResult.sessionId);

        // PHASE 2: Load remaining tracks in background (non-blocking)
        if (finalQueue.length > 1) {
          loadRemainingTracksInBackground(finalQueue, finalIndex, preferLocal);
        }
      } catch (error) {
        // Tapping a track just stops spinning when this fails. Android refuses
        // the setup while the app is backgrounded: an expected outcome.
        logAndCaptureError(
          "Loading music queue failed",
          (error as { code?: string } | null)?.code ===
            "android_cannot_setup_player_in_background"
            ? markExpectedError(error)
            : error,
        );
        setState((prev) => ({
          ...prev,
          isLoading: false,
          loadingTrackId: null,
        }));
      }
    },
    [
      api,
      user?.Id,
      reportPlaybackStart,
      settings?.preferLocalAudio,
      prepareTrack,
      loadRemainingTracksInBackground,
      isOffline,
      ensurePlayerReady,
    ],
  );

  // When the session ends, the queue comes back to the phone paused where the
  // receiver was. Nothing loads: resume loads the track, as for a queue
  // restored at launch, and the native queue of before is dropped so next and
  // previous do not walk it. A phone that never played has no player to reset,
  // and a reset before setup rejects.
  // The phone's player lets go of its queue, which the receiver has or hands back: next and previous would walk it, and
  // its loads in the background would go on adding to it. A phone that never played has no player to reset, and a
  // reset before setup rejects.
  const releasePhonePlayer = useCallback(async () => {
    queueGenerationRef.current += 1;
    if (playerReadyRef.current) {
      await TrackPlayer?.reset().catch((error: unknown) =>
        logAndCaptureError("Resetting the player for the receiver", error),
      );
    } else {
      // A reattach still in flight ends with a live service: reset behind it.
      playerSetupRef.current?.then(() => TrackPlayer.reset()).catch(() => {});
    }
  }, []);

  const handBackFromReceiver = useCallback(
    (view: MusicCastRemoteView) => {
      void releasePhonePlayer();
      setState((prev) => ({
        ...prev,
        queue: view.queue,
        originalQueue: view.queue,
        queueIndex: view.queueIndex,
        currentTrack: view.currentTrack,
        isPlaying: false,
        isLoading: false,
        loadingTrackId: null,
        progress: view.progress,
        duration: view.duration,
        streamUrl: null,
        playSessionId: null,
        mediaSource: null,
        isTranscoding: false,
      }));
    },
    [releasePhonePlayer],
  );
  // The receiver plays on through a drop of the phone's own network: only the
  // end of the Cast session hands the queue back. iOS suspends the session
  // while the app is in the background, and the state reads not connected
  // until the SDK resumes it: a suspended session is still the receiver's.
  // The state and the target come as separate events, the state first on an
  // iPhone: a Cast target still connected holds the session until the target
  // says what became of it.
  const remoteTarget = useRemoteTarget();
  const sessionHeld =
    castState === CastState.CONNECTED ||
    (remoteTarget.state === "connected" &&
      remoteTarget.target?.kind === "cast") ||
    (remoteTarget.state === "connecting" && remoteTarget.reconnecting);
  const remote = useMusicCastRemote({
    api,
    userId: user?.Id,
    ownerKey: sessionKey,
    connected: sessionHeld,
    onHandBack: handBackFromReceiver,
  });
  const { begin: beginOnReceiver, end: endOnReceiver } = remote;

  // The queue leaves the phone for the receiver: the phone's play session ends
  // with it, or the server lists the phone playing next to the TV, from its
  // last report. Ended once: a later stop finds no session to report.
  const endPhoneSessionForReceiver = useCallback(() => {
    const sessionId = state.playSessionId;
    if (!state.currentTrack || !sessionId) return;
    reportPlaybackStopped(
      state.currentTrack,
      state.progress * 10000000,
      sessionId,
    );
    setState((prev) =>
      prev.playSessionId === sessionId
        ? { ...prev, playSessionId: null }
        : prev,
    );
  }, [
    state.currentTrack,
    state.playSessionId,
    state.progress,
    reportPlaybackStopped,
  ]);

  // A connected Cast session plays the music on the receiver, and the phone
  // stops so that one place plays. The player shows the queue from the send.
  const castOnReceiver = useCallback(
    async (queue: BaseItemDto[], startIndex: number, startSeconds = 0) => {
      // Read before the pause: the account can switch while the phone stops.
      const generation = sessionGenerationRef.current;
      const isStale = () => generation !== sessionGenerationRef.current;
      // Let go of, not paused: a paused player stays on the lock screen, the notification and the headset buttons,
      // whose Play started the phone alongside the receiver. A start of the phone's still on its way plays nothing.
      startSequenceRef.current += 1;
      await releasePhonePlayer();
      setState((prev) => ({
        ...prev,
        isPlaying: false,
        isLoading: false,
        loadingTrackId: null,
        streamUrl: null,
        playSessionId: null,
        mediaSource: null,
        isTranscoding: false,
      }));
      if (isStale()) return;
      const sent = beginOnReceiver(queue, startIndex, startSeconds);
      const started = await castQueue({
        queue,
        startIndex,
        startPositionTicks: Math.round(startSeconds * 10000000),
        isStale,
      });
      if (!started) endOnReceiver(sent);
    },
    [castQueue, releasePhonePlayer, beginOnReceiver, endOnReceiver],
  );

  // Connecting while the phone plays moves the queue to the receiver. A queue
  // left paused, restored at launch say, stays: the session may be for a film.
  const previousCastState = useRef(castState);
  useEffect(() => {
    const previous = previousCastState.current;
    previousCastState.current = castState;
    if (!castConnected || previous === CastState.CONNECTED) return;
    if (!state.isPlaying || state.queue.length === 0) return;
    // A Play pressed while connecting (a film, say) is for the receiver: the phone pauses for it, and the queue stays
    // here rather than replace it there.
    if (isPressForTargetHeld()) {
      if (TrackPlayer) {
        void TrackPlayer.pause();
        setState((prev) => ({ ...prev, isPlaying: false }));
      }
      return;
    }
    const index = state.queue.findIndex((t) => t.Id === state.currentTrack?.Id);
    endPhoneSessionForReceiver();
    void castOnReceiver(state.queue, Math.max(index, 0));
  }, [
    castState,
    castConnected,
    castOnReceiver,
    endPhoneSessionForReceiver,
    state.isPlaying,
    state.queue,
    state.currentTrack,
  ]);

  const playTrack = useCallback(
    (track: BaseItemDto, queue?: BaseItemDto[]) => {
      if (state.currentTrack && state.playSessionId) {
        reportPlaybackStopped(
          state.currentTrack,
          state.progress * 10000000,
          state.playSessionId,
        );
      }

      const newQueue = queue || [track];
      const queueIndex = newQueue.findIndex((t) => t.Id === track.Id);
      if (castConnected) {
        void castOnReceiver(newQueue, Math.max(queueIndex, 0));
        return;
      }
      loadAndPlayQueue(newQueue, Math.max(queueIndex, 0));
    },
    [
      state.currentTrack,
      state.playSessionId,
      state.progress,
      reportPlaybackStopped,
      loadAndPlayQueue,
      castConnected,
      castOnReceiver,
    ],
  );

  const playQueue = useCallback(
    (queue: BaseItemDto[], startIndex = 0) => {
      if (queue.length === 0) return;

      if (state.currentTrack && state.playSessionId) {
        reportPlaybackStopped(
          state.currentTrack,
          state.progress * 10000000,
          state.playSessionId,
        );
      }

      let finalQueue = queue;
      let finalIndex = startIndex;

      // When offline, filter to downloaded items only
      if (isOffline) {
        const filtered = filterQueueForOffline(queue, startIndex);
        finalQueue = filtered.queue;
        finalIndex = filtered.startIndex;

        if (finalQueue.length === 0) {
          console.warn(
            "[MusicPlayer] No downloaded tracks available for offline playback",
          );
          return;
        }
      }

      // Apply shuffle if enabled
      if (state.shuffleEnabled) {
        finalQueue = shuffleArray(finalQueue, finalIndex);
        finalIndex = 0;
      }

      if (castConnected) {
        void castOnReceiver(finalQueue, finalIndex);
        return;
      }
      loadAndPlayQueue(finalQueue, finalIndex);
    },
    [
      state.currentTrack,
      state.playSessionId,
      state.progress,
      state.shuffleEnabled,
      reportPlaybackStopped,
      loadAndPlayQueue,
      isOffline,
      castConnected,
      castOnReceiver,
    ],
  );

  const playAlbum = useCallback(
    async (albumId: string, startIndex = 0) => {
      if (!api || !user?.Id) return;

      try {
        const { getLibraryApi } = await import("@jellyfin/sdk/lib/utils/api");
        const response = await getLibraryApi(api).getItems({
          userId: user.Id,
          parentId: albumId,
          sortBy: ["IndexNumber"],
          sortOrder: ["Ascending"],
        });

        const tracks = response.data.Items || [];
        if (tracks.length > 0) {
          playQueue(tracks, startIndex);
        }
      } catch (error) {
        // Tapping play on an album does nothing at all when this fails.
        logAndCaptureError("Fetching album tracks for playback failed", error);
      }
    },
    [api, user?.Id, playQueue],
  );

  const playPlaylist = useCallback(
    async (playlistId: string, startIndex = 0) => {
      if (!api || !user?.Id) return;

      try {
        const { getLibraryApi } = await import("@jellyfin/sdk/lib/utils/api");
        const response = await getLibraryApi(api).getItems({
          userId: user.Id,
          parentId: playlistId,
          sortBy: ["SortName"],
          sortOrder: ["Ascending"],
        });

        const tracks = response.data.Items || [];
        if (tracks.length > 0) {
          playQueue(tracks, startIndex);
        }
      } catch (error) {
        // Tapping play on a playlist does nothing at all when this fails.
        logAndCaptureError(
          "Fetching playlist tracks for playback failed",
          error,
        );
      }
    },
    [api, user?.Id, playQueue],
  );

  const pause = useCallback(async () => {
    if (!TrackPlayer || !(await playerReadyForControl())) return;
    await TrackPlayer.pause();
    setState((prev) => ({ ...prev, isPlaying: false }));
  }, [playerReadyForControl]);

  const resume = useCallback(async () => {
    // As on Spotify: a connected session takes the paused queue, from the
    // track and the place it paused on, and the phone stays silent.
    if (castConnected && state.queue.length > 0) {
      const index = state.queue.findIndex(
        (t) => t.Id === state.currentTrack?.Id,
      );
      endPhoneSessionForReceiver();
      void castOnReceiver(state.queue, Math.max(index, 0), state.progress);
      return;
    }
    if (!TrackPlayer) return;
    const generation = sessionGenerationRef.current;
    const isStale = () => generation !== sessionGenerationRef.current;
    if (!(await playerReadyForControl()) || isStale()) return;
    if (!state.streamUrl && state.currentTrack && api && user?.Id) {
      // Need to load the track first (e.g., after app restart)
      const result = await getAudioStreamUrl(
        api,
        user.Id,
        state.currentTrack.Id!,
      );
      if (!result || isStale()) return;

      // An Android service that outlived a swipe-away can still hold a track
      // of the restored queue — maybe not the one this render saw last.
      // Playing what it holds is the resume the tap asked for; a reset would
      // restart the stream it still has. The live track's own url fills
      // streamUrl, which is what marks playback live for the remote commands.
      const activeTrack = await TrackPlayer.getActiveTrack();
      if (isStale()) return;
      const liveIndex = activeTrack?.id
        ? state.queue.findIndex((t) => t.Id === activeTrack.id)
        : -1;
      if (liveIndex >= 0) {
        await TrackPlayer.play();
        setState((prev) => {
          // prev.queue is the queue now: a shuffle during the waits may have
          // reordered the one this render captured.
          const index = activeTrack?.id
            ? prev.queue.findIndex((t) => t.Id === activeTrack.id)
            : -1;
          if (index < 0) return prev;
          const base =
            index === prev.queueIndex ? prev : withRestoredTrack(prev, index);
          return {
            ...base,
            streamUrl: activeTrack?.url ?? null,
            // The PlaybackInfo above opened a session for the track on screen:
            // when that is the live one, stop reports go under it.
            playSessionId:
              activeTrack?.id === state.currentTrack?.Id
                ? result.sessionId
                : prev.playSessionId,
            isPlaying: true,
          };
        });
        return;
      }

      const preferLocal = settings?.preferLocalAudio ?? true;
      const track = itemToTrack(
        state.currentTrack,
        result.url,
        api,
        preferLocal,
      );
      loadedOutOfOrderRef.current = false;
      // The native queue is dropped: a background load still adding to it stops.
      queueGenerationRef.current += 1;
      await TrackPlayer.reset();
      if (isStale()) return;
      setMusicNormalizationTrack(track);
      await TrackPlayer.add(track);
      // The ref, not the render's state: a seek during the waits above moved
      // the saved position this call has not seen.
      await TrackPlayer.seekTo(progressRef.current);
      await TrackPlayer.play();
      if (isStale()) {
        await TrackPlayer.reset().catch(() => {});
        return;
      }
      setState((prev) => ({
        ...prev,
        streamUrl: result.url,
        playSessionId: result.sessionId,
        isPlaying: true,
      }));
      // The native queue holds this one track: load the rest of the restored
      // queue behind it, as a fresh start does, or next, previous and the end
      // of the track find nothing after it.
      if (state.queue.length > 1) {
        loadRemainingTracksInBackground(
          state.queue,
          state.queueIndex,
          preferLocal,
        );
      }
    } else {
      await TrackPlayer.play();
      setState((prev) => ({ ...prev, isPlaying: true }));
    }
  }, [
    api,
    user?.Id,
    state.streamUrl,
    state.currentTrack,
    state.queue,
    state.queueIndex,
    state.progress,
    settings?.preferLocalAudio,
    playerReadyForControl,
    loadRemainingTracksInBackground,
    castConnected,
    castOnReceiver,
    endPhoneSessionForReceiver,
  ]);

  const togglePlayPause = useCallback(async () => {
    if (state.isPlaying) {
      await pause();
    } else {
      await resume();
    }
  }, [state.isPlaying, pause, resume]);

  const next = useCallback(async () => {
    if (!TrackPlayer) return;

    // A queue restored after a restart is only on screen until playback
    // resumes: it can be walked without the player, and must be when setup
    // is still running or has failed. A service that kept its tracks answers
    // getQueue with them and takes the native path below instead.
    const restoredOnly =
      !state.isLoading && !state.streamUrl && state.queue.length > 0;
    const advanceRestored = () => {
      let nextIndex = state.queueIndex + 1;
      if (nextIndex >= state.queue.length) {
        if (state.repeatMode !== "all") return;
        nextIndex = 0;
      }
      // The save effect skips a zero progress, so write it here or the
      // previous track's position survives onto this one.
      saveProgress(0);
      setState((prev) => withRestoredTrack(prev, nextIndex));
    };

    let nativeQueue: Track[];
    if (restoredOnly) {
      const ready = playerReadyRef.current || (await playerReadyForControl());
      nativeQueue = ready ? await TrackPlayer.getQueue() : [];
      if (nativeQueue.length === 0) {
        advanceRestored();
        return;
      }
    } else {
      if (!(await playerReadyForControl())) return;
      nativeQueue = await TrackPlayer.getQueue();
    }

    const currentIndex = await TrackPlayer.getActiveTrackIndex();
    const queueLength = nativeQueue.length;

    if (currentIndex !== undefined && currentIndex < queueLength - 1) {
      if (state.currentTrack && state.playSessionId) {
        reportPlaybackStopped(
          state.currentTrack,
          state.progress * 10000000,
          state.playSessionId,
        );
      }
      await TrackPlayer.skipToNext();
      setState((prev) => withCurrentTrack(prev, nativeQueue, currentIndex + 1));
    } else if (state.repeatMode === "all" && queueLength > 0) {
      // Wrapping needs a native track to wrap to. A queue restored after a
      // restart is only on screen until playback resumes, and the native side
      // rejects a skip into an empty queue.
      if (state.currentTrack && state.playSessionId) {
        reportPlaybackStopped(
          state.currentTrack,
          state.progress * 10000000,
          state.playSessionId,
        );
      }
      await TrackPlayer.skip(0);
      setState((prev) => withCurrentTrack(prev, nativeQueue, 0));
    }
  }, [
    state.currentTrack,
    state.playSessionId,
    state.progress,
    state.repeatMode,
    state.queue,
    state.queueIndex,
    state.isLoading,
    state.streamUrl,
    reportPlaybackStopped,
    playerReadyForControl,
  ]);

  const previous = useCallback(async () => {
    if (!TrackPlayer || !(await playerReadyForControl())) return;
    const position = await TrackPlayer.getProgress().then(
      (p: Progress) => p.position,
    );

    if (position > PREVIOUS_RESTARTS_TRACK_AFTER_SECONDS) {
      await TrackPlayer.seekTo(0);
      setState((prev) => ({ ...prev, progress: 0 }));
      return;
    }

    const currentIndex = await TrackPlayer.getActiveTrackIndex();
    const nativeQueue: Track[] = await TrackPlayer.getQueue();

    if (currentIndex !== undefined && currentIndex > 0) {
      if (state.currentTrack && state.playSessionId) {
        reportPlaybackStopped(
          state.currentTrack,
          state.progress * 10000000,
          state.playSessionId,
        );
      }
      await TrackPlayer.skipToPrevious();
      setState((prev) => withCurrentTrack(prev, nativeQueue, currentIndex - 1));
    } else if (state.repeatMode === "all") {
      // Wrap to the last track the native queue holds, not the last one on
      // screen: while the queue is still loading the native one is shorter,
      // and it rejects an index past its end.
      const lastIndex = nativeQueue.length - 1;
      if (lastIndex < 0) return;

      if (state.currentTrack && state.playSessionId) {
        reportPlaybackStopped(
          state.currentTrack,
          state.progress * 10000000,
          state.playSessionId,
        );
      }
      await TrackPlayer.skip(lastIndex);
      setState((prev) => withCurrentTrack(prev, nativeQueue, lastIndex));
    }
  }, [
    state.currentTrack,
    state.playSessionId,
    state.progress,
    state.repeatMode,
    reportPlaybackStopped,
    playerReadyForControl,
  ]);

  const seek = useCallback(
    async (position: number) => {
      if (!TrackPlayer) return;
      // A restored queue has nothing loaded: resume seeds seekTo from
      // state.progress when it loads the track, so only state moves — even
      // while setup is still running or has failed. Once something is loaded
      // the native side says so, where streamUrl cannot: it stays null after
      // a reattach or a jumpToIndex load.
      if (!state.streamUrl && state.currentTrack) {
        // The save effect skips a zero progress, so write it directly — and
        // write before the wait: the labels and a resume that reads
        // state.progress see the new position even while setup runs, and no
        // stop can slip a clear in between.
        saveProgress(position);
        setState((prev) => ({ ...prev, progress: position }));
        const ready = playerReadyRef.current || (await playerReadyForControl());
        if (!ready || (await TrackPlayer.getActiveTrackIndex()) === undefined) {
          return;
        }
      } else if (!(await playerReadyForControl())) return;
      await TrackPlayer.seekTo(position);
      setState((prev) => ({ ...prev, progress: position }));
    },
    [playerReadyForControl, state.streamUrl, state.currentTrack],
  );

  const stop = useCallback(async () => {
    if (!TrackPlayer) return;
    // Starts and queue edits waiting behind a wait check the generation
    // before touching the player: a stop must cancel them too, or one behind
    // the setup would play after the queue it stood for is gone.
    sessionGenerationRef.current += 1;
    if (state.currentTrack && state.playSessionId) {
      reportPlaybackStopped(
        state.currentTrack,
        state.progress * 10000000,
        state.playSessionId,
      );
    }

    queueGenerationRef.current += 1;
    try {
      if (playerReadyRef.current) await TrackPlayer.reset();
      // A reattach still in flight ends with a live service: reset behind it.
      else
        playerSetupRef.current?.then(() => TrackPlayer.reset()).catch(() => {});
    } finally {
      // Even a failed reset must not leave a queue that restores on next launch.
      clearPersistedQueue();
    }

    setState({
      currentTrack: null,
      queue: [],
      originalQueue: [],
      queueIndex: 0,
      isPlaying: false,
      isLoading: false,
      loadingTrackId: null,
      progress: 0,
      duration: 0,
      streamUrl: null,
      playSessionId: null,
      repeatMode: state.repeatMode,
      shuffleEnabled: state.shuffleEnabled,
      mediaSource: null,
      isTranscoding: false,
      trackMediaInfoMap: {},
    });
  }, [
    state.currentTrack,
    state.playSessionId,
    state.progress,
    state.repeatMode,
    state.shuffleEnabled,
    reportPlaybackStopped,
  ]);

  // Queue management
  const addToQueue = useCallback(
    async (tracks: BaseItemDto | BaseItemDto[]) => {
      if (!api || !user?.Id || !TrackPlayer) return;

      const tracksArray = Array.isArray(tracks) ? tracks : [tracks];
      const preferLocal = settings?.preferLocalAudio ?? true;

      const generation = sessionGenerationRef.current;
      const startSequence = startSequenceRef.current;
      // A stop or account switch bumps the generation; a new queue start
      // bumps the sequence. Both supersede an edit for what was playing.
      const isStale = () =>
        generation !== sessionGenerationRef.current ||
        startSequence !== startSequenceRef.current;
      if (!(await playerReadyForControl()) || isStale()) return;

      // Add to TrackPlayer queue
      for (const item of tracksArray) {
        if (!item.Id || isStale()) continue;
        const cachedUrl = getLocalPath(item.Id);
        const result = await getAudioStreamUrl(api, user.Id, item.Id);
        if (isStale()) continue;
        if (result) {
          await TrackPlayer.add(
            itemToTrack(item, result.url, api, preferLocal),
          );
        } else if (cachedUrl) {
          console.log(
            `[MusicPlayer] Using cached file (offline) for ${item.Name}: ${cachedUrl}`,
          );
          await TrackPlayer.add(itemToTrack(item, cachedUrl, api, true));
        }
      }

      if (isStale()) return;
      setState((prev) => ({
        ...prev,
        queue: [...prev.queue, ...tracksArray],
        originalQueue: [...prev.originalQueue, ...tracksArray],
      }));
    },
    [api, user?.Id, settings?.preferLocalAudio, playerReadyForControl],
  );

  const playNext = useCallback(
    async (tracks: BaseItemDto | BaseItemDto[]) => {
      if (!api || !user?.Id || !TrackPlayer) return;

      const tracksArray = Array.isArray(tracks) ? tracks : [tracks];
      const preferLocal = settings?.preferLocalAudio ?? true;

      const generation = sessionGenerationRef.current;
      const startSequence = startSequenceRef.current;
      // A stop or account switch bumps the generation; a new queue start
      // bumps the sequence. Both supersede an edit for what was playing.
      const isStale = () =>
        generation !== sessionGenerationRef.current ||
        startSequence !== startSequenceRef.current;
      if (!(await playerReadyForControl()) || isStale()) return;

      // Add to TrackPlayer queue after current track
      for (let i = tracksArray.length - 1; i >= 0; i--) {
        const item = tracksArray[i];
        if (!item.Id || isStale()) continue;
        const cachedUrl = getLocalPath(item.Id);
        const result = await getAudioStreamUrl(api, user.Id, item.Id);
        // Read where to insert after the network round trip, not before it: a
        // queue started or stopped meanwhile is shorter than a position taken
        // from the previous one, and the native side rejects that.
        const currentIndex = await TrackPlayer.getActiveTrackIndex();
        const insertIndex = (currentIndex ?? -1) + 1;
        // The state skips a superseded edit, so the native queue must too.
        if (isStale()) continue;
        if (result) {
          await TrackPlayer.add(
            itemToTrack(item, result.url, api, preferLocal),
            insertIndex,
          );
        } else if (cachedUrl) {
          console.log(
            `[MusicPlayer] Using cached file (offline) for ${item.Name}: ${cachedUrl}`,
          );
          await TrackPlayer.add(
            itemToTrack(item, cachedUrl, api, true),
            insertIndex,
          );
        }
      }

      if (isStale()) return;
      setState((prev) => {
        const stateInsertIndex = prev.queueIndex + 1;
        const newQueue = [...prev.queue];
        const newOriginalQueue = [...prev.originalQueue];

        newQueue.splice(stateInsertIndex, 0, ...tracksArray);
        newOriginalQueue.splice(stateInsertIndex, 0, ...tracksArray);

        return {
          ...prev,
          queue: newQueue,
          originalQueue: newOriginalQueue,
        };
      });
    },
    [api, user?.Id, settings?.preferLocalAudio, playerReadyForControl],
  );

  const removeFromQueue = useCallback(
    async (index: number) => {
      if (!TrackPlayer || !(await playerReadyForControl())) return;
      const queueLength = (await TrackPlayer.getQueue()).length;
      const currentIndex = await TrackPlayer.getActiveTrackIndex();

      if (index < 0 || index >= queueLength) return;
      if (index === currentIndex) return; // Can't remove currently playing

      await TrackPlayer.remove(index);

      setState((prev) => {
        if (index < 0 || index >= prev.queue.length) return prev;
        if (index === prev.queueIndex) return prev;

        const newQueue = [...prev.queue];
        const removedTrack = newQueue.splice(index, 1)[0];

        const newOriginalQueue = prev.originalQueue.filter(
          (t) => t.Id !== removedTrack.Id,
        );

        const newIndex =
          index < prev.queueIndex ? prev.queueIndex - 1 : prev.queueIndex;

        return {
          ...prev,
          queue: newQueue,
          originalQueue: newOriginalQueue,
          queueIndex: newIndex,
        };
      });
    },
    [playerReadyForControl],
  );

  const moveInQueue = useCallback(
    async (fromIndex: number, toIndex: number) => {
      if (!TrackPlayer || !(await playerReadyForControl())) return;
      const queue = await TrackPlayer.getQueue();
      if (
        fromIndex < 0 ||
        fromIndex >= queue.length ||
        toIndex < 0 ||
        toIndex >= queue.length ||
        fromIndex === toIndex
      ) {
        return;
      }

      await TrackPlayer.move(fromIndex, toIndex);

      setState((prev) => {
        const newQueue = [...prev.queue];
        const [movedItem] = newQueue.splice(fromIndex, 1);
        newQueue.splice(toIndex, 0, movedItem);

        let newIndex = prev.queueIndex;
        if (fromIndex === prev.queueIndex) {
          newIndex = toIndex;
        } else if (fromIndex < prev.queueIndex && toIndex >= prev.queueIndex) {
          newIndex = prev.queueIndex - 1;
        } else if (fromIndex > prev.queueIndex && toIndex <= prev.queueIndex) {
          newIndex = prev.queueIndex + 1;
        }

        return {
          ...prev,
          queue: newQueue,
          queueIndex: newIndex,
        };
      });
    },
    [playerReadyForControl],
  );

  // Reorder queue with a new array (used by drag-to-reorder UI)
  const reorderQueue = useCallback(
    async (newQueue: BaseItemDto[]) => {
      if (!TrackPlayer || !(await playerReadyForControl())) return;
      // Find where the current track ended up in the new order
      const currentTrackId = state.currentTrack?.Id;
      const newIndex = currentTrackId
        ? newQueue.findIndex((t) => t.Id === currentTrackId)
        : 0;

      // Build the reordering operations for TrackPlayer
      // We need to match TrackPlayer's queue to the new order
      const tpQueue = await TrackPlayer.getQueue();

      // Create a map of trackId -> current TrackPlayer index
      const currentPositions = new Map<string, number>();
      tpQueue.forEach((track: Track, idx: number) => {
        currentPositions.set(track.id, idx);
      });

      // Move tracks one by one to match the new order
      // Work backwards to avoid index shifting issues
      for (let targetIdx = newQueue.length - 1; targetIdx >= 0; targetIdx--) {
        const trackId = newQueue[targetIdx].Id;
        if (!trackId) continue;

        const currentIdx = currentPositions.get(trackId);
        if (currentIdx !== undefined && currentIdx !== targetIdx) {
          await TrackPlayer.move(currentIdx, targetIdx);

          // Update positions map after move
          currentPositions.forEach((pos, id) => {
            if (currentIdx < targetIdx) {
              // Moving down: items between shift up
              if (pos > currentIdx && pos <= targetIdx) {
                currentPositions.set(id, pos - 1);
              }
            } else {
              // Moving up: items between shift down
              if (pos >= targetIdx && pos < currentIdx) {
                currentPositions.set(id, pos + 1);
              }
            }
          });
          currentPositions.set(trackId, targetIdx);
        }
      }

      setState((prev) => ({
        ...prev,
        queue: newQueue,
        queueIndex: Math.max(newIndex, 0),
        currentTrack: newIndex >= 0 ? newQueue[newIndex] : prev.currentTrack,
      }));
    },
    [state.currentTrack?.Id, playerReadyForControl],
  );

  const clearQueue = useCallback(async () => {
    if (!TrackPlayer || !(await playerReadyForControl())) return;
    // Before reading the queue: the background load stops adding to it.
    queueGenerationRef.current += 1;
    const currentIndex = await TrackPlayer.getActiveTrackIndex();
    const queue = await TrackPlayer.getQueue();

    if (currentIndex === undefined || queue.length === 0) return;

    // Remove all tracks except current
    const indicesToRemove = queue
      .map((_: Track, i: number) => i)
      .filter((i: number) => i !== currentIndex);

    // Remove in reverse order to not mess up indices
    for (const i of indicesToRemove.reverse()) {
      await TrackPlayer.remove(i);
    }

    setState((prev) => {
      if (!prev.currentTrack) return prev;

      return {
        ...prev,
        queue: [prev.currentTrack],
        originalQueue: [prev.currentTrack],
        queueIndex: 0,
      };
    });
  }, [playerReadyForControl]);

  const jumpToIndex = useCallback(
    async (index: number) => {
      // A session that switches account resets the player, and nothing of the
      // previous account may go back into it. Captured before the setup wait:
      // a switch during it hands this call the new generation. Checked after
      // every wait, and inside a turn on the native queue right before the
      // call that changes it: the teardown bumps the generation before it
      // resets the player, so a call that passes the check is ahead of that
      // reset.
      const generation = sessionGenerationRef.current;
      const isStale = () => generation !== sessionGenerationRef.current;
      if (!TrackPlayer || !(await playerReadyForControl()) || isStale()) return;
      if (
        index < 0 ||
        index >= state.queue.length ||
        index === state.queueIndex
      )
        return;

      const targetItem = state.queue[index];
      const targetId = targetItem?.Id;
      if (!targetId) return;

      // `index` is a position in the queue on screen. The native queue only
      // holds what has been loaded so far, so look the track up there by id.
      // Finding it and skipping to it is one edit: the background load must
      // not put a track in front of it in between.
      const jumped = await editNativeQueue(async () => {
        const nativeQueue = await TrackPlayer.getQueue();
        if (isStale()) return false;
        const nativeIndex = nativeIndexOf(nativeQueue, targetId, index);
        if (nativeIndex >= 0) await TrackPlayer.skip(nativeIndex);
        return nativeIndex >= 0;
      });
      if (isStale()) return;

      if (!jumped) {
        // Track not loaded yet - need to load it first
        setState((prev) => ({
          ...prev,
          isLoading: true,
          loadingTrackId: targetId,
        }));

        try {
          const preferLocal = settings?.preferLocalAudio ?? true;
          const prepared = await prepareTrack(targetItem, preferLocal);
          if (!prepared || isStale()) return;

          const landed = await editNativeQueue(async () => {
            // Preparing was a network round trip, so read the queue again: the
            // background load may have added this very track meanwhile.
            const nativeQueue: Track[] = await TrackPlayer.getQueue();
            if (isStale()) return false;
            let nativeIndex = nativeIndexOf(nativeQueue, targetId, index);

            if (nativeIndex < 0) {
              const insertIndex = nativeInsertIndexFor(
                state.queue,
                index,
                nativeQueue,
              );
              loadedOutOfOrderRef.current = true;
              await TrackPlayer.add(prepared.track, insertIndex);
              if (isStale()) return false;
              nativeIndex = insertIndex ?? nativeQueue.length;
            }
            await TrackPlayer.skip(nativeIndex);
            return !isStale();
          });
          if (!landed) return;

          if (prepared.mediaInfo) {
            const mediaInfo = prepared.mediaInfo;
            setState((prev) => ({
              ...prev,
              trackMediaInfoMap: {
                ...prev.trackMediaInfoMap,
                [targetId]: mediaInfo,
              },
            }));
          }
        } finally {
          // Also when the load throws, or the row keeps its spinner for good.
          setState((prev) => ({
            ...prev,
            isLoading: false,
            loadingTrackId: null,
          }));
        }
      }

      // Report stop for the track that was playing
      if (state.currentTrack && state.playSessionId) {
        reportPlaybackStopped(
          state.currentTrack,
          state.progress * 10000000,
          state.playSessionId,
        );
      }

      setState((prev) => {
        const mediaInfo = prev.trackMediaInfoMap[targetId];
        return {
          ...prev,
          queueIndex: index,
          currentTrack: targetItem,
          mediaSource: mediaInfo?.mediaSource ?? null,
          isTranscoding: mediaInfo?.isTranscoding ?? false,
        };
      });
    },
    [
      state.queue,
      state.queueIndex,
      state.currentTrack,
      state.playSessionId,
      state.progress,
      reportPlaybackStopped,
      settings?.preferLocalAudio,
      prepareTrack,
      playerReadyForControl,
    ],
  );

  // Modes
  const setRepeatMode = useCallback((mode: RepeatMode) => {
    storage.set(STORAGE_KEYS.REPEAT_MODE, mode);
    setState((prev) => ({ ...prev, repeatMode: mode }));
  }, []);

  const toggleShuffle = useCallback(() => {
    setState((prev) => {
      const newShuffleEnabled = !prev.shuffleEnabled;
      storage.set(STORAGE_KEYS.SHUFFLE_ENABLED, newShuffleEnabled);
      return applyShuffle(prev, newShuffleEnabled);
    });
  }, []);

  // Remote control: another client names the mode it wants instead of
  // toggling, so a command that repeats the current one must change nothing,
  // least of all reshuffle a queue that is already shuffled. The session is
  // one for the whole app, so a command sent while a video plays lands here
  // too. The music player leaves it alone without a track of its own, and
  // also with one while a video is on screen: a song paused in the mini
  // player is not what that remote is controlling, and reporting its modes
  // would put the song in place of the video on the server.
  useEffect(
    () =>
      subscribe("GeneralCommand", (data) => {
        const change = parsePlaybackModeCommand(data);
        if (!change || !hasLiveTrackRef.current || isVideoSessionOpen()) {
          return;
        }

        if ("repeatMode" in change) {
          setRepeatMode(change.repeatMode);
          return;
        }
        setState((prev) => {
          if (prev.shuffleEnabled === change.shuffleEnabled) return prev;
          storage.set(STORAGE_KEYS.SHUFFLE_ENABLED, change.shuffleEnabled);
          return applyShuffle(prev, change.shuffleEnabled);
        });
      }),
    [subscribe, setRepeatMode],
  );

  const setProgress = useCallback((progress: number) => {
    setState((prev) => ({ ...prev, progress }));
  }, []);

  const setDuration = useCallback((duration: number) => {
    setState((prev) => ({ ...prev, duration }));
  }, []);

  const setIsPlaying = useCallback((isPlaying: boolean) => {
    setState((prev) => ({ ...prev, isPlaying }));
  }, []);

  // Sync state from TrackPlayer (called when active track changes)
  // Uses ID-based lookup instead of index to handle queue mismatches
  const syncFromTrackPlayer = useCallback(async () => {
    if (!TrackPlayer) return;
    const activeTrack = await TrackPlayer.getActiveTrack();
    if (!activeTrack?.id) return;

    // Find track by ID, not by index - handles cases where queues have different tracks
    const trackIndex = state.queue.findIndex((t) => t.Id === activeTrack.id);
    if (trackIndex >= 0) {
      setState((prev) => ({
        ...prev,
        queueIndex: trackIndex,
        currentTrack: prev.queue[trackIndex],
      }));
    }
  }, [state.queue]);

  // Called by playback engine when track ends
  const onTrackEnd = useCallback(() => {
    if (!TrackPlayer) return;
    if (state.repeatMode === "one") {
      TrackPlayer.seekTo(0);
      TrackPlayer.play();
    }
    // For other modes, TrackPlayer handles it via repeat mode setting
  }, [state.repeatMode]);

  // Look-ahead cache: pre-cache upcoming N tracks (excludes current track to avoid bandwidth competition)
  const triggerLookahead = useCallback(async () => {
    if (!TrackPlayer) return;
    // Check if caching is enabled in settings
    if (settings?.audioLookaheadEnabled === false) return;
    if (!api || !user?.Id) return;

    try {
      const tpQueue = await TrackPlayer.getQueue();
      const currentIdx = await TrackPlayer.getActiveTrackIndex();
      if (currentIdx === undefined || currentIdx < 0) return;

      // Cache next N tracks (from settings, default 1) - excludes current to avoid bandwidth competition
      const lookaheadCount = settings?.audioLookaheadCount ?? 1;
      const tracksToCache = tpQueue.slice(
        currentIdx + 1,
        currentIdx + 1 + lookaheadCount,
      );

      const generation = sessionGenerationRef.current;

      for (const track of tracksToCache) {
        const itemId = track.id;
        // Skip if already stored locally or currently downloading
        if (!itemId || getLocalPath(itemId) || isDownloading(itemId)) continue;

        // Get stream URL for this track
        const result = await getAudioStreamUrl(api, user.Id, itemId);
        // Session switched while awaiting: caching for the old account is waste.
        if (generation !== sessionGenerationRef.current) return;

        // Only cache direct streams (not transcoding - can't cache dynamic content)
        if (result?.url && !result.isTranscoding) {
          downloadTrack(itemId, result.url, {
            permanent: false,
            container: result.mediaSource?.Container || undefined,
            headers: getJellyfinHeadersForUrl(result.url, api?.basePath),
          }).catch(() => {
            // Silent fail - caching is best-effort
          });
        }
      }
    } catch {
      // Silent fail - look-ahead caching is best-effort
    }
  }, [
    api,
    user?.Id,
    settings?.audioLookaheadEnabled,
    settings?.audioLookaheadCount,
  ]);

  // While the receiver has the queue, it is the player the screens show and
  // drive. Queue edits stay on the phone's queue.
  const remoteView = remote.view;
  const remotePlaying = remoteView?.isPlaying ?? false;
  const remoteQueue = remoteView?.queue;
  const remoteIndex = remoteView?.queueIndex;
  // Read only once stopped, where it stands still: it moves on every tick
  // while the receiver plays.
  const remoteResumeAt = remote.stopped ? (remoteView?.progress ?? 0) : 0;
  const {
    stopped: stoppedOnReceiver,
    pause: pauseRemote,
    resume: resumeOnReceiver,
    next: nextRemote,
    previous: previousRemote,
    seek: seekRemote,
    stop: stopOnReceiver,
    setRepeat: setRepeatOnReceiver,
    enqueue: enqueueOnReceiver,
  } = remote;
  // A receiver that stopped the queue plays nothing to resume: play sends the
  // queue again from where the player shows it stopped.
  const resumeRemote = useCallback(async () => {
    if (stoppedOnReceiver && remoteQueue && remoteIndex !== undefined) {
      // As for a pick in the queue: the cast settles once the receiver loads.
      void castOnReceiver(remoteQueue, remoteIndex, remoteResumeAt);
      return;
    }
    await resumeOnReceiver();
  }, [
    stoppedOnReceiver,
    remoteQueue,
    remoteIndex,
    remoteResumeAt,
    castOnReceiver,
    resumeOnReceiver,
  ]);
  // The receiver failed to start the track at its position: the queue goes
  // again from the top of that track, once, as that send starts at 0.
  const failedStartId = remote.failedStartId;
  const retriedStartId = useRef<number | null>(null);
  useEffect(() => {
    if (failedStartId === null || retriedStartId.current === failedStartId) {
      return;
    }
    if (!remoteQueue || remoteIndex === undefined) return;
    retriedStartId.current = failedStartId;
    void castOnReceiver(remoteQueue, remoteIndex);
  }, [failedStartId, remoteQueue, remoteIndex, castOnReceiver]);
  const togglePlayPauseRemote = useCallback(
    () => (remotePlaying ? pauseRemote() : resumeRemote()),
    [remotePlaying, pauseRemote, resumeRemote],
  );
  const stopRemote = useCallback(async () => {
    await stopOnReceiver();
    await stop();
  }, [stopOnReceiver, stop]);
  // The mode shows once the receiver has it: a command held back or lost
  // would leave the player showing one the receiver does not play in.
  const setRepeatModeRemote = useCallback(
    async (mode: RepeatMode) => {
      if (await setRepeatOnReceiver(mode)) setRepeatMode(mode);
    },
    [setRepeatMode, setRepeatOnReceiver],
  );
  // The receiver keeps one repeat mode for as long as its app runs, whatever
  // it is sent to play: once it plays a cast, it is told the phone's.
  const reportedQueueId = remote.reportedQueueId;
  const repeatModeRef = useRef(state.repeatMode);
  repeatModeRef.current = state.repeatMode;
  const setRepeatOnReceiverRef = useRef(setRepeatOnReceiver);
  setRepeatOnReceiverRef.current = setRepeatOnReceiver;
  useEffect(() => {
    if (reportedQueueId === null) return;
    void setRepeatOnReceiverRef.current(repeatModeRef.current);
  }, [reportedQueueId]);
  const playNextRemote = useCallback(
    (tracks: BaseItemDto | BaseItemDto[]) =>
      enqueueOnReceiver("PlayNext", Array.isArray(tracks) ? tracks : [tracks]),
    [enqueueOnReceiver],
  );
  const addToQueueRemote = useCallback(
    (tracks: BaseItemDto | BaseItemDto[]) =>
      enqueueOnReceiver("PlayLast", Array.isArray(tracks) ? tracks : [tracks]),
    [enqueueOnReceiver],
  );
  // The receiver has no command to take a track out, move one or shuffle its
  // queue: while it has the queue, those edits are left out.
  const ignoreOnReceiver = useCallback(() => {}, []);
  const jumpOnReceiver = useCallback(
    (index: number) => {
      if (!remoteQueue || index === remoteIndex) return;
      if (index < 0 || index >= remoteQueue.length) return;
      void castOnReceiver(remoteQueue, index);
    },
    [remoteQueue, remoteIndex, castOnReceiver],
  );

  const value = useMemo(
    () => ({
      ...state,
      ...(remoteView ?? {}),
      isPlayerReady,
      playTrack,
      playQueue,
      playAlbum,
      playPlaylist,
      pause: remoteView ? pauseRemote : pause,
      resume: remoteView ? resumeRemote : resume,
      togglePlayPause: remoteView ? togglePlayPauseRemote : togglePlayPause,
      next: remoteView ? nextRemote : next,
      previous: remoteView ? previousRemote : previous,
      seek: remoteView ? seekRemote : seek,
      stop: remoteView ? stopRemote : stop,
      addToQueue: remoteView ? addToQueueRemote : addToQueue,
      playNext: remoteView ? playNextRemote : playNext,
      removeFromQueue: remoteView ? ignoreOnReceiver : removeFromQueue,
      moveInQueue: remoteView ? ignoreOnReceiver : moveInQueue,
      reorderQueue: remoteView ? ignoreOnReceiver : reorderQueue,
      clearQueue: remoteView ? ignoreOnReceiver : clearQueue,
      jumpToIndex: remoteView ? jumpOnReceiver : jumpToIndex,
      canEditQueue: !remoteView,
      setRepeatMode: remoteView ? setRepeatModeRemote : setRepeatMode,
      toggleShuffle: remoteView ? ignoreOnReceiver : toggleShuffle,
      setProgress,
      setDuration,
      setIsPlaying,
      reportProgress: reportPlaybackProgress,
      onTrackEnd,
      syncFromTrackPlayer,
      triggerLookahead,
    }),
    [
      state,
      remoteView,
      isPlayerReady,
      playTrack,
      playQueue,
      playAlbum,
      playPlaylist,
      pause,
      resume,
      togglePlayPause,
      next,
      previous,
      seek,
      stop,
      pauseRemote,
      resumeRemote,
      togglePlayPauseRemote,
      nextRemote,
      previousRemote,
      seekRemote,
      stopRemote,
      addToQueue,
      playNext,
      removeFromQueue,
      moveInQueue,
      reorderQueue,
      clearQueue,
      jumpToIndex,
      jumpOnReceiver,
      setRepeatMode,
      setRepeatModeRemote,
      toggleShuffle,
      addToQueueRemote,
      playNextRemote,
      ignoreOnReceiver,
      setProgress,
      setDuration,
      setIsPlaying,
      reportPlaybackProgress,
      onTrackEnd,
      syncFromTrackPlayer,
      triggerLookahead,
    ],
  );

  return (
    <MusicPlayerContext.Provider value={value}>
      {children}
    </MusicPlayerContext.Provider>
  );
};

// Export the appropriate provider based on platform
export const MusicPlayerProvider: React.FC<MusicPlayerProviderProps> =
  Platform.isTV ? TVMusicPlayerProvider : MobileMusicPlayerProvider;

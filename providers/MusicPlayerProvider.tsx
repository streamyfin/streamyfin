import type { Api } from "@jellyfin/sdk";
import type {
  BaseItemDto,
  MediaSourceInfo,
} from "@jellyfin/sdk/lib/generated-client/models";
import { getPlaystateApi } from "@jellyfin/sdk/lib/utils/api";
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
import TrackPlayer, {
  Capability,
  type Progress,
  RepeatMode as TPRepeatMode,
  type Track,
} from "react-native-track-player";
import {
  downloadTrack,
  getLocalPath,
  initAudioStorage,
  isDownloading,
  setMaxCacheSizeMB,
} from "@/providers/AudioStorage";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { useNetworkStatus } from "@/providers/NetworkStatusProvider";
import { settingsAtom } from "@/utils/atoms/settings";
import { getAudioStreamUrl } from "@/utils/jellyfin/audio/getAudioStreamUrl";
import { storage } from "@/utils/mmkv";

// Storage keys
const STORAGE_KEYS = {
  QUEUE: "music_player_queue",
  QUEUE_INDEX: "music_player_queue_index",
  REPEAT_MODE: "music_player_repeat_mode",
  SHUFFLE_ENABLED: "music_player_shuffle_enabled",
  CURRENT_PROGRESS: "music_player_progress",
} as const;

export type RepeatMode = "off" | "all" | "one";

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

// Persistence helpers
const saveQueueToStorage = (queue: BaseItemDto[], queueIndex: number) => {
  try {
    storage.set(STORAGE_KEYS.QUEUE, JSON.stringify(queue));
    storage.set(STORAGE_KEYS.QUEUE_INDEX, queueIndex.toString());
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
    startIndex: newStartIndex >= 0 ? newStartIndex : 0,
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

  // Check if track is cached locally (permanent downloads take precedence)
  // getLocalPath returns full file:// URI if cached, null otherwise
  const cachedUrl = preferLocalAudio ? getLocalPath(item.Id) : null;
  const finalUrl = cachedUrl || url;

  if (cachedUrl) {
    console.log(
      `[MusicPlayer] Using cached file for ${item.Name}: ${cachedUrl}`,
    );
  }

  return {
    id: item.Id || "",
    url: finalUrl,
    title: item.Name || "Unknown",
    artist: item.Artists?.join(", ") || item.AlbumArtist || "Unknown Artist",
    album: item.Album || undefined,
    artwork,
    duration: item.RunTimeTicks ? item.RunTimeTicks / 10000000 : undefined,
  };
};

export const MusicPlayerProvider: React.FC<MusicPlayerProviderProps> = ({
  children,
}) => {
  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);
  const settings = useAtomValue(settingsAtom);
  const { isConnected, serverConnected } = useNetworkStatus();
  const isOffline = !isConnected || serverConnected === false;
  const initializedRef = useRef(false);
  const playerSetupRef = useRef(false);

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

  const lastReportRef = useRef<number>(0);

  // Setup TrackPlayer and AudioStorage
  useEffect(() => {
    const setupPlayer = async () => {
      if (playerSetupRef.current) return;

      try {
        // Initialize audio storage for caching
        await initAudioStorage();

        await TrackPlayer.setupPlayer({
          minBuffer: 120, // Minimum 2 minutes buffer for network resilience
          maxBuffer: 240, // Maximum 4 minutes buffer
          playBuffer: 5, // Start playback after 5 seconds buffered
          backBuffer: 30, // Keep 30 seconds behind for seeking
        });
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
        playerSetupRef.current = true;
      } catch (_error) {
        // Player might already be set up
        playerSetupRef.current = true;
      }
    };

    setupPlayer();
  }, []);

  // Update audio cache size when settings change
  useEffect(() => {
    if (settings?.audioMaxCacheSizeMB) {
      setMaxCacheSizeMB(settings.audioMaxCacheSizeMB);
    }
  }, [settings?.audioMaxCacheSizeMB]);

  // Sync repeat mode to TrackPlayer
  useEffect(() => {
    const syncRepeatMode = async () => {
      if (!playerSetupRef.current) return;

      let tpRepeatMode: TPRepeatMode;
      switch (state.repeatMode) {
        case "one":
          tpRepeatMode = TPRepeatMode.Track;
          break;
        case "all":
          tpRepeatMode = TPRepeatMode.Queue;
          break;
        default:
          tpRepeatMode = TPRepeatMode.Off;
      }
      await TrackPlayer.setRepeatMode(tpRepeatMode);
    };

    syncRepeatMode();
  }, [state.repeatMode]);

  // Restore queue on mount (when api is available)
  useEffect(() => {
    if (!api || !user?.Id || initializedRef.current) return;
    initializedRef.current = true;

    const saved = loadQueueFromStorage();
    if (saved && saved.queue.length > 0) {
      const currentTrack = saved.queue[saved.queueIndex];
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
    }
  }, [api, user?.Id]);

  // Save queue whenever it changes
  useEffect(() => {
    if (state.queue.length > 0) {
      saveQueueToStorage(state.queue, state.queueIndex);
    }
  }, [state.queue, state.queueIndex]);

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
        await getPlaystateApi(api).reportPlaybackStart({
          playbackStartInfo: {
            ItemId: track.Id,
            PlaySessionId: sessionId || undefined,
            CanSeek: true,
            IsPaused: false,
            IsMuted: false,
            VolumeLevel: 100,
            PlayMethod: "DirectStream",
          },
        });
      } catch {
        // Silently fail
      }
    },
    [api, user?.Id],
  );

  const reportPlaybackProgress = useCallback(async () => {
    if (!api || !user?.Id || !state.currentTrack?.Id) return;

    const now = Date.now();
    if (now - lastReportRef.current < 10000) return;
    lastReportRef.current = now;

    try {
      await getPlaystateApi(api).reportPlaybackProgress({
        playbackProgressInfo: {
          ItemId: state.currentTrack.Id,
          PlaySessionId: state.playSessionId || undefined,
          PositionTicks: Math.floor(state.progress * 10000000),
          CanSeek: true,
          IsPaused: !state.isPlaying,
          IsMuted: false,
          VolumeLevel: 100,
          PlayMethod: "DirectStream",
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

  const reportPlaybackStopped = useCallback(
    async (
      track: BaseItemDto,
      positionTicks: number,
      sessionId: string | null,
    ) => {
      if (!api || !user?.Id || !track.Id) return;

      try {
        await getPlaystateApi(api).reportPlaybackStopped({
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
      if (!api || !user?.Id) return;

      const mediaInfoMap: Record<string, TrackMediaInfo> = {};
      const failedItemIds: string[] = []; // Track items that failed to prepare

      // Process tracks BEFORE the start index (insert at position 0, pushing current track forward)
      const beforeTracks: Track[] = [];
      const beforeSuccessIds: string[] = []; // Track successful IDs to maintain order
      for (let i = 0; i < startIndex; i++) {
        const item = queue[i];
        if (!item.Id) continue;

        const prepared = await prepareTrack(item, preferLocal);
        if (prepared) {
          beforeTracks.push(prepared.track);
          beforeSuccessIds.push(item.Id);
          if (prepared.mediaInfo) {
            mediaInfoMap[item.Id] = prepared.mediaInfo;
          }
        } else {
          failedItemIds.push(item.Id);
        }
      }

      // Insert tracks before current track (they go at index 0)
      if (beforeTracks.length > 0) {
        await TrackPlayer.add(beforeTracks, 0);
        // Update queue index since we inserted tracks before the current one
        setState((prev) => ({
          ...prev,
          queueIndex: beforeTracks.length,
          trackMediaInfoMap: { ...prev.trackMediaInfoMap, ...mediaInfoMap },
        }));
      }

      // Process tracks AFTER the start index (append to end)
      for (let i = startIndex + 1; i < queue.length; i++) {
        const item = queue[i];
        if (!item.Id) continue;

        const prepared = await prepareTrack(item, preferLocal);
        if (prepared) {
          await TrackPlayer.add(prepared.track); // Append to end
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
      if (failedItemIds.length > 0) {
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
      if (!api || !user?.Id || queue.length === 0) return;

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
      setState((prev) => ({
        ...prev,
        isLoading: true,
        loadingTrackId: targetItem?.Id ?? null,
      }));

      try {
        // PHASE 1: Prepare and play the target track immediately
        const targetTrackResult = await prepareTrack(targetItem, preferLocal);

        if (!targetTrackResult) {
          setState((prev) => ({
            ...prev,
            isLoading: false,
            loadingTrackId: null,
          }));
          return;
        }

        // Reset and start playback immediately with just the target track
        await TrackPlayer.reset();
        await TrackPlayer.add(targetTrackResult.track);
        await TrackPlayer.play();

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
        console.error("[MusicPlayer] Error loading queue:", error);
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
    ],
  );

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
      loadAndPlayQueue(newQueue, queueIndex >= 0 ? queueIndex : 0);
    },
    [
      state.currentTrack,
      state.playSessionId,
      state.progress,
      reportPlaybackStopped,
      loadAndPlayQueue,
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
    ],
  );

  const playAlbum = useCallback(
    async (albumId: string, startIndex = 0) => {
      if (!api || !user?.Id) return;

      try {
        const { getItemsApi } = await import("@jellyfin/sdk/lib/utils/api");
        const response = await getItemsApi(api).getItems({
          userId: user.Id,
          parentId: albumId,
          sortBy: ["IndexNumber"],
          sortOrder: ["Ascending"],
        });

        const tracks = response.data.Items || [];
        if (tracks.length > 0) {
          playQueue(tracks, startIndex);
        }
      } catch {
        // Silently fail
      }
    },
    [api, user?.Id, playQueue],
  );

  const playPlaylist = useCallback(
    async (playlistId: string, startIndex = 0) => {
      if (!api || !user?.Id) return;

      try {
        const { getItemsApi } = await import("@jellyfin/sdk/lib/utils/api");
        const response = await getItemsApi(api).getItems({
          userId: user.Id,
          parentId: playlistId,
          sortBy: ["SortName"],
          sortOrder: ["Ascending"],
        });

        const tracks = response.data.Items || [];
        if (tracks.length > 0) {
          playQueue(tracks, startIndex);
        }
      } catch {
        // Silently fail
      }
    },
    [api, user?.Id, playQueue],
  );

  const pause = useCallback(async () => {
    await TrackPlayer.pause();
    setState((prev) => ({ ...prev, isPlaying: false }));
  }, []);

  const resume = useCallback(async () => {
    if (!state.streamUrl && state.currentTrack && api && user?.Id) {
      // Need to load the track first (e.g., after app restart)
      const result = await getAudioStreamUrl(
        api,
        user.Id,
        state.currentTrack.Id!,
      );
      if (result) {
        const preferLocal = settings?.preferLocalAudio ?? true;
        await TrackPlayer.reset();
        await TrackPlayer.add(
          itemToTrack(state.currentTrack, result.url, api, preferLocal),
        );
        await TrackPlayer.seekTo(state.progress);
        await TrackPlayer.play();
        setState((prev) => ({
          ...prev,
          streamUrl: result.url,
          playSessionId: result.sessionId,
          isPlaying: true,
        }));
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
    state.progress,
    settings?.preferLocalAudio,
  ]);

  const togglePlayPause = useCallback(async () => {
    if (state.isPlaying) {
      await pause();
    } else {
      await resume();
    }
  }, [state.isPlaying, pause, resume]);

  const next = useCallback(async () => {
    const currentIndex = await TrackPlayer.getActiveTrackIndex();
    const queueLength = (await TrackPlayer.getQueue()).length;

    if (currentIndex !== undefined && currentIndex < queueLength - 1) {
      if (state.currentTrack && state.playSessionId) {
        reportPlaybackStopped(
          state.currentTrack,
          state.progress * 10000000,
          state.playSessionId,
        );
      }
      await TrackPlayer.skipToNext();
      const newIndex = currentIndex + 1;
      setState((prev) => {
        const nextTrack = prev.queue[newIndex];
        const mediaInfo = nextTrack?.Id
          ? prev.trackMediaInfoMap[nextTrack.Id]
          : null;
        return {
          ...prev,
          queueIndex: newIndex,
          currentTrack: nextTrack,
          mediaSource: mediaInfo?.mediaSource ?? null,
          isTranscoding: mediaInfo?.isTranscoding ?? false,
        };
      });
    } else if (state.repeatMode === "all" && state.queue.length > 0) {
      if (state.currentTrack && state.playSessionId) {
        reportPlaybackStopped(
          state.currentTrack,
          state.progress * 10000000,
          state.playSessionId,
        );
      }
      await TrackPlayer.skip(0);
      setState((prev) => {
        const firstTrack = prev.queue[0];
        const mediaInfo = firstTrack?.Id
          ? prev.trackMediaInfoMap[firstTrack.Id]
          : null;
        return {
          ...prev,
          queueIndex: 0,
          currentTrack: firstTrack,
          mediaSource: mediaInfo?.mediaSource ?? null,
          isTranscoding: mediaInfo?.isTranscoding ?? false,
        };
      });
    }
  }, [
    state.queue,
    state.currentTrack,
    state.playSessionId,
    state.progress,
    state.repeatMode,
    reportPlaybackStopped,
  ]);

  const previous = useCallback(async () => {
    const position = await TrackPlayer.getProgress().then(
      (p: Progress) => p.position,
    );

    if (position > 3) {
      await TrackPlayer.seekTo(0);
      setState((prev) => ({ ...prev, progress: 0 }));
      return;
    }

    const currentIndex = await TrackPlayer.getActiveTrackIndex();

    if (currentIndex !== undefined && currentIndex > 0) {
      if (state.currentTrack && state.playSessionId) {
        reportPlaybackStopped(
          state.currentTrack,
          state.progress * 10000000,
          state.playSessionId,
        );
      }
      await TrackPlayer.skipToPrevious();
      const newIndex = currentIndex - 1;
      setState((prev) => {
        const prevTrack = prev.queue[newIndex];
        const mediaInfo = prevTrack?.Id
          ? prev.trackMediaInfoMap[prevTrack.Id]
          : null;
        return {
          ...prev,
          queueIndex: newIndex,
          currentTrack: prevTrack,
          mediaSource: mediaInfo?.mediaSource ?? null,
          isTranscoding: mediaInfo?.isTranscoding ?? false,
        };
      });
    } else if (state.repeatMode === "all" && state.queue.length > 0) {
      const lastIndex = state.queue.length - 1;
      if (state.currentTrack && state.playSessionId) {
        reportPlaybackStopped(
          state.currentTrack,
          state.progress * 10000000,
          state.playSessionId,
        );
      }
      await TrackPlayer.skip(lastIndex);
      setState((prev) => {
        const lastTrack = prev.queue[lastIndex];
        const mediaInfo = lastTrack?.Id
          ? prev.trackMediaInfoMap[lastTrack.Id]
          : null;
        return {
          ...prev,
          queueIndex: lastIndex,
          currentTrack: lastTrack,
          mediaSource: mediaInfo?.mediaSource ?? null,
          isTranscoding: mediaInfo?.isTranscoding ?? false,
        };
      });
    }
  }, [
    state.queue,
    state.currentTrack,
    state.playSessionId,
    state.progress,
    state.repeatMode,
    reportPlaybackStopped,
  ]);

  const seek = useCallback(async (position: number) => {
    await TrackPlayer.seekTo(position);
    setState((prev) => ({ ...prev, progress: position }));
  }, []);

  const stop = useCallback(async () => {
    if (state.currentTrack && state.playSessionId) {
      reportPlaybackStopped(
        state.currentTrack,
        state.progress * 10000000,
        state.playSessionId,
      );
    }

    await TrackPlayer.reset();

    // Clear storage
    try {
      storage.remove(STORAGE_KEYS.QUEUE);
      storage.remove(STORAGE_KEYS.QUEUE_INDEX);
      storage.remove(STORAGE_KEYS.CURRENT_PROGRESS);
    } catch {
      // Silently fail
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
      if (!api || !user?.Id) return;

      const tracksArray = Array.isArray(tracks) ? tracks : [tracks];
      const preferLocal = settings?.preferLocalAudio ?? true;

      // Add to TrackPlayer queue
      for (const item of tracksArray) {
        if (!item.Id) continue;
        const cachedUrl = getLocalPath(item.Id);
        const result = await getAudioStreamUrl(api, user.Id, item.Id);
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

      setState((prev) => ({
        ...prev,
        queue: [...prev.queue, ...tracksArray],
        originalQueue: [...prev.originalQueue, ...tracksArray],
      }));
    },
    [api, user?.Id, settings?.preferLocalAudio],
  );

  const playNext = useCallback(
    async (tracks: BaseItemDto | BaseItemDto[]) => {
      if (!api || !user?.Id) return;

      const tracksArray = Array.isArray(tracks) ? tracks : [tracks];
      const currentIndex = await TrackPlayer.getActiveTrackIndex();
      const insertIndex = (currentIndex ?? -1) + 1;
      const preferLocal = settings?.preferLocalAudio ?? true;

      // Add to TrackPlayer queue after current track
      for (let i = tracksArray.length - 1; i >= 0; i--) {
        const item = tracksArray[i];
        if (!item.Id) continue;
        const cachedUrl = getLocalPath(item.Id);
        const result = await getAudioStreamUrl(api, user.Id, item.Id);
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
    [api, user?.Id, settings?.preferLocalAudio],
  );

  const removeFromQueue = useCallback(async (index: number) => {
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
  }, []);

  const moveInQueue = useCallback(
    async (fromIndex: number, toIndex: number) => {
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
    [],
  );

  // Reorder queue with a new array (used by drag-to-reorder UI)
  const reorderQueue = useCallback(
    async (newQueue: BaseItemDto[]) => {
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
      tpQueue.forEach((track, idx) => {
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
        queueIndex: newIndex >= 0 ? newIndex : 0,
        currentTrack: newIndex >= 0 ? newQueue[newIndex] : prev.currentTrack,
      }));
    },
    [state.currentTrack?.Id],
  );

  const clearQueue = useCallback(async () => {
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
  }, []);

  const jumpToIndex = useCallback(
    async (index: number) => {
      if (
        index < 0 ||
        index >= state.queue.length ||
        index === state.queueIndex
      )
        return;

      // Check if the track exists in TrackPlayer queue (might not be loaded yet due to background loading)
      const tpQueue = await TrackPlayer.getQueue();
      const targetItem = state.queue[index];

      if (index >= tpQueue.length) {
        // Track not loaded yet - need to load it first
        if (!targetItem) return;

        setState((prev) => ({
          ...prev,
          isLoading: true,
          loadingTrackId: targetItem?.Id ?? null,
        }));

        const preferLocal = settings?.preferLocalAudio ?? true;
        const prepared = await prepareTrack(targetItem, preferLocal);

        if (!prepared) {
          setState((prev) => ({
            ...prev,
            isLoading: false,
            loadingTrackId: null,
          }));
          return;
        }

        // Add the track at the correct position
        await TrackPlayer.add(prepared.track, index);
        setState((prev) => ({
          ...prev,
          isLoading: false,
          loadingTrackId: null,
          ...(prepared.mediaInfo && targetItem.Id
            ? {
                trackMediaInfoMap: {
                  ...prev.trackMediaInfoMap,
                  [targetItem.Id]: prepared.mediaInfo,
                },
              }
            : {}),
        }));
      }

      // Report stop for current track
      if (state.currentTrack && state.playSessionId) {
        reportPlaybackStopped(
          state.currentTrack,
          state.progress * 10000000,
          state.playSessionId,
        );
      }

      await TrackPlayer.skip(index);

      setState((prev) => {
        const mediaInfo = targetItem?.Id
          ? prev.trackMediaInfoMap[targetItem.Id]
          : null;
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

      if (newShuffleEnabled) {
        const shuffled = shuffleArray(prev.queue, prev.queueIndex);
        return {
          ...prev,
          shuffleEnabled: true,
          queue: shuffled,
          queueIndex: 0,
        };
      } else {
        const currentTrackId = prev.currentTrack?.Id;
        const newIndex = prev.originalQueue.findIndex(
          (t) => t.Id === currentTrackId,
        );
        return {
          ...prev,
          shuffleEnabled: false,
          queue: prev.originalQueue,
          queueIndex: newIndex >= 0 ? newIndex : 0,
        };
      }
    });
  }, []);

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
    if (state.repeatMode === "one") {
      TrackPlayer.seekTo(0);
      TrackPlayer.play();
    }
    // For other modes, TrackPlayer handles it via repeat mode setting
  }, [state.repeatMode]);

  // Look-ahead cache: pre-cache upcoming N tracks (excludes current track to avoid bandwidth competition)
  const triggerLookahead = useCallback(async () => {
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

      for (const track of tracksToCache) {
        const itemId = track.id;
        // Skip if already stored locally or currently downloading
        if (!itemId || getLocalPath(itemId) || isDownloading(itemId)) continue;

        // Get stream URL for this track
        const result = await getAudioStreamUrl(api, user.Id, itemId);

        // Only cache direct streams (not transcoding - can't cache dynamic content)
        if (result?.url && !result.isTranscoding) {
          downloadTrack(itemId, result.url, {
            permanent: false,
            container: result.mediaSource?.Container || undefined,
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

  const value = useMemo(
    () => ({
      ...state,
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
      addToQueue,
      playNext,
      removeFromQueue,
      moveInQueue,
      reorderQueue,
      clearQueue,
      jumpToIndex,
      setRepeatMode,
      toggleShuffle,
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
      addToQueue,
      playNext,
      removeFromQueue,
      moveInQueue,
      reorderQueue,
      clearQueue,
      jumpToIndex,
      setRepeatMode,
      toggleShuffle,
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

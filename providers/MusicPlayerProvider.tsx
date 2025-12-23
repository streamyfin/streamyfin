import type { Api } from "@jellyfin/sdk";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { getMediaInfoApi, getPlaystateApi } from "@jellyfin/sdk/lib/utils/api";
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
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { storage } from "@/utils/mmkv";
import native from "@/utils/profiles/native";

// Storage keys
const STORAGE_KEYS = {
  QUEUE: "music_player_queue",
  QUEUE_INDEX: "music_player_queue_index",
  REPEAT_MODE: "music_player_repeat_mode",
  SHUFFLE_ENABLED: "music_player_shuffle_enabled",
  CURRENT_PROGRESS: "music_player_progress",
} as const;

export type RepeatMode = "off" | "all" | "one";

interface MusicPlayerState {
  currentTrack: BaseItemDto | null;
  queue: BaseItemDto[];
  originalQueue: BaseItemDto[]; // Original order before shuffle
  queueIndex: number;
  isPlaying: boolean;
  isLoading: boolean;
  progress: number;
  duration: number;
  streamUrl: string | null;
  playSessionId: string | null;
  repeatMode: RepeatMode;
  shuffleEnabled: boolean;
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

const getAudioStreamUrl = async (
  api: Api,
  userId: string,
  itemId: string,
): Promise<{ url: string; sessionId: string | null } | null> => {
  try {
    const res = await getMediaInfoApi(api).getPlaybackInfo(
      { itemId },
      {
        method: "POST",
        data: {
          userId,
          deviceProfile: native,
          startTimeTicks: 0,
          isPlayback: true,
          autoOpenLiveStream: true,
        },
      },
    );

    const sessionId = res.data.PlaySessionId || null;
    const mediaSource = res.data.MediaSources?.[0];

    if (mediaSource?.TranscodingUrl) {
      return {
        url: `${api.basePath}${mediaSource.TranscodingUrl}`,
        sessionId,
      };
    }

    // Direct stream
    const streamParams = new URLSearchParams({
      static: "true",
      container: mediaSource?.Container || "mp3",
      mediaSourceId: mediaSource?.Id || "",
      deviceId: api.deviceInfo.id,
      api_key: api.accessToken,
      userId,
    });

    return {
      url: `${api.basePath}/Audio/${itemId}/stream?${streamParams.toString()}`,
      sessionId,
    };
  } catch {
    return null;
  }
};

export const MusicPlayerProvider: React.FC<MusicPlayerProviderProps> = ({
  children,
}) => {
  const api = useAtomValue(apiAtom);
  const user = useAtomValue(userAtom);
  const initializedRef = useRef(false);

  const [state, setState] = useState<MusicPlayerState>({
    currentTrack: null,
    queue: [],
    originalQueue: [],
    queueIndex: 0,
    isPlaying: false,
    isLoading: false,
    progress: 0,
    duration: 0,
    streamUrl: null,
    playSessionId: null,
    repeatMode: loadRepeatMode(),
    shuffleEnabled: loadShuffleEnabled(),
  });

  const lastReportRef = useRef<number>(0);

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

  const loadTrack = useCallback(
    async (track: BaseItemDto, startProgress = 0) => {
      if (!api || !user?.Id || !track.Id) return;

      setState((prev) => ({ ...prev, isLoading: true }));

      const result = await getAudioStreamUrl(api, user.Id, track.Id);

      if (!result) {
        setState((prev) => ({ ...prev, isLoading: false }));
        return;
      }

      const durationSeconds = track.RunTimeTicks
        ? Math.floor(track.RunTimeTicks / 10000000)
        : 0;

      setState((prev) => ({
        ...prev,
        currentTrack: track,
        streamUrl: result.url,
        playSessionId: result.sessionId,
        isLoading: false,
        isPlaying: true,
        progress: startProgress,
        duration: durationSeconds,
      }));

      reportPlaybackStart(track, result.sessionId);
    },
    [api, user?.Id, reportPlaybackStart],
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

      setState((prev) => ({
        ...prev,
        queue: newQueue,
        originalQueue: newQueue,
        queueIndex: queueIndex >= 0 ? queueIndex : 0,
      }));

      loadTrack(track);
    },
    [
      state.currentTrack,
      state.playSessionId,
      state.progress,
      reportPlaybackStopped,
      loadTrack,
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

      // Apply shuffle if enabled
      if (state.shuffleEnabled) {
        finalQueue = shuffleArray(queue, startIndex);
        finalIndex = 0;
      }

      setState((prev) => ({
        ...prev,
        queue: finalQueue,
        originalQueue: queue,
        queueIndex: finalIndex,
      }));

      loadTrack(finalQueue[finalIndex]);
    },
    [
      state.currentTrack,
      state.playSessionId,
      state.progress,
      state.shuffleEnabled,
      reportPlaybackStopped,
      loadTrack,
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

  const pause = useCallback(() => {
    setState((prev) => ({ ...prev, isPlaying: false }));
  }, []);

  const resume = useCallback(() => {
    if (!state.streamUrl && state.currentTrack) {
      // Need to load the track first (e.g., after app restart)
      loadTrack(state.currentTrack, state.progress);
    } else {
      setState((prev) => ({ ...prev, isPlaying: true }));
    }
  }, [state.streamUrl, state.currentTrack, state.progress, loadTrack]);

  const togglePlayPause = useCallback(() => {
    if (!state.isPlaying && !state.streamUrl && state.currentTrack) {
      loadTrack(state.currentTrack, state.progress);
    } else {
      setState((prev) => ({ ...prev, isPlaying: !prev.isPlaying }));
    }
  }, [
    state.isPlaying,
    state.streamUrl,
    state.currentTrack,
    state.progress,
    loadTrack,
  ]);

  const next = useCallback(() => {
    const nextIndex = state.queueIndex + 1;

    if (nextIndex < state.queue.length) {
      if (state.currentTrack && state.playSessionId) {
        reportPlaybackStopped(
          state.currentTrack,
          state.progress * 10000000,
          state.playSessionId,
        );
      }
      setState((prev) => ({ ...prev, queueIndex: nextIndex }));
      loadTrack(state.queue[nextIndex]);
    } else if (state.repeatMode === "all" && state.queue.length > 0) {
      // Loop back to start
      if (state.currentTrack && state.playSessionId) {
        reportPlaybackStopped(
          state.currentTrack,
          state.progress * 10000000,
          state.playSessionId,
        );
      }
      setState((prev) => ({ ...prev, queueIndex: 0 }));
      loadTrack(state.queue[0]);
    }
  }, [
    state.queue,
    state.queueIndex,
    state.currentTrack,
    state.playSessionId,
    state.progress,
    state.repeatMode,
    loadTrack,
    reportPlaybackStopped,
  ]);

  const previous = useCallback(() => {
    if (state.progress > 3) {
      setState((prev) => ({ ...prev, progress: 0 }));
      return;
    }

    const prevIndex = state.queueIndex - 1;
    if (prevIndex >= 0) {
      if (state.currentTrack && state.playSessionId) {
        reportPlaybackStopped(
          state.currentTrack,
          state.progress * 10000000,
          state.playSessionId,
        );
      }
      setState((prev) => ({ ...prev, queueIndex: prevIndex }));
      loadTrack(state.queue[prevIndex]);
    } else if (state.repeatMode === "all" && state.queue.length > 0) {
      // Loop to end
      const lastIndex = state.queue.length - 1;
      if (state.currentTrack && state.playSessionId) {
        reportPlaybackStopped(
          state.currentTrack,
          state.progress * 10000000,
          state.playSessionId,
        );
      }
      setState((prev) => ({ ...prev, queueIndex: lastIndex }));
      loadTrack(state.queue[lastIndex]);
    }
  }, [
    state.queue,
    state.queueIndex,
    state.progress,
    state.currentTrack,
    state.playSessionId,
    state.repeatMode,
    loadTrack,
    reportPlaybackStopped,
  ]);

  const seek = useCallback((position: number) => {
    setState((prev) => ({ ...prev, progress: position }));
  }, []);

  const stop = useCallback(() => {
    if (state.currentTrack && state.playSessionId) {
      reportPlaybackStopped(
        state.currentTrack,
        state.progress * 10000000,
        state.playSessionId,
      );
    }

    // Clear storage
    try {
      storage.delete(STORAGE_KEYS.QUEUE);
      storage.delete(STORAGE_KEYS.QUEUE_INDEX);
      storage.delete(STORAGE_KEYS.CURRENT_PROGRESS);
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
      progress: 0,
      duration: 0,
      streamUrl: null,
      playSessionId: null,
      repeatMode: state.repeatMode,
      shuffleEnabled: state.shuffleEnabled,
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
  const addToQueue = useCallback((tracks: BaseItemDto | BaseItemDto[]) => {
    const tracksArray = Array.isArray(tracks) ? tracks : [tracks];
    setState((prev) => ({
      ...prev,
      queue: [...prev.queue, ...tracksArray],
      originalQueue: [...prev.originalQueue, ...tracksArray],
    }));
  }, []);

  const playNext = useCallback((tracks: BaseItemDto | BaseItemDto[]) => {
    const tracksArray = Array.isArray(tracks) ? tracks : [tracks];
    setState((prev) => {
      const insertIndex = prev.queueIndex + 1;
      const newQueue = [...prev.queue];
      const newOriginalQueue = [...prev.originalQueue];

      newQueue.splice(insertIndex, 0, ...tracksArray);
      newOriginalQueue.splice(insertIndex, 0, ...tracksArray);

      return {
        ...prev,
        queue: newQueue,
        originalQueue: newOriginalQueue,
      };
    });
  }, []);

  const removeFromQueue = useCallback((index: number) => {
    setState((prev) => {
      if (index < 0 || index >= prev.queue.length) return prev;
      if (index === prev.queueIndex) return prev; // Can't remove currently playing

      const newQueue = [...prev.queue];
      const removedTrack = newQueue.splice(index, 1)[0];

      const newOriginalQueue = prev.originalQueue.filter(
        (t) => t.Id !== removedTrack.Id,
      );

      // Adjust index if removed track was before current
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

  const moveInQueue = useCallback((fromIndex: number, toIndex: number) => {
    setState((prev) => {
      if (
        fromIndex < 0 ||
        fromIndex >= prev.queue.length ||
        toIndex < 0 ||
        toIndex >= prev.queue.length ||
        fromIndex === toIndex
      ) {
        return prev;
      }

      const newQueue = [...prev.queue];
      const [movedItem] = newQueue.splice(fromIndex, 1);
      newQueue.splice(toIndex, 0, movedItem);

      // Adjust current index
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
  }, []);

  const clearQueue = useCallback(() => {
    setState((prev) => {
      if (!prev.currentTrack) return prev;

      // Keep only the current track
      return {
        ...prev,
        queue: [prev.currentTrack],
        originalQueue: [prev.currentTrack],
        queueIndex: 0,
      };
    });
  }, []);

  const jumpToIndex = useCallback(
    (index: number) => {
      if (
        index < 0 ||
        index >= state.queue.length ||
        index === state.queueIndex
      )
        return;

      if (state.currentTrack && state.playSessionId) {
        reportPlaybackStopped(
          state.currentTrack,
          state.progress * 10000000,
          state.playSessionId,
        );
      }

      setState((prev) => ({ ...prev, queueIndex: index }));
      loadTrack(state.queue[index]);
    },
    [
      state.queue,
      state.queueIndex,
      state.currentTrack,
      state.playSessionId,
      state.progress,
      loadTrack,
      reportPlaybackStopped,
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
        // Shuffle the queue, keeping current track at position 0
        const shuffled = shuffleArray(prev.queue, prev.queueIndex);
        return {
          ...prev,
          shuffleEnabled: true,
          queue: shuffled,
          queueIndex: 0,
        };
      } else {
        // Restore original order
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

  // Called by playback engine when track ends
  const onTrackEnd = useCallback(() => {
    if (state.repeatMode === "one") {
      // Repeat the current track
      setState((prev) => ({ ...prev, progress: 0 }));
      if (state.currentTrack) {
        loadTrack(state.currentTrack);
      }
    } else {
      next();
    }
  }, [state.repeatMode, state.currentTrack, loadTrack, next]);

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
      clearQueue,
      jumpToIndex,
      setRepeatMode,
      toggleShuffle,
      setProgress,
      setDuration,
      setIsPlaying,
      reportProgress: reportPlaybackProgress,
      onTrackEnd,
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
      clearQueue,
      jumpToIndex,
      setRepeatMode,
      toggleShuffle,
      setProgress,
      setDuration,
      setIsPlaying,
      reportPlaybackProgress,
      onTrackEnd,
    ],
  );

  return (
    <MusicPlayerContext.Provider value={value}>
      {children}
    </MusicPlayerContext.Provider>
  );
};

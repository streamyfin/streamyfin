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
} from "@/providers/AudioStorage";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
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

        await TrackPlayer.setupPlayer();
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

  const loadAndPlayQueue = useCallback(
    async (queue: BaseItemDto[], startIndex: number) => {
      if (!api || !user?.Id || queue.length === 0) return;

      const trackToLoad = queue[startIndex];
      setState((prev) => ({
        ...prev,
        isLoading: true,
        loadingTrackId: trackToLoad?.Id ?? null,
      }));

      try {
        // Get stream URLs for all tracks
        const tracks: Track[] = [];
        const mediaInfoMap: Record<string, TrackMediaInfo> = {};
        let startTrackMediaSource: MediaSourceInfo | null = null;
        let startTrackIsTranscoding = false;

        const preferLocal = settings?.preferLocalAudio ?? true;

        for (let i = 0; i < queue.length; i++) {
          const item = queue[i];
          if (!item.Id) continue;

          // First check for cached version (for offline fallback)
          const cachedUrl = getLocalPath(item.Id);

          // Try to get stream URL from server
          const result = await getAudioStreamUrl(api, user.Id, item.Id);

          if (result) {
            tracks.push(itemToTrack(item, result.url, api, preferLocal));
            // Store media info for all tracks
            mediaInfoMap[item.Id] = {
              mediaSource: result.mediaSource,
              isTranscoding: result.isTranscoding,
            };
            // Store first track's session ID
            if (tracks.length === 1) {
              setState((prev) => ({
                ...prev,
                playSessionId: result.sessionId,
              }));
            }
            // Store media source info for the starting track
            if (i === startIndex) {
              startTrackMediaSource = result.mediaSource;
              startTrackIsTranscoding = result.isTranscoding;
            }
          } else if (cachedUrl) {
            // Fallback to cached version if server is unreachable
            console.log(
              `[MusicPlayer] Using cached file (offline) for ${item.Name}: ${cachedUrl}`,
            );
            tracks.push(itemToTrack(item, cachedUrl, api, true));
          }
        }

        if (tracks.length === 0) {
          setState((prev) => ({
            ...prev,
            isLoading: false,
            loadingTrackId: null,
          }));
          return;
        }

        // Reset TrackPlayer and add new queue
        await TrackPlayer.reset();
        await TrackPlayer.add(tracks);
        await TrackPlayer.skip(startIndex);
        await TrackPlayer.play();

        const currentTrack = queue[startIndex];
        setState((prev) => ({
          ...prev,
          queue,
          originalQueue: queue,
          queueIndex: startIndex,
          currentTrack,
          isLoading: false,
          loadingTrackId: null,
          isPlaying: true,
          streamUrl: tracks[startIndex]?.url || null,
          duration: currentTrack?.RunTimeTicks
            ? Math.floor(currentTrack.RunTimeTicks / 10000000)
            : 0,
          mediaSource: startTrackMediaSource,
          isTranscoding: startTrackIsTranscoding,
          trackMediaInfoMap: mediaInfoMap,
        }));

        reportPlaybackStart(currentTrack, state.playSessionId);
      } catch (_error) {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          loadingTrackId: null,
        }));
      }
    },
    [api, user?.Id, reportPlaybackStart, state.playSessionId],
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

      // Apply shuffle if enabled
      if (state.shuffleEnabled) {
        finalQueue = shuffleArray(queue, startIndex);
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

      if (state.currentTrack && state.playSessionId) {
        reportPlaybackStopped(
          state.currentTrack,
          state.progress * 10000000,
          state.playSessionId,
        );
      }

      await TrackPlayer.skip(index);

      setState((prev) => {
        const targetTrack = prev.queue[index];
        const mediaInfo = targetTrack?.Id
          ? prev.trackMediaInfoMap[targetTrack.Id]
          : null;
        return {
          ...prev,
          queueIndex: index,
          currentTrack: targetTrack,
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
  const syncFromTrackPlayer = useCallback(async () => {
    const index = await TrackPlayer.getActiveTrackIndex();
    if (index !== undefined && index < state.queue.length) {
      setState((prev) => ({
        ...prev,
        queueIndex: index,
        currentTrack: prev.queue[index],
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

  // Cache current track + look-ahead: pre-cache current and next N tracks
  const triggerLookahead = useCallback(async () => {
    // Check if caching is enabled in settings
    if (settings?.audioLookaheadEnabled === false) return;
    if (!api || !user?.Id) return;

    try {
      const tpQueue = await TrackPlayer.getQueue();
      const currentIdx = await TrackPlayer.getActiveTrackIndex();
      if (currentIdx === undefined || currentIdx < 0) return;

      // Cache current track + next N tracks (from settings, default 2)
      const lookaheadCount = settings?.audioLookaheadCount ?? 2;
      const tracksToCache = tpQueue.slice(
        currentIdx,
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
          downloadTrack(itemId, result.url, { permanent: false }).catch(() => {
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

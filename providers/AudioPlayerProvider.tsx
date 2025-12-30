import { getSessionApi } from "@jellyfin/sdk/lib/utils/api/session-api";
import { atom, useAtomValue, useSetAtom } from "jotai";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useAudioPreloader } from "@/hooks/useAudioPreloader";
import { songToAudioTrack } from "@/models/music/adapters";
import type { Song } from "@/models/music/types";
import * as MediaControls from "@/modules/expo-media-controls";
import { useSettings } from "@/utils/atoms/settings";
import { AudioController } from "./AudioPlayer/AudioController";
import type {
  AudioPlayerState,
  AudioTrack,
  RepeatMode,
} from "./AudioPlayer/types";
import { LockScreenView } from "./AudioPlayer/views/LockScreenView";
import { useDownload } from "./DownloadProvider";
import { apiAtom } from "./JellyfinProvider";

// Atoms for global audio state
export const audioPlayerVisibleAtom = atom<boolean>(false);
export const miniPlayerVisibleAtom = atom<boolean>(false);

interface AudioPlayerContextValue {
  state: AudioPlayerState;
  isReady: boolean;
  play: () => Promise<void>;
  pause: () => Promise<void>;
  stop: () => Promise<void>;
  togglePlayPause: () => Promise<void>;
  seekTo: (position: number) => Promise<void>;
  skipForward: () => Promise<void>;
  skipBackward: () => Promise<void>;
  playTrack: (track: AudioTrack) => Promise<void>;
  playTracks: (tracks: AudioTrack[], startIndex?: number) => Promise<void>;
  addToQueue: (track: AudioTrack) => Promise<void>;
  addTracksToQueue: (tracks: AudioTrack[]) => Promise<void>;
  removeFromQueue: (index: number) => Promise<void>;
  skipToNext: () => Promise<void>;
  skipToPrevious: () => Promise<void>;
  skipToIndex: (index: number) => Promise<void>;
  clearQueue: () => Promise<void>;
  setRepeatMode: (mode: RepeatMode) => Promise<void>;
  toggleShuffle: () => Promise<void>;
  setVolume: (volume: number) => Promise<void>;
  castToSession: (sessionId: string) => Promise<void>;
  castToChromecast: () => Promise<void>;
  disconnectFromRemote: () => Promise<void>;

  // Domain model methods (primary API)
  playSong: (song: Song) => Promise<void>;
  playSongs: (songs: Song[], startIndex?: number) => Promise<void>;
  playItems: (items: Song[], startIndex?: number) => Promise<void>;
}

const AudioPlayerContext = createContext<AudioPlayerContextValue | null>(null);

export function useAudioPlayer() {
  const context = useContext(AudioPlayerContext);
  if (!context) {
    throw new Error("useAudioPlayer must be used within AudioPlayerProvider");
  }
  return context;
}

export function AudioPlayerProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const api = useAtomValue(apiAtom);
  const { settings } = useSettings();
  const setMiniPlayerVisible = useSetAtom(miniPlayerVisibleAtom);
  const [isReady, setIsReady] = useState(false);
  const [state, setState] = useState<AudioPlayerState>({
    currentTrack: null,
    queue: [],
    queueIndex: -1,
    isPlaying: false,
    position: 0,
    duration: 0,
    bufferedPosition: 0,
    isBuffering: false,
    repeatMode: "off",
    shuffleEnabled: false,
    isReady: false,
    remoteSessionId: null,
  });

  const controllerRef = useRef<AudioController | null>(null);

  // Download provider for checking and managing downloads
  const { getDownloadedItemById, startBackgroundDownload, downloadedItems } =
    useDownload();

  // Audio prefetching/caching hook
  const { checkAndPrefetch, markAsPlayed } = useAudioPreloader({
    prefetchCount: settings.audioPrefetchCount,
    prefetchThreshold: settings.audioPrefetchThreshold,
    audioBitrate: settings.audioPrefetchBitrate,
  });

  // Initialize audio controller
  useEffect(() => {
    async function init() {
      try {
        const controller = new AudioController(api);

        // Register React state view
        controller.registerView({
          getViewId: () => "audio-player-provider",
          onStateUpdate: (newState) => {
            // Create a new object reference to ensure React detects the change
            setState({ ...newState });

            // Show/hide miniplayer based on currentTrack
            if (newState.currentTrack) {
              setMiniPlayerVisible(true);
            }
          },
        });

        // Register lock screen view
        const lockScreenView = new LockScreenView();
        controller.registerView(lockScreenView);

        await controller.initialize();
        controllerRef.current = controller;

        setIsReady(true);
      } catch (error) {
        console.error("[AudioPlayer] Error initializing controller:", error);
      }
    }

    init();

    return () => {
      if (controllerRef.current) {
        controllerRef.current.destroy();
      }
      MediaControls.clearNowPlaying();
    };
  }, [api]);

  // Removed createTrackFromItem and getAudioStreamUrl
  // All playback now goes through domain models (Song) via playItems/playSong/playSongs

  // Controller-delegated methods
  const play = useCallback(async () => {
    await controllerRef.current?.play();
  }, []);

  const pause = useCallback(async () => {
    await controllerRef.current?.pause();
  }, []);

  const stop = useCallback(async () => {
    await controllerRef.current?.stop();
  }, []);

  const togglePlayPause = useCallback(async () => {
    await controllerRef.current?.togglePlayPause();
  }, []);

  const seekTo = useCallback(async (position: number) => {
    await controllerRef.current?.seekTo(position);
  }, []);

  const skipForward = useCallback(async () => {
    await controllerRef.current?.skipForward();
  }, []);

  const skipBackward = useCallback(async () => {
    await controllerRef.current?.skipBackward();
  }, []);

  const playTrack = useCallback(async (track: AudioTrack) => {
    await controllerRef.current?.playTrack(track);
  }, []);

  const playTracks = useCallback(
    async (tracks: AudioTrack[], startIndex: number = 0) => {
      await controllerRef.current?.playTracks(tracks, startIndex);
    },
    [],
  );

  const addToQueue = useCallback(async (track: AudioTrack) => {
    await controllerRef.current?.addToQueue(track);
  }, []);

  const addTracksToQueue = useCallback(async (tracks: AudioTrack[]) => {
    for (const track of tracks) {
      await controllerRef.current?.addToQueue(track);
    }
  }, []);

  const removeFromQueue = useCallback(async (_index: number) => {
    // TODO: Implement in controller
    console.warn("[AudioPlayer] removeFromQueue not yet implemented");
  }, []);

  const skipToNext = useCallback(async () => {
    await controllerRef.current?.skipToNext();
  }, []);

  const skipToPrevious = useCallback(async () => {
    await controllerRef.current?.skipToPrevious();
  }, []);

  const skipToIndex = useCallback(async (index: number) => {
    await controllerRef.current?.skipToIndex(index);
  }, []);

  const clearQueue = useCallback(async () => {
    await controllerRef.current?.clearQueue();
  }, []);

  const setRepeatMode = useCallback(async (mode: RepeatMode) => {
    await controllerRef.current?.setRepeatMode(mode);
  }, []);

  const toggleShuffle = useCallback(async () => {
    await controllerRef.current?.toggleShuffle();
  }, []);

  const setVolume = useCallback(async (volume: number) => {
    await controllerRef.current?.setVolume(volume);
  }, []);

  const castToSession = useCallback(async (sessionId: string) => {
    await controllerRef.current?.castToSession(sessionId);
  }, []);

  const castToChromecast = useCallback(async () => {
    // TODO: Implement Chromecast casting
  }, []);

  const disconnectFromRemote = useCallback(async () => {
    await controllerRef.current?.disconnectFromRemote();
  }, []);

  // Setup lock screen control event listeners
  useEffect(() => {
    const playSubscription = MediaControls.addListener("play", () => {
      play();
    });

    const pauseSubscription = MediaControls.addListener("pause", () => {
      pause();
    });

    const stopSubscription = MediaControls.addListener("stop", () => {
      stop();
    });

    const nextSubscription = MediaControls.addListener("next", () => {
      skipToNext();
    });

    const previousSubscription = MediaControls.addListener("previous", () => {
      skipToPrevious();
    });

    const seekToSubscription = MediaControls.addListener(
      "seekTo",
      (event?: { position: number }) => {
        if (event?.position !== undefined) {
          seekTo(event.position);
        }
      },
    );

    return () => {
      MediaControls.removeListener(playSubscription);
      MediaControls.removeListener(pauseSubscription);
      MediaControls.removeListener(stopSubscription);
      MediaControls.removeListener(nextSubscription);
      MediaControls.removeListener(previousSubscription);
      MediaControls.removeListener(seekToSubscription);
    };
  }, [play, pause, stop, skipToNext, skipToPrevious, seekTo]);

  // Enable remote volume control when casting
  useEffect(() => {
    if (!state.remoteSessionId || !api) {
      MediaControls.disableRemoteVolume();
      return;
    }

    const initRemoteVolume = async () => {
      try {
        const sessionInfo = await getSessionApi(api).getSessions();
        const session = sessionInfo.data.find(
          (s) => s.Id === state.remoteSessionId,
        );

        const initialVolume = session?.PlayState?.VolumeLevel ?? 50;
        await MediaControls.enableRemoteVolume(initialVolume);
      } catch (error) {
        console.error("[AudioPlayer] Error enabling remote volume:", error);
      }
    };

    initRemoteVolume();

    const volumeListener = MediaControls.addListener(
      "remoteVolumeChange",
      async (event?: MediaControls.RemoteVolumeChangeEvent) => {
        if (!event || !api) return;

        try {
          // Handle volume commands
          switch (event.command) {
            case "SetVolume":
              if (event.volume !== undefined) {
                console.log(
                  "[AudioPlayer] Received SetVolume event:",
                  event.volume,
                  "Remote session:",
                  state.remoteSessionId,
                );
                await setVolume(event.volume);
              }
              break;
            case "VolumeUp":
            case "VolumeDown":
              // VolumeUp/Down events don't include the volume value
              // We need to get the current volume from the remote session and adjust it
              if (!state.remoteSessionId || !api) {
                console.warn(
                  "[AudioPlayer] Cannot adjust volume: no remote session or API",
                );
                break;
              }

              try {
                // Get current remote session volume
                const sessionsApi = getSessionApi(api);
                const sessionsResponse = await sessionsApi.getSessions();
                const remoteSession = sessionsResponse.data.find(
                  (s) => s.Id === state.remoteSessionId,
                );

                if (!remoteSession) {
                  console.warn(
                    "[AudioPlayer] Cannot find remote session for volume adjustment",
                  );
                  break;
                }

                // Get current volume (default to 50 if not available)
                const currentVolume =
                  remoteSession.PlayState?.VolumeLevel ?? 50;
                const volumeStep = 5; // Adjust by 5% each time

                const newVolume =
                  event.command === "VolumeUp"
                    ? Math.min(100, currentVolume + volumeStep)
                    : Math.max(0, currentVolume - volumeStep);

                console.log(
                  `[AudioPlayer] Adjusting volume from ${currentVolume} to ${newVolume}`,
                );
                await setVolume(newVolume);
              } catch (error) {
                console.error(
                  "[AudioPlayer] Error adjusting remote volume:",
                  error,
                );
              }
              break;
          }
        } catch (error) {
          console.error("[AudioPlayer] Error setting remote volume:", error);
        }
      },
    );

    return () => {
      volumeListener.remove();
      MediaControls.disableRemoteVolume();
    };
  }, [state.remoteSessionId, api, setVolume]);

  // Listen for download completion and notify controller
  useEffect(() => {
    if (!state.currentTrack || !controllerRef.current) return;

    const currentTrackId = state.currentTrack.id;
    const downloadedItem = getDownloadedItemById(currentTrackId);

    // If track just finished downloading while streaming, notify controller
    if (
      downloadedItem?.videoFilePath &&
      state.currentTrack.url !== downloadedItem.videoFilePath &&
      !state.currentTrack.url.startsWith("file://")
    ) {
      console.log(
        "[AudioPlayer] Download completed for current track:",
        state.currentTrack.title,
      );

      // Notify controller to switch to local player
      controllerRef.current.handleDownloadComplete(state.currentTrack);
    }
  }, [downloadedItems, state.currentTrack, getDownloadedItemById]);

  // Audio prefetching
  useEffect(() => {
    if (!state.currentTrack || !state.isPlaying) return;

    // Check and prefetch upcoming tracks
    if (
      settings.audioPrefetchEnabled &&
      state.position > 0 &&
      state.duration > 0
    ) {
      checkAndPrefetch(
        state.position,
        state.duration,
        state.queue,
        state.queueIndex,
      );
    }

    // Mark as played when reaching 80% completion
    if (state.position / state.duration > 0.8) {
      markAsPlayed(state.currentTrack);
    }
  }, [
    state.currentTrack,
    state.isPlaying,
    state.position,
    state.duration,
    state.queue,
    state.queueIndex,
    settings.audioPrefetchEnabled,
    checkAndPrefetch,
    markAsPlayed,
  ]);

  // Domain model methods - play Song directly
  const playSong = useCallback(
    async (song: Song) => {
      const track = songToAudioTrack(song);
      await playTrack(track);
    },
    [playTrack],
  );

  const playSongs = useCallback(
    async (songs: Song[], startIndex: number = 0) => {
      const tracks = songs.map(songToAudioTrack);
      await playTracks(tracks, startIndex);
    },
    [playTracks],
  );

  const playItems = useCallback(
    async (items: Song[], startIndex: number = 0) => {
      if (items.length === 0) return;
      const tracks = items.map(songToAudioTrack);
      await playTracks(tracks, startIndex);
    },
    [playTracks],
  );

  const value: AudioPlayerContextValue = {
    state,
    isReady,
    play,
    pause,
    stop,
    togglePlayPause,
    seekTo,
    skipForward,
    skipBackward,
    playTrack,
    playTracks,
    addToQueue,
    addTracksToQueue,
    removeFromQueue,
    skipToNext,
    skipToPrevious,
    skipToIndex,
    clearQueue,
    setRepeatMode,
    toggleShuffle,
    setVolume,
    castToSession,
    castToChromecast,
    disconnectFromRemote,
    playSong,
    playSongs,
    playItems,
  };

  return (
    <AudioPlayerContext.Provider value={value}>
      {children}
    </AudioPlayerContext.Provider>
  );
}

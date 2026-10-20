/**
 * `react-native-track-player`, which is installed from GitHub without its built
 * `lib/`. There is no file for Jest to resolve, so the spec mocks it with
 * `{ virtual: true }`.
 */
export const trackPlayerModule = {
  __esModule: true,
  Capability: {},
  RepeatMode: { Off: 0, Track: 1, Queue: 2 },
  default: {
    setupPlayer: async () => undefined,
    updateOptions: async () => undefined,
    setRepeatMode: async () => undefined,
    setVolume: async () => undefined,
    play: async () => undefined,
    pause: async () => undefined,
    seekTo: async () => undefined,
    getProgress: async () => ({ position: 0, duration: 0, buffered: 0 }),
    getQueue: async () => [],
    getActiveTrackIndex: async () => 0,
    getActiveTrack: async () => undefined,
    reset: async () => {},
    add: async () => 0,
    skip: async () => {},
    skipToNext: async () => {},
    skipToPrevious: async () => {},
  },
};

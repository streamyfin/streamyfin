type Listener = (event?: unknown) => void;

const mockListeners: Record<string, Listener> = {};
const mockSetVolume = jest.fn(async (_volume: number) => {});

// Virtual: the package is installed from git without its built entry point,
// which Metro never needs and Jest cannot resolve.
jest.mock(
  "react-native-track-player",
  () => ({
    __esModule: true,
    default: {
      setVolume: (volume: number) => mockSetVolume(volume),
      addEventListener: (event: string, listener: Listener) => {
        mockListeners[event] = listener;
        return { remove: () => {} };
      },
    },
    Event: {
      RemotePlay: "remote-play",
      RemotePause: "remote-pause",
      RemoteNext: "remote-next",
      RemotePrevious: "remote-previous",
      RemoteSeek: "remote-seek",
      RemoteStop: "remote-stop",
      PlaybackActiveTrackChanged: "playback-active-track-changed",
      PlaybackState: "playback-state",
    },
  }),
  { virtual: true },
);

/** A fresh module, with the playback service listening as it does in the app. */
const startService = async () => {
  jest.resetModules();
  const normalization: typeof import("@/services/MusicNormalization") = require("@/services/MusicNormalization");
  const { PlaybackService } = require("@/services/PlaybackService");
  await PlaybackService();
  return normalization;
};

const trackBecomesActive = (gains: Record<string, number> = {}) =>
  mockListeners["playback-active-track-changed"]({
    track: { id: "track", url: "https://jellyfin.example/stream", ...gains },
  });

const lastVolume = () => mockSetVolume.mock.calls.at(-1)?.[0];

beforeEach(() => {
  mockSetVolume.mockClear();
});

test("sets the volume from the gain of the track that becomes active", async () => {
  const { setMusicNormalizationMode } = await startService();
  setMusicNormalizationMode("track");

  trackBecomesActive({ normalizationGain: -20 });

  expect(mockSetVolume).toHaveBeenCalledTimes(1);
  expect(lastVolume()).toBeCloseTo(0.1, 10);
});

test("goes back to full volume for a track the server has no gain for", async () => {
  const { setMusicNormalizationMode } = await startService();
  setMusicNormalizationMode("track");
  trackBecomesActive({ normalizationGain: -20 });

  trackBecomesActive();

  // The previous track's volume must not linger on the next one.
  expect(lastVolume()).toBe(1);
});

test("sets the volume for a track handed over before it becomes active", async () => {
  const { setMusicNormalizationMode, setMusicNormalizationTrack } =
    await startService();
  setMusicNormalizationMode("album");

  setMusicNormalizationTrack({
    url: "https://jellyfin.example/stream",
    normalizationGain: -20,
    albumNormalizationGain: -40,
  });

  expect(lastVolume()).toBeCloseTo(0.01, 10);
});

test("applies a mode change to the track that is already playing", async () => {
  const { setMusicNormalizationMode } = await startService();
  setMusicNormalizationMode("track");
  trackBecomesActive({ normalizationGain: -20, albumNormalizationGain: -40 });

  setMusicNormalizationMode("album");
  expect(lastVolume()).toBeCloseTo(0.01, 10);

  setMusicNormalizationMode("off");
  expect(lastVolume()).toBe(1);
});

test("leaves the player alone while normalization is off", async () => {
  await startService();

  trackBecomesActive({ normalizationGain: -20 });
  mockListeners["playback-state"]({ state: "playing" });

  expect(mockSetVolume).not.toHaveBeenCalled();
});

test("uses the gains of a track that started while it was off", async () => {
  const { setMusicNormalizationMode } = await startService();
  trackBecomesActive({ normalizationGain: -20 });

  setMusicNormalizationMode("track");

  expect(lastVolume()).toBeCloseTo(0.1, 10);
});

test("does not reach for a player before any track has played", async () => {
  const { setMusicNormalizationMode } = await startService();

  // The provider hands the mode over on launch, before the player is set up.
  setMusicNormalizationMode("album");

  expect(mockSetVolume).not.toHaveBeenCalled();
});

test("keeps the volume when the queue runs out", async () => {
  const { setMusicNormalizationMode } = await startService();
  setMusicNormalizationMode("track");
  trackBecomesActive({ normalizationGain: -20 });
  mockSetVolume.mockClear();

  mockListeners["playback-active-track-changed"]({ lastTrack: { id: "a" } });

  expect(mockSetVolume).not.toHaveBeenCalled();
});

// iOS builds a new native player after a failure, at full volume, and playing
// the same track again raises no track change.
test("sets the volume again when the playback state changes", async () => {
  const { setMusicNormalizationMode } = await startService();
  setMusicNormalizationMode("track");
  trackBecomesActive({ normalizationGain: -20 });
  mockSetVolume.mockClear();

  mockListeners["playback-state"]({ state: "playing" });

  expect(mockSetVolume).toHaveBeenCalledTimes(1);
  expect(lastVolume()).toBeCloseTo(0.1, 10);
});

import { render } from "@testing-library/react-native";
import { writeErrorLog } from "@/utils/log";
import { MusicPlaybackEngine } from "./MusicPlaybackEngine";

const mockContext = {
  isPlayerReady: false,
  setProgress: () => undefined,
  setDuration: () => undefined,
  setIsPlaying: () => undefined,
  reportProgress: () => undefined,
  onTrackEnd: () => undefined,
  syncFromTrackPlayer: () => undefined,
  triggerLookahead: () => undefined,
};

const mockHooks = {
  useProgress: jest.fn(() => ({ position: 0, duration: 0 })),
  usePlaybackState: jest.fn(() => ({ state: "none" })),
  useActiveTrack: jest.fn(() => undefined),
  subscribed: [] as string[],
  handlers: {} as Record<string, (event: unknown) => Promise<void>>,
  activeTrack: undefined as { id: string; url: string } | undefined,
  playWhenReady: true,
  play: jest.fn(async () => undefined),
};

jest.mock(
  "react-native-track-player",
  () => ({
    __esModule: true,
    Event: {
      PlaybackActiveTrackChanged: "playback-active-track-changed",
      PlaybackError: "playback-error",
    },
    State: { Playing: "playing" },
    useProgress: (...args: unknown[]) =>
      (mockHooks.useProgress as (...a: unknown[]) => unknown)(...args),
    usePlaybackState: () => mockHooks.usePlaybackState(),
    useActiveTrack: () => mockHooks.useActiveTrack(),
    default: {
      addEventListener: (
        event: string,
        handler: (event: unknown) => Promise<void>,
      ) => {
        mockHooks.subscribed.push(event);
        mockHooks.handlers[event] = handler;
        return { remove: () => undefined };
      },
      getActiveTrack: async () => mockHooks.activeTrack,
      getPlayWhenReady: async () => mockHooks.playWhenReady,
      play: () => mockHooks.play(),
    },
  }),
  { virtual: true },
);
jest.mock("@/providers/AudioStorage", () => ({
  audioStorageEvents: { on: () => undefined, off: () => undefined },
  deleteTrack: async () => undefined,
  getLocalPath: () => null,
}));
jest.mock("@/providers/MusicPlayerProvider", () => ({
  useMusicPlayer: () => mockContext,
}));

beforeEach(() => {
  mockContext.isPlayerReady = false;
  mockHooks.useProgress.mockClear();
  mockHooks.usePlaybackState.mockClear();
  mockHooks.useActiveTrack.mockClear();
  mockHooks.subscribed = [];
  mockHooks.handlers = {};
  mockHooks.activeTrack = undefined;
  mockHooks.playWhenReady = true;
});

describe("MusicPlaybackEngine", () => {
  // The hooks read the native state once on mount and swallow the rejection
  // when there is no player, so mounting them early leaves a player that was
  // reattached later showing as paused.
  test("polls the native player only once it is ready", async () => {
    const screen = await render(<MusicPlaybackEngine />);

    expect(mockHooks.useProgress).not.toHaveBeenCalled();
    expect(mockHooks.usePlaybackState).not.toHaveBeenCalled();
    expect(mockHooks.useActiveTrack).not.toHaveBeenCalled();

    mockContext.isPlayerReady = true;
    await screen.rerender(<MusicPlaybackEngine />);

    expect(mockHooks.useProgress).toHaveBeenCalled();
    expect(mockHooks.usePlaybackState).toHaveBeenCalled();
    expect(mockHooks.useActiveTrack).toHaveBeenCalled();
  });

  // The first track change comes right after the first add, before the player
  // is reported ready.
  test("listens for track changes and errors from the start", async () => {
    await render(<MusicPlaybackEngine />);

    expect(mockHooks.subscribed).toEqual([
      "playback-active-track-changed",
      "playback-error",
    ]);
  });

  test("keeps the listeners when the polling hooks mount", async () => {
    const screen = await render(<MusicPlaybackEngine />);
    mockContext.isPlayerReady = true;
    await screen.rerender(<MusicPlaybackEngine />);

    expect(mockHooks.subscribed).toHaveLength(2);
  });
});

// A seek right after loading a stream (a restored queue, the end of a cast)
// can fail its decoding: the error was dropped and the track stayed paused
// until a second tap played it again.
describe("a playback error on a stream", () => {
  const stream = { id: "track-1", url: "https://server/Audio/track-1/stream" };
  const emit = (event: string, payload: unknown = {}) =>
    mockHooks.handlers[event](payload);
  const failPlayback = () =>
    emit("playback-error", {
      code: "playback-failed",
      message: "Cannot Decode",
    });

  beforeEach(async () => {
    mockHooks.activeTrack = stream;
    await render(<MusicPlaybackEngine />);
  });

  test("is written to the log and the track is played again once", async () => {
    await failPlayback();

    expect(jest.mocked(writeErrorLog)).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ trackId: "track-1" }),
    );
    expect(mockHooks.play).toHaveBeenCalledTimes(1);
  });

  test("leaves a track that plays without an error alone", async () => {
    await emit("playback-active-track-changed", { track: stream });

    expect(mockHooks.play).not.toHaveBeenCalled();
    expect(jest.mocked(writeErrorLog)).not.toHaveBeenCalled();
  });

  // A seek while paused can fail the same way.
  test("leaves a paused track paused", async () => {
    mockHooks.playWhenReady = false;
    await failPlayback();

    expect(jest.mocked(writeErrorLog)).toHaveBeenCalledTimes(1);
    expect(mockHooks.play).not.toHaveBeenCalled();
  });

  test("does not loop when the track fails again", async () => {
    await failPlayback();
    await failPlayback();

    expect(jest.mocked(writeErrorLog)).toHaveBeenCalledTimes(2);
    expect(mockHooks.play).toHaveBeenCalledTimes(1);
  });

  // The end of a cast reloads the same track each time.
  test("plays again once per load of the track", async () => {
    await failPlayback();
    await emit("playback-active-track-changed", { track: stream });
    await failPlayback();

    expect(mockHooks.play).toHaveBeenCalledTimes(2);
  });
});

import { render } from "@testing-library/react-native";
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
      addEventListener: (event: string) => {
        mockHooks.subscribed.push(event);
        return { remove: () => undefined };
      },
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

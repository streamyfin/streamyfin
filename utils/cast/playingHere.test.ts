import { musicPlayingHere } from "./playingHere";

const mockPlayer = {
  state: "playing",
  track: { title: "Bonus 1" } as { title?: string } | undefined,
  fails: false,
};
// Installed from GitHub without its built lib/: nothing for Jest to resolve, so virtual.
jest.mock(
  "react-native-track-player",
  () => ({
    __esModule: true,
    State: { Playing: "playing", Paused: "paused" },
    default: {
      getPlaybackState: async () => {
        if (mockPlayer.fails) throw new Error("The player is not initialized");
        return { state: mockPlayer.state };
      },
      getActiveTrack: async () => mockPlayer.track,
    },
  }),
  { virtual: true },
);

beforeEach(() => {
  mockPlayer.state = "playing";
  mockPlayer.track = { title: "Bonus 1" };
  mockPlayer.fails = false;
});

test("names the track the music player plays", async () => {
  await expect(musicPlayingHere()).resolves.toBe("Bonus 1");
});

test("names nothing for a paused track", async () => {
  mockPlayer.state = "paused";
  await expect(musicPlayingHere()).resolves.toBeNull();
});

// Before the music player has ever started, the player answers with an error.
test("names nothing before the player is set up", async () => {
  mockPlayer.fails = true;
  await expect(musicPlayingHere()).resolves.toBeNull();
});

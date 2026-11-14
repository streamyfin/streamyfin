import { act } from "@testing-library/react-native";
import { measureRenders } from "reassure";
import { MusicPlaybackEngine } from "@/components/music/MusicPlaybackEngine";
import { MusicPlayerProvider } from "@/providers/MusicPlayerProvider";
import { makeItems } from "@/test-utils/baseItems";
import { storage } from "@/utils/mmkv";

// The track player double has no hooks or events. `useProgress` here polls
// like the real one: it reads the player on an interval and sets state, and the
// position advances as it would during playback, so every poll is a render.
jest.mock(
  "react-native-track-player",
  () => {
    const { useEffect, useState } = jest.requireActual("react");
    const { trackPlayerModule } = jest.requireActual(
      "@/test-utils/trackPlayer",
    );
    let position = 0;
    return {
      ...trackPlayerModule,
      Event: {
        PlaybackActiveTrackChanged: "playback-active-track-changed",
        PlaybackError: "playback-error",
      },
      State: { Playing: "playing" },
      useProgress: (interval: number) => {
        const [progress, setProgress] = useState({ position: 0, duration: 0 });
        useEffect(() => {
          const id = setInterval(
            () => setProgress({ position: ++position, duration: 300 }),
            interval,
          );
          return () => clearInterval(id);
        }, [interval]);
        return progress;
      },
      usePlaybackState: () => ({ state: "none" }),
      useActiveTrack: () => undefined,
      default: {
        ...trackPlayerModule.default,
        addEventListener: () => ({ remove: () => {} }),
      },
    };
  },
  { virtual: true },
);
jest.mock(
  "@/providers/NetworkStatusProvider",
  () => jest.requireActual("@/test-utils/appProviders").networkStatusModule,
);
jest.mock(
  "@/hooks/useNetworkStatus",
  () => jest.requireActual("@/test-utils/appProviders").networkStatusModule,
);
jest.mock("@/providers/AudioStorage", () => ({
  initAudioStorage: async () => undefined,
  setMaxCacheSizeMB: () => undefined,
  getLocalPath: () => null,
  deleteTrack: async () => undefined,
  isDownloading: () => false,
  downloadTrack: async () => undefined,
  isPermanentDownloading: () => false,
  isPermanentlyDownloaded: () => false,
  isCached: () => false,
  audioStorageEvents: {
    on: () => {},
    off: () => {},
    addListener: () => ({ remove: () => {} }),
    removeListener: () => {},
  },
}));
jest.mock("@/providers/WebSocketProvider", () => ({
  useWebSocketContext: () => ({
    subscribe: () => () => {},
  }),
}));
jest.mock("@/utils/jellyfin/audio/getAudioStreamUrl", () => ({
  getAudioStreamUrl: async () => ({
    url: "https://jellyfin.example.com/Audio/stream",
    sessionId: null,
    mediaSource: null,
    isTranscoding: false,
  }),
}));
jest.mock("@/utils/atoms/settings", () =>
  jest.requireActual("@/test-utils/settings").makeSettingsModule(),
);

const SECONDS = 5;
const sampleTracks = makeItems(20, "Track", "Audio");

const MusicTree = () => (
  <MusicPlayerProvider>
    <MusicPlaybackEngine />
  </MusicPlayerProvider>
);

const clearQueue = () => {
  storage.remove("music_player_queue_owner");
  storage.remove("music_player_queue");
  storage.remove("music_player_queue_index");
  storage.remove("music_player_progress");
};

const seedQueue = () => {
  storage.set("music_player_queue_owner", ":user-1");
  storage.set("music_player_queue", JSON.stringify(sampleTracks));
  storage.set("music_player_queue_index", "0");
  storage.set("music_player_progress", "0");
};

// The scenario runs several seconds of fake time so that a poll shows up as
// commits.
const idle = async () => {
  for (let second = 0; second < SECONDS; second++) {
    await act(async () => {
      await jest.advanceTimersByTimeAsync(1000);
    });
  }
};

describe("MusicPlayerProvider Performance", () => {
  // Nothing has been played, so the native player must not be set up and the
  // engine must not poll it: the commit count must not grow with time.
  test("mounting with no saved queue stays idle", async () => {
    await measureRenders(<MusicTree />, {
      beforeEach: clearQueue,
      scenario: idle,
    });
  });

  // A restored queue reattaches to the native player, so the engine polls it
  // once the player is ready.
  test("mounting with a saved queue reattaches the player and polls it", async () => {
    await measureRenders(<MusicTree />, {
      beforeEach: seedQueue,
      scenario: idle,
    });
  });
});

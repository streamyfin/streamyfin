import { act, screen } from "@testing-library/react-native";
import { useEffect } from "react";
import { View } from "react-native";
import { measureRenders } from "reassure";
import { MiniPlayerBar } from "@/components/music/MiniPlayerBar";
import { MusicTrackItem } from "@/components/music/MusicTrackItem";
import {
  MusicPlayerProvider,
  useMusicPlayer,
} from "@/providers/MusicPlayerProvider";
import { makeItems } from "@/test-utils/baseItems";
import { storage } from "@/utils/mmkv";

jest.mock("@/providers/NetworkStatusProvider", () => ({
  useNetworkStatus: () => ({ isConnected: true, serverConnected: true }),
}));

jest.mock("@/hooks/useNetworkStatus", () => ({
  useNetworkStatus: () => ({
    isConnected: true,
    serverConnected: true,
    loading: false,
    retryCheck: () => {},
  }),
}));

jest.mock("@/providers/AudioStorage", () => ({
  initAudioStorage: async () => undefined,
  setMaxCacheSizeMB: () => undefined,
  getLocalPath: () => null,
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

jest.mock("@/utils/atoms/settings", () => {
  const { atom } = jest.requireActual("jotai");
  const { defaultValues: defaultSettings } = jest.requireActual(
    "@/utils/atoms/settings",
  );
  return {
    settingsAtom: atom(defaultSettings),
    effectiveSettingsAtom: atom(defaultSettings),
    useSettings: () => ({
      settings: defaultSettings,
      updateSettings: () => {},
      pluginSettings: undefined,
    }),
  };
});

const TRACK_COUNT = 50;
const sampleTracks = makeItems(TRACK_COUNT, "Track", "Audio");

let capturedSetProgress: ((progress: number) => void) | undefined;

const TestDriver = () => {
  const { setProgress, setIsPlaying } = useMusicPlayer();
  capturedSetProgress = setProgress;

  useEffect(() => {
    setIsPlaying(true);
  }, [setIsPlaying]);

  return null;
};

const PlayerTree = () => {
  return (
    <MusicPlayerProvider>
      <TestDriver />
      <MiniPlayerBar />
      <View>
        {sampleTracks.map((item, index) => (
          <MusicTrackItem
            key={item.Id}
            track={item}
            index={index}
            queue={sampleTracks}
          />
        ))}
      </View>
    </MusicPlayerProvider>
  );
};

const seedStorage = () => {
  storage.set("music_player_queue_owner", ":user-1");
  storage.set("music_player_queue", JSON.stringify(sampleTracks));
  storage.set("music_player_queue_index", "0");
  storage.set("music_player_progress", "0");
};

describe("MusicPlayer Performance", () => {
  beforeEach(() => {
    seedStorage();
  });

  test("playback progress updates re-render music track rows", async () => {
    await measureRenders(<PlayerTree />, {
      beforeEach: seedStorage,
      scenario: async () => {
        await screen.findAllByText("Track 0");
        for (let i = 1; i <= 30; i++) {
          await act(async () => {
            capturedSetProgress?.(i);
          });
        }
      },
    });
  }, 60_000);
});

import type { MediaStream } from "@jellyfin/sdk/lib/generated-client/models";
import { act, render } from "@testing-library/react-native";
import { Text } from "react-native";
import type { Track } from "../types";
import { useVideoContext, VideoProvider } from "./VideoContext";

// Jellyfin lists an external audio file ahead of the file's own tracks, and mpv
// only numbers the file's own: [TrueHD = 1, AC-3 = 2].
const mockMediaSource = {
  Id: "source-1",
  MediaStreams: [
    {
      Type: "Audio",
      Index: 1,
      Codec: "eac3",
      IsExternal: true,
      DisplayTitle: "External",
    },
    { Type: "Video", Index: 2, Codec: "hevc" },
    { Type: "Audio", Index: 3, Codec: "truehd", DisplayTitle: "TrueHD" },
    { Type: "Audio", Index: 4, Codec: "ac3", DisplayTitle: "AC-3" },
  ] as MediaStream[],
};
const mockControls = {
  getAudioTracks: jest.fn(async () => [{ id: 1 }, { id: 2 }]),
  getSubtitleTracks: jest.fn(async () => []),
  setAudioTrack: jest.fn(),
  setSubtitleTrack: jest.fn(),
  addSubtitleFile: jest.fn(),
};
const mockRouter = { setParams: jest.fn(), replace: jest.fn() };

jest.mock("./PlayerContext", () => ({
  usePlayerContext: () => ({
    tracksReady: true,
    mediaSource: mockMediaSource,
    downloadedItem: undefined,
    item: { Id: "item-1" },
  }),
  usePlayerControls: () => mockControls,
}));
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({
    itemId: "item-1",
    audioIndex: "3",
    subtitleIndex: "-1",
    mediaSourceId: "source-1",
    bitrateValue: "",
    playbackPosition: "0",
  }),
}));
jest.mock("@/hooks/useAppRouter", () => ({
  __esModule: true,
  default: () => mockRouter,
}));
jest.mock("@/providers/JellyfinProvider", () => ({
  apiAtom: jest.requireActual("jotai").atom({ basePath: "http://server" }),
}));
jest.mock("@/providers/OfflineModeProvider", () => ({
  useOfflineMode: () => false,
}));
// The real settings atom loads the screens that edit it.
jest.mock("@/utils/atoms/settings", () => ({
  useSettings: () => ({ settings: {} }),
}));
jest.mock("@/utils/atoms/downloadedSubtitles", () => ({
  getSubtitlesForItem: () => [],
}));
jest.mock("@/utils/seriesTrackMemory", () => ({
  rememberSeriesTrackFromRow: () => {},
}));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

let audioTracks: Track[] | null = null;
const Menu = () => {
  audioTracks = useVideoContext().audioTracks;
  return <Text>menu</Text>;
};

const pick = async (name: string) => {
  const track = audioTracks?.find((t) => t.name === name);
  if (!track) throw new Error(`no audio row named ${name}`);
  await act(async () => track.setTrack());
};

beforeEach(async () => {
  jest.clearAllMocks();
  audioTracks = null;
  await render(
    <VideoProvider>
      <Menu />
    </VideoProvider>,
  );
});

// The phone menu counted the external stream too, so TrueHD played the AC-3
// track and AC-3 asked for a track mpv does not have, which turns audio off.
test("plays the embedded track that was picked, after an external one", async () => {
  await pick("TrueHD");
  await pick("AC-3");

  expect(mockControls.setAudioTrack.mock.calls).toEqual([[1], [2]]);
});

// An external audio file never reaches mpv in a direct stream: the server has
// to mux it in, so picking it reloads the stream with that track.
test("reloads the stream with an external audio track instead of guessing one", async () => {
  await pick("External");

  expect(mockControls.setAudioTrack).not.toHaveBeenCalled();
  expect(mockRouter.replace).toHaveBeenCalledWith(
    expect.stringContaining("audioIndex=1"),
  );
});

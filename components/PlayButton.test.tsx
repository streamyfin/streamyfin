import type {
  BaseItemDto,
  MediaSourceInfo,
} from "@jellyfin/sdk/lib/generated-client";
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import type { Bitrate } from "./BitrateSelector";
import { PlayButton } from "./PlayButton";

const mockCast = jest.fn(async (..._args: unknown[]) => ({ status: "loaded" }));
const mockPlayMedia = jest.fn(async (..._args: unknown[]) => {});
const mockDetectBitrate = jest.fn(async (_api: unknown) => 12_000_000);
const mockClient = { getMediaStatus: async () => null };
/** The entry picked in the Chromecast / Device / Cancel sheet. */
let mockChoice = 0;

jest.mock("@expo/react-native-action-sheet", () => ({
  useActionSheet: () => ({
    showActionSheetWithOptions: (
      _options: unknown,
      onSelect: (index?: number) => void,
    ) => onSelect(mockChoice),
  }),
}));
jest.mock("@expo/vector-icons", () => ({
  Feather: () => null,
  Ionicons: () => null,
}));
jest.mock("@gorhom/bottom-sheet", () =>
  jest.requireActual("@gorhom/bottom-sheet/mock"),
);
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock("react-native-google-cast", () => ({
  __esModule: true,
  default: {
    getPlayServicesState: async () => "success",
    showPlayServicesErrorDialog: () => {},
    showExpandedControls: () => {},
  },
  CastButton: () => null,
  PlayServicesState: { SUCCESS: "success" },
  useCastDevice: () => ({ friendlyName: "Living Room TV" }),
  useMediaStatus: () => null,
  useRemoteMediaClient: () => mockClient,
}));
jest.mock("react-native-reanimated", () => ({
  ...jest.requireActual("@/test-utils/reanimated").reanimatedModule,
}));
jest.mock("@/hooks/useHaptic", () => ({ useHaptic: () => () => {} }));
jest.mock("@/hooks/usePlayMedia", () => ({
  usePlayMedia: () => mockPlayMedia,
}));
jest.mock("@/providers/Downloads/database", () => ({
  getDownloadedItemById: () => undefined,
}));
jest.mock("@/providers/GlobalModalProvider", () => ({
  useGlobalModal: () => ({ showModal: () => {}, hideModal: () => {} }),
}));
jest.mock("@/providers/JellyfinProvider", () => {
  const { atom } = jest.requireActual("jotai");
  const { makeApi } = jest.requireActual("@/test-utils/jellyfinApi");
  return { apiAtom: atom(makeApi()), userAtom: atom({ Id: "user-1" }) };
});
jest.mock("@/providers/OfflineModeProvider", () => ({
  useOfflineMode: () => false,
}));
jest.mock("@/providers/SyncPlayProvider", () => ({
  useSyncPlay: () => ({ enabled: false }),
}));
jest.mock("@/utils/atoms/settings", () => ({
  useSettings: () => ({ settings: { showResumeDialog: false } }),
}));
jest.mock("@/utils/cast/jellyfinReceiver", () => ({
  castToJellyfinReceiver: (...args: unknown[]) => mockCast(...args),
  currentReceiverName: async () => "Living Room TV",
  receiverNameFor: () => "Living Room TV",
}));
jest.mock("@/utils/jellyfin/bitrateTest", () => ({
  detectBitrate: (api: unknown) => mockDetectBitrate(api),
}));
jest.mock("@/utils/log", () => ({
  logAndCaptureError: jest.fn(),
  writeErrorLog: jest.fn(),
  writeToLog: jest.fn(),
}));

const MOVIE: BaseItemDto = {
  Id: "movie-1",
  Name: "Movie",
  Type: "Movie",
  RunTimeTicks: 72_000_000_000,
};
const SOURCE: MediaSourceInfo = { Id: "source-1", MediaStreams: [] };

const AUTO: Bitrate = { key: "Auto", value: undefined };
const MAX: Bitrate = { key: "Max", value: undefined };
const EIGHT_MBPS: Bitrate = { key: "8 Mb/s", value: 8_000_000 };

const play = async (bitrate: Bitrate, choice: "Chromecast" | "Device") => {
  mockChoice = choice === "Chromecast" ? 0 : 1;
  await render(
    <PlayButton
      item={MOVIE}
      selectedOptions={{
        bitrate,
        mediaSource: SOURCE,
        audioIndex: 1,
        subtitleIndex: -1,
      }}
    />,
  );
  await fireEvent.press(screen.getByLabelText("accessibility.play_button"));
};

/** The bitrate the receiver was handed, once the cast went out. */
const castBitrate = async () => {
  await waitFor(() => expect(mockCast).toHaveBeenCalled());
  const [, session] = mockCast.mock.calls[0] as [
    unknown,
    { maxBitrate?: number },
  ];
  return session.maxBitrate;
};

beforeEach(() => {
  mockCast.mockClear();
  mockPlayMedia.mockClear();
  mockDetectBitrate.mockClear();
});

describe("casting from the item page", () => {
  // The receiver negotiates the stream itself: handed nothing, it would pick
  // a bitrate of its own instead of the one Auto stands for.
  test("hands the receiver the bitrate Auto measures", async () => {
    await play(AUTO, "Chromecast");

    expect(await castBitrate()).toBe(12_000_000);
    expect(mockDetectBitrate).toHaveBeenCalledTimes(1);
  });

  test("hands the receiver a fixed quality as it is", async () => {
    await play(EIGHT_MBPS, "Chromecast");

    expect(await castBitrate()).toBe(8_000_000);
    expect(mockDetectBitrate).not.toHaveBeenCalled();
  });

  // A cast that names no bitrate leaves the receiver on the cap of the cast
  // before it: Max is said as the receiver's own ceiling.
  test("hands the receiver its own ceiling under Max", async () => {
    await play(MAX, "Chromecast");

    expect(await castBitrate()).toBe(120_000_000);
    expect(mockDetectBitrate).not.toHaveBeenCalled();
  });

  test("hands the receiver its own ceiling when Auto measures nothing", async () => {
    mockDetectBitrate.mockRejectedValueOnce(new Error("nothing measured"));

    await play(AUTO, "Chromecast");

    expect(await castBitrate()).toBe(120_000_000);
  });
});

describe("playing on the device from the item page", () => {
  // The player measures it when it negotiates the stream, for this item and
  // for every one after it.
  test("hands the player Auto as Auto", async () => {
    await play(AUTO, "Device");

    await waitFor(() =>
      expect(mockPlayMedia).toHaveBeenCalledWith(
        expect.objectContaining({ itemId: "movie-1", bitrateValue: "auto" }),
        { item: MOVIE },
      ),
    );
    expect(mockDetectBitrate).not.toHaveBeenCalled();
  });

  // Naming no quality would play at the default one.
  test("hands the player Max as Max", async () => {
    await play(MAX, "Device");

    await waitFor(() =>
      expect(mockPlayMedia).toHaveBeenCalledWith(
        expect.objectContaining({ bitrateValue: "max" }),
        { item: MOVIE },
      ),
    );
  });
});

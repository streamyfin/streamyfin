import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { castToJellyfinReceiver } from "@/utils/cast/jellyfinReceiver";
import { PlayButton } from "./PlayButton";

const mockSalon = {
  kind: "cast",
  id: "device-a",
  name: "Salon",
  capabilities: { volume: true },
};
const mockNoTarget = {
  state: "none",
  target: null,
  reconnecting: false,
  error: null,
  volume: null,
  muted: false,
  errorCode: null,
  failedTarget: null,
};
let mockTarget: object = mockNoTarget;
let mockOffline = false;
const mockPlayMedia = jest.fn(async () => undefined);
const mockShowActionSheet = jest.fn();
const connectedTo = (target: object) => ({
  ...mockNoTarget,
  state: "connected",
  target,
});

jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock("@expo/vector-icons", () => {
  const { View } = jest.requireActual("react-native");
  const Glyph = ({ name }: { name: string }) => (
    <View testID={`glyph-${name}`} />
  );
  return { Feather: Glyph, Ionicons: Glyph };
});
jest.mock("@expo/react-native-action-sheet", () => ({
  useActionSheet: () => ({ showActionSheetWithOptions: mockShowActionSheet }),
}));
jest.mock("@gorhom/bottom-sheet", () => ({
  BottomSheetView: jest.requireActual("react-native").View,
}));
jest.mock("react-native-reanimated", () => {
  const { View, Text } = jest.requireActual("react-native");
  return {
    ...jest.requireActual("@/test-utils/reanimated").reanimatedModule,
    __esModule: true,
    default: { View, Text },
    Easing: { out: () => undefined, quad: undefined },
    interpolate: (value: number) => value,
    interpolateColor: (_value: number, _input: number[], output: string[]) =>
      output[0],
    useAnimatedReaction: () => undefined,
    useAnimatedStyle: (style: () => object) => style(),
    useDerivedValue: (compute: () => unknown) => ({ value: compute() }),
    withTiming: (value: number) => value,
  };
});
jest.mock("@/hooks/useHaptic", () => ({ useHaptic: () => jest.fn() }));
jest.mock("@/hooks/usePlayMedia", () => ({
  usePlayMedia: () => mockPlayMedia,
}));
jest.mock("@/modules/mpv-player/src/cast", () => {
  return {
    castClientFor: () => ({ id: "client-1" }),
    currentCastSession: () => ({ id: "session-1" }),
    onRemoteTargetChanged: () => ({ remove: jest.fn() }),
    remoteTarget: () => mockTarget,
    showExpandedControls: jest.fn(),
    useCastMediaStatus: () => null,
    useRemoteTarget: () => mockTarget,
  };
});
jest.mock("@/providers/Downloads/database", () => ({
  getDownloadedItemById: () => undefined,
}));
jest.mock("@/providers/GlobalModalProvider", () => ({
  useGlobalModal: () => ({ showModal: jest.fn(), hideModal: jest.fn() }),
}));
jest.mock("@/providers/JellyfinProvider", () => ({
  apiAtom: jest
    .requireActual("jotai")
    .atom({ basePath: "https://jellyfin.example.com" }),
  userAtom: jest.requireActual("jotai").atom({ Id: "user-1" }),
}));
jest.mock("@/providers/OfflineModeProvider", () => ({
  useOfflineMode: () => mockOffline,
}));
jest.mock("@/providers/SyncPlayProvider", () => ({
  useSyncPlay: () => ({ enabled: false }),
}));
jest.mock("@/utils/atoms/primaryColor", () => ({
  itemThemeColorAtom: jest
    .requireActual("jotai")
    .atom({ primary: "#FFFFFF", text: "#000000" }),
}));
jest.mock("@/utils/atoms/settings", () => ({
  useSettings: () => ({ settings: { showResumeDialog: true } }),
}));
jest.mock("@/utils/cast/jellyfinReceiver", () => ({
  castToJellyfinReceiver: jest.fn(async () => ({ status: "loaded" })),
  currentReceiverName: async () => "Salon",
}));
jest.mock("@/utils/log", () => ({
  logAndCaptureError: jest.fn(),
  writeErrorLog: jest.fn(),
}));

const item = {
  Id: "item-1",
  Name: "Film",
  Type: "Movie",
  RunTimeTicks: 600_000_000,
  UserData: { PlaybackPositionTicks: 0 },
} as never;
const selectedOptions = {} as never;

beforeEach(() => {
  mockTarget = connectedTo(mockSalon);
  mockOffline = false;
  mockPlayMedia.mockClear();
  mockShowActionSheet.mockClear();
  (castToJellyfinReceiver as jest.Mock).mockClear();
});

// The glyph is the whole cue: the pill used to also mount the library's Cast
// button, transparent, as the Android discovery workaround. The module's
// discovery needs no mounted button, and an invisible tap target in the pill
// would open the Cast dialog instead of playing.
test("a connected receiver shows the cast glyph and no native Cast button", async () => {
  await render(<PlayButton item={item} selectedOptions={selectedOptions} />);
  // The glyph's id is what the bench's flows wait for after picking a receiver.
  expect(screen.getByTestId("play-button-cast")).toBeTruthy();
  expect(screen.getByTestId("glyph-cast")).toBeTruthy();
  expect(screen.queryByTestId("native-cast-button")).toBeNull();
});

test("without a receiver the pill carries the play glyph only", async () => {
  mockTarget = mockNoTarget;
  await render(<PlayButton item={item} selectedOptions={selectedOptions} />);
  expect(screen.getByTestId("glyph-play-circle")).toBeTruthy();
  expect(screen.queryByTestId("play-button-cast")).toBeNull();
});

test("a connected target names itself on the button", async () => {
  await render(<PlayButton item={item} selectedOptions={selectedOptions} />);
  expect(screen.getByText("player.play_on")).toBeTruthy();
});

// One Play action: no "Chromecast / Device" choice any more.
test("a press plays on the connected target", async () => {
  await render(<PlayButton item={item} selectedOptions={selectedOptions} />);
  await act(async () =>
    fireEvent.press(screen.getByLabelText("accessibility.play_button")),
  );
  expect(castToJellyfinReceiver).toHaveBeenCalledTimes(1);
  expect(mockShowActionSheet).not.toHaveBeenCalled();
  expect(mockPlayMedia).not.toHaveBeenCalled();
});

test("a long press offers to play here", async () => {
  await render(<PlayButton item={item} selectedOptions={selectedOptions} />);
  await act(async () =>
    fireEvent(screen.getByLabelText("accessibility.play_button"), "longPress"),
  );
  const [options, choose] = mockShowActionSheet.mock.calls[0];
  expect(options.options).toEqual(["player.play_here", "common.cancel"]);
  expect(options.options).not.toContain("Chromecast");
  await act(async () => choose(0));
  expect(mockPlayMedia).toHaveBeenCalledTimes(1);
  expect(castToJellyfinReceiver).not.toHaveBeenCalled();
});

test("without a target a press plays here and a long press offers nothing", async () => {
  mockTarget = mockNoTarget;
  await render(<PlayButton item={item} selectedOptions={selectedOptions} />);
  await act(async () =>
    fireEvent(screen.getByLabelText("accessibility.play_button"), "longPress"),
  );
  await act(async () =>
    fireEvent.press(screen.getByLabelText("accessibility.play_button")),
  );
  expect(mockShowActionSheet).not.toHaveBeenCalled();
  expect(mockPlayMedia).toHaveBeenCalledTimes(1);
  expect(castToJellyfinReceiver).not.toHaveBeenCalled();
});

test("while connecting the button says so", async () => {
  mockTarget = { ...connectedTo(mockSalon), state: "connecting" };
  await render(<PlayButton item={item} selectedOptions={selectedOptions} />);
  expect(screen.getByText("player.connecting_to")).toBeTruthy();
});

// A download cannot be cast: it plays here, and the button says why.
test("a download with a target plays here and says why", async () => {
  mockOffline = true;
  await render(<PlayButton item={item} selectedOptions={selectedOptions} />);
  expect(screen.getByText("player.download_plays_here")).toBeTruthy();
});

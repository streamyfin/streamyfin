import { render, screen } from "@testing-library/react-native";
import { PlayButton } from "./PlayButton";

let mockClient: object | null = { id: "client-1" };

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
  useActionSheet: () => ({ showActionSheetWithOptions: jest.fn() }),
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
jest.mock("@/hooks/usePlayMedia", () => ({ usePlayMedia: () => jest.fn() }));
jest.mock("@/modules/mpv-player/src/cast", () => {
  const { View } = jest.requireActual("react-native");
  return {
    CastButton: () => <View testID='native-cast-button' />,
    PlayServicesState: { AVAILABLE: "available" },
    playServicesState: () => "available",
    showExpandedControls: jest.fn(),
    showPlayServicesErrorDialog: jest.fn(),
    useCastClient: () => mockClient,
    useCastDevice: () =>
      mockClient ? { id: "device-1", name: "Living room" } : null,
    useCastMediaStatus: () => null,
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
  useOfflineMode: () => false,
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
  castToJellyfinReceiver: jest.fn(),
  currentReceiverName: () => "Living room",
  receiverNameFor: () => "Living room",
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
  mockClient = { id: "client-1" };
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
  mockClient = null;
  await render(<PlayButton item={item} selectedOptions={selectedOptions} />);
  expect(screen.getByTestId("glyph-play-circle")).toBeTruthy();
  expect(screen.queryByTestId("play-button-cast")).toBeNull();
});

import {
  act,
  fireEvent,
  render,
  screen,
  userEvent,
} from "@testing-library/react-native";
import { getDefaultStore } from "jotai";
import { Alert } from "react-native";
import { userAtom } from "@/providers/JellyfinProvider";
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
let mockInGroup = false;
const mockTargetListeners = new Set<(state: object) => void>();
// The module's target changes, as onRemoteTargetChanged reports them.
const emitTarget = (state: object) => {
  mockTarget = state;
  for (const listener of [...mockTargetListeners]) listener(state);
};
let mockOffline = false;
let mockDownloaded: object | undefined;
const mockShowModal = jest.fn();
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
    onRemoteTargetChanged: (listener: (state: object) => void) => {
      mockTargetListeners.add(listener);
      return { remove: () => mockTargetListeners.delete(listener) };
    },
    remoteTarget: () => mockTarget,
    showExpandedControls: jest.fn(),
    useCastMediaStatus: () => null,
    useRemoteTarget: () => mockTarget,
  };
});
jest.mock("@/providers/Downloads/database", () => ({
  getDownloadedItemById: () => mockDownloaded,
}));
jest.mock("@/providers/GlobalModalProvider", () => ({
  useGlobalModal: () => ({ showModal: mockShowModal, hideModal: jest.fn() }),
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
  useSyncPlay: () => ({ enabled: mockInGroup }),
}));
jest.mock("@/utils/atoms/primaryColor", () => ({
  itemThemeColorAtom: jest
    .requireActual("jotai")
    .atom({ primary: "#FFFFFF", text: "#000000" }),
}));
jest.mock("@/utils/atoms/settings", () => ({
  useSettings: () => ({
    settings: {
      showResumeDialog: true,
      remotePlaybackQuality: {
        byKind: { cast: "4 Mb/s" },
        byTarget: {},
        known: [],
      },
    },
  }),
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
  mockDownloaded = undefined;
  mockShowModal.mockClear();
  jest.spyOn(Alert, "alert").mockClear();
  mockPlayMedia.mockClear();
  mockShowActionSheet.mockClear();
  mockInGroup = false;
  mockTargetListeners.clear();
  getDefaultStore().set(userAtom as never, { Id: "user-1" } as never);
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

// The item page's quality is this device's: a cast plays at the remote quality.
test("PlayButton sends the remote quality", async () => {
  const localQuality = {
    bitrate: { key: "1 Mb/s", value: 1_000_000 },
  } as never;
  await render(<PlayButton item={item} selectedOptions={localQuality} />);
  await act(async () =>
    fireEvent.press(screen.getByLabelText("accessibility.play_button")),
  );
  expect(castToJellyfinReceiver).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ maxBitrate: 4_000_000 }),
    expect.anything(),
    expect.anything(),
    expect.any(Function),
  );
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

// A press held long is a press when there is nothing else to offer: with a long press handler, the touchable
// would hand it to that handler instead, and nothing would play.
test("without a target a held press plays, as a tap does", async () => {
  mockTarget = mockNoTarget;
  await render(<PlayButton item={item} selectedOptions={selectedOptions} />);
  await userEvent
    .setup()
    .longPress(screen.getByLabelText("accessibility.play_button"));
  expect(mockPlayMedia).toHaveBeenCalledTimes(1);
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

// The button announces the target, so the phone's copy of the item does not
// turn the press into a question: only a play here can use it.
test("a downloaded item opened online plays on the target without asking", async () => {
  mockDownloaded = { item };
  await render(<PlayButton item={item} selectedOptions={selectedOptions} />);
  await act(async () =>
    fireEvent.press(screen.getByLabelText("accessibility.play_button")),
  );
  expect(castToJellyfinReceiver).toHaveBeenCalledTimes(1);
  expect(Alert.alert).not.toHaveBeenCalled();
  expect(mockShowModal).not.toHaveBeenCalled();
});

test("a play here of a downloaded item still asks which copy to play", async () => {
  mockDownloaded = { item };
  await render(<PlayButton item={item} selectedOptions={selectedOptions} />);
  await act(async () =>
    fireEvent(screen.getByLabelText("accessibility.play_button"), "longPress"),
  );
  const [, choose] = mockShowActionSheet.mock.calls[0];
  await act(async () => choose(0));
  expect(Alert.alert).toHaveBeenCalledWith(
    "player.downloaded_file_title",
    "player.downloaded_file_message",
    expect.anything(),
  );
  expect(castToJellyfinReceiver).not.toHaveBeenCalled();
});

const connectingTo = (target: object) => ({
  ...connectedTo(target),
  state: "connecting",
});
const press = () =>
  act(async () =>
    fireEvent.press(screen.getByLabelText("accessibility.play_button")),
  );

test("a press while connecting casts once connected", async () => {
  mockTarget = connectingTo(mockSalon);
  await render(<PlayButton item={item} selectedOptions={selectedOptions} />);
  await press();
  expect(castToJellyfinReceiver).not.toHaveBeenCalled();
  await act(async () => emitTarget(connectedTo(mockSalon)));
  expect(castToJellyfinReceiver).toHaveBeenCalledTimes(1);
});

// One wait at a time: a second press while it runs adds no second load.
test("a second press while waiting starts nothing more", async () => {
  mockTarget = connectingTo(mockSalon);
  await render(<PlayButton item={item} selectedOptions={selectedOptions} />);
  await press();
  await press();
  await act(async () => emitTarget(connectedTo(mockSalon)));
  expect(castToJellyfinReceiver).toHaveBeenCalledTimes(1);
});

// Gone back from the item page: the connection that lands later casts nothing from it.
test("a wait dropped with its button casts nothing", async () => {
  mockTarget = connectingTo(mockSalon);
  const view = await render(
    <PlayButton item={item} selectedOptions={selectedOptions} />,
  );
  await press();
  await act(async () => view.unmount());
  await act(async () => emitTarget(connectedTo(mockSalon)));
  expect(castToJellyfinReceiver).not.toHaveBeenCalled();
});

// Cancel from the sheet ends the connection without an error: nothing plays, and nothing to say.
test("a connection cancelled from the sheet plays nothing and says nothing", async () => {
  mockTarget = connectingTo(mockSalon);
  await render(<PlayButton item={item} selectedOptions={selectedOptions} />);
  await press();
  await act(async () =>
    emitTarget({ ...connectingTo(mockSalon), state: "ending" }),
  );
  await act(async () => emitTarget(mockNoTarget));
  expect(castToJellyfinReceiver).not.toHaveBeenCalled();
  expect(mockPlayMedia).not.toHaveBeenCalled();
  expect(Alert.alert).not.toHaveBeenCalled();
});

test("a connection that fails says so", async () => {
  mockTarget = connectingTo(mockSalon);
  await render(<PlayButton item={item} selectedOptions={selectedOptions} />);
  await press();
  await act(async () =>
    emitTarget({ ...mockNoTarget, error: "lost", failedTarget: mockSalon }),
  );
  expect(Alert.alert).toHaveBeenCalledWith(
    "player.client_error",
    "cast.output.failed",
  );
  expect(castToJellyfinReceiver).not.toHaveBeenCalled();
});

// The account that pressed Play is the one whose item and token the receiver gets.
test("a sign-out while waiting plays nothing on the receiver", async () => {
  mockTarget = connectingTo(mockSalon);
  await render(<PlayButton item={item} selectedOptions={selectedOptions} />);
  await press();
  await act(async () =>
    getDefaultStore().set(userAtom as never, null as never),
  );
  await act(async () => emitTarget(connectedTo(mockSalon)));
  expect(castToJellyfinReceiver).not.toHaveBeenCalled();
});

// The label stays the button's; its value says where a press plays.
test("a target names itself to screen readers", async () => {
  await render(<PlayButton item={item} selectedOptions={selectedOptions} />);
  expect(
    screen.getByLabelText("accessibility.play_button").props.accessibilityValue,
  ).toEqual({ text: "player.play_on" });
});

test("a screen reader reaches Play here", async () => {
  await render(<PlayButton item={item} selectedOptions={selectedOptions} />);
  await act(async () =>
    fireEvent(
      screen.getByLabelText("accessibility.play_button"),
      "accessibilityAction",
      { nativeEvent: { actionName: "longpress" } },
    ),
  );
  expect(mockShowActionSheet.mock.calls[0][0].options).toEqual([
    "player.play_here",
    "common.cancel",
  ]);
});

// A press that goes to the target leaves the group alone: the group's glyph is for a play here.
test("in a group, a press for the target shows no group glyph", async () => {
  mockInGroup = true;
  await render(<PlayButton item={item} selectedOptions={selectedOptions} />);
  expect(screen.queryByTestId("play-button-syncplay")).toBeNull();
  mockTarget = mockNoTarget;
  await render(<PlayButton item={item} selectedOptions={selectedOptions} />);
  expect(screen.getByTestId("play-button-syncplay")).toBeTruthy();
});

test("a download played from the downloads never casts", async () => {
  mockOffline = true;
  mockDownloaded = { item };
  await render(<PlayButton item={item} selectedOptions={selectedOptions} />);
  await press();
  expect(mockPlayMedia).toHaveBeenCalledWith(
    expect.objectContaining({ offline: true }),
    expect.anything(),
  );
  expect(castToJellyfinReceiver).not.toHaveBeenCalled();
});

// The load reads the receiver before it sends: a sign-out in between sends nothing.
test("the load to the receiver goes stale with the account that pressed", async () => {
  await render(<PlayButton item={item} selectedOptions={selectedOptions} />);
  await press();
  const isStale = (castToJellyfinReceiver as jest.Mock).mock.calls[0][4] as
    | (() => boolean)
    | undefined;
  const before = isStale?.();
  await act(async () =>
    getDefaultStore().set(userAtom as never, null as never),
  );
  expect(before).toBe(false);
  expect(isStale?.()).toBe(true);
});

// The last choice wins: a play here while a press still waits for the receiver plays here only.
test("a play here while a press waits plays here only", async () => {
  mockTarget = connectingTo(mockSalon);
  await render(<PlayButton item={item} selectedOptions={selectedOptions} />);
  await press();
  await act(async () =>
    fireEvent(screen.getByLabelText("accessibility.play_button"), "longPress"),
  );
  const [, choose] = mockShowActionSheet.mock.calls[0];
  await act(async () => choose(0));
  await act(async () => emitTarget(connectedTo(mockSalon)));
  expect(mockPlayMedia).toHaveBeenCalledTimes(1);
  expect(castToJellyfinReceiver).not.toHaveBeenCalled();
});

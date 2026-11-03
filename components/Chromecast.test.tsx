import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import { Colors } from "@/constants/Colors";
import {
  type CastDoubleState,
  createCastDoubleState,
  emitCastEvent,
  setCastSession,
} from "@/test-utils/cast";
import { Chromecast } from "./Chromecast";

let mockCast: CastDoubleState = createCastDoubleState();
jest.mock("@/modules/mpv-player/src/cast/CastModule", () => ({
  __esModule: true,
  CastNative: require("@/test-utils/cast").castDoubleModule(() => mockCast),
}));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock("@/utils/log", () => ({ logAndCaptureError: jest.fn() }));
/** The glyphs the button drew, latest last. */
const mockIcons: { name: string; tintColor?: string }[] = [];
jest.mock("./common/HeaderIcon", () => ({
  HeaderIcon: (props: { name: string; tintColor?: string }) => {
    mockIcons.push(props);
    return null;
  },
}));

beforeEach(() => {
  mockCast = createCastDoubleState();
  mockIcons.length = 0;
});

// Connected, the button takes the app's purple and the connected glyph, as the
// SDK's own button did, and a screen reader hears the state with its name.
test("a connected session shows the connected glyph in the app's purple", async () => {
  await render(<Chromecast />);
  expect(mockIcons.at(-1)).toEqual({
    name: "castConnected",
    tintColor: Colors.primary,
  });
  expect(
    screen.getByLabelText("accessibility.cast_button").props.accessibilityValue,
  ).toEqual({ text: "accessibility.cast_connected" });
});

test("without a session the button keeps the plain glyph", async () => {
  mockCast.castState = "notConnected";
  setCastSession(mockCast, null);
  await render(<Chromecast />);
  expect(mockIcons.at(-1)).toEqual({ name: "cast" });
  expect(
    screen.getByLabelText("accessibility.cast_button").props.accessibilityValue,
  ).toBeUndefined();
});

test("the glyph follows the session as it connects", async () => {
  mockCast.castState = "notConnected";
  setCastSession(mockCast, null);
  await render(<Chromecast />);
  await waitFor(() =>
    expect(mockCast.listeners.onCastStateChanged.length).toBeGreaterThan(0),
  );
  await act(async () => {
    mockCast.castState = "connected";
    emitCastEvent(mockCast, "onCastStateChanged", { state: "connected" });
  });
  expect(mockIcons.at(-1)?.name).toBe("castConnected");
});

// The header shows a bare glyph: a screen reader needs the button's name, and
// the bench's flows tap it by that name rather than by its position.
test("the header button is named for assistive tech", async () => {
  await render(<Chromecast />);
  expect(screen.getByLabelText("accessibility.cast_button")).toBeTruthy();
});

test("mounting starts discovery, with no hidden Cast button", async () => {
  await render(<Chromecast />);
  await waitFor(() => expect(mockCast.discoveryCalls).toBe(1));
});

test("a press opens the Cast dialog while nothing plays", async () => {
  await render(<Chromecast />);
  await fireEvent.press(screen.getByLabelText("accessibility.cast_button"));
  await waitFor(() => expect(mockCast.dialogs).toEqual(["cast"]));
});

test("a press opens the expanded controls while the receiver plays", async () => {
  setCastSession(mockCast, "session-1");
  await render(<Chromecast />);
  const button = screen.getByLabelText("accessibility.cast_button");
  // The status arrives after mount, through the module's listener.
  await waitFor(() =>
    expect(mockCast.listeners.onMediaStatusChanged).toHaveLength(1),
  );
  await act(async () => {
    emitCastEvent(mockCast, "onMediaStatusChanged", {
      status: {
        playerState: "playing",
        currentItemId: 1,
        streamPosition: 12,
        playbackRate: 1,
        volume: 1,
        isMuted: false,
        mediaInfo: null,
        customData: null,
      },
    });
  });
  await fireEvent.press(button);
  await waitFor(() => expect(mockCast.dialogs).toEqual(["expandedControls"]));
});

import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { getDefaultStore } from "jotai";
import { Platform } from "react-native";
import { Colors } from "@/constants/Colors";
import {
  type CastDoubleState,
  castDoubleTarget,
  createCastDoubleState,
  emitCastEvent,
  emitRemoteTarget,
} from "@/test-utils/cast";
import { apiAtom, userAtom } from "@/utils/atoms/api";
import { measureInWindow } from "@/utils/cast/measureInWindow";
import { OutputButton } from "./OutputButton";

let mockCast: CastDoubleState = createCastDoubleState();
jest.mock("@/modules/mpv-player/src/cast/CastModule", () => ({
  __esModule: true,
  CastNative: require("@/test-utils/cast").castDoubleModule(() => mockCast),
}));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock("@/utils/atoms/api", () => {
  const { atom } = jest.requireActual("jotai");
  return {
    apiAtom: atom({ basePath: "http://server" }),
    userAtom: atom({ Id: "user-1" }),
  };
});
jest.mock("@/utils/log", () => ({ logAndCaptureError: jest.fn() }));
let mockOffline = false;
jest.mock("@/providers/OfflineModeProvider", () => ({
  useOfflineMode: () => mockOffline,
}));
let mockPlayingHere: string | null = null;
jest.mock("@/utils/cast/playingHere", () => ({
  musicPlayingHere: jest.fn(async () => mockPlayingHere),
}));
const mockAnchor = { x: 312, y: 48, width: 44, height: 44 };
const MOCK_TAG = 42;
jest.mock("@/utils/cast/measureInWindow", () => ({
  measureInWindow: jest.fn(async () => mockAnchor),
  nativeTagOf: jest.fn(() => MOCK_TAG),
}));
/** The glyphs the button drew, latest last. */
const mockIcons: { name: string; tintColor?: string }[] = [];
jest.mock("@/components/common/HeaderIcon", () => ({
  HeaderIcon: (props: { name: string; tintColor?: string }) => {
    mockIcons.push(props);
    return null;
  },
}));

const LABEL = "accessibility.cast_button";
const session = { basePath: "http://server" };

beforeEach(() => {
  mockCast = createCastDoubleState();
  mockOffline = false;
  mockPlayingHere = null;
  mockIcons.length = 0;
  getDefaultStore().set(apiAtom, session as never);
  getDefaultStore().set(userAtom, { Id: "user-1" } as never);
});

afterEach(() => {
  jest.restoreAllMocks();
});

test("hidden on TV", async () => {
  jest.spyOn(Platform, "isTV", "get").mockReturnValue(true);
  await render(<OutputButton />);
  expect(screen.queryByLabelText(LABEL)).toBeNull();
});

test("hidden offline", async () => {
  mockOffline = true;
  await render(<OutputButton />);
  expect(screen.queryByLabelText(LABEL)).toBeNull();
});

// A header renders outside its page's offline provider: the page says it is offline.
test("hidden on a page that says it is offline", async () => {
  await render(<OutputButton offline />);
  expect(screen.queryByLabelText(LABEL)).toBeNull();
});

test("hidden on Catalyst", async () => {
  jest
    .spyOn(
      Platform as { readonly isMacCatalyst: boolean },
      "isMacCatalyst",
      "get",
    )
    .mockReturnValue(true);
  await render(<OutputButton />);
  expect(screen.queryByLabelText(LABEL)).toBeNull();
});

// A sign-out can land while the button measures itself: the sheet then stays closed.
test("a sign-out while it opens shows no sheet", async () => {
  let measured: (frame: typeof mockAnchor) => void = () => undefined;
  (measureInWindow as jest.Mock).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        measured = resolve;
      }),
  );
  await render(<OutputButton />);
  await act(async () => {
    fireEvent.press(screen.getByLabelText(LABEL));
  });
  await act(async () => {
    getDefaultStore().set(userAtom, null as never);
    measured(mockAnchor);
  });
  expect(mockCast.outputPickerCalls).toHaveLength(0);
});

// The page can go while the button measures itself, the button with it: the sheet stays closed rather than open
// over the next screen.
test("a button gone while it opens shows no sheet", async () => {
  let measured: (frame: typeof mockAnchor) => void = () => undefined;
  (measureInWindow as jest.Mock).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        measured = resolve;
      }),
  );
  const { unmount } = await render(<OutputButton />);
  await act(async () => {
    fireEvent.press(screen.getByLabelText(LABEL));
  });
  // The navigation commits first; the native read answers after.
  await act(async () => {
    unmount();
  });
  await act(async () => {
    measured(mockAnchor);
  });
  expect(mockCast.outputPickerCalls).toHaveLength(0);
});

// Without a server there is nothing to play anywhere: no button, so no sheet.
test("hidden without a server session", async () => {
  getDefaultStore().set(apiAtom, null as never);
  await render(<OutputButton />);
  expect(screen.queryByLabelText(LABEL)).toBeNull();
});

// Connected, the button takes the app's purple and the connected glyph, and a
// screen reader hears the state with its name.
test("tinted and labelled when connected", async () => {
  mockCast.remoteTarget = castDoubleTarget("connected");
  await render(<OutputButton />);
  expect(mockIcons.at(-1)).toEqual({
    name: "castConnected",
    tintColor: Colors.primary,
  });
  expect(screen.getByLabelText(LABEL).props.accessibilityValue).toEqual({
    text: "accessibility.cast_connected",
  });
});

// Always a value: React Native Android clears the whole content description,
// label included, once the value turns undefined.
test("keeps a value when nothing is connected", async () => {
  await render(<OutputButton />);
  expect(mockIcons.at(-1)).toEqual({ name: "cast" });
  expect(screen.getByLabelText(LABEL).props.accessibilityValue).toEqual({
    text: "accessibility.cast_not_connected",
  });
});

test("shows the indicator while connecting", async () => {
  await render(<OutputButton />);
  await act(async () =>
    emitRemoteTarget(mockCast, castDoubleTarget("connecting")),
  );
  expect(screen.getByTestId("output-button-connecting")).toBeTruthy();
  await act(async () =>
    emitRemoteTarget(mockCast, castDoubleTarget("connected")),
  );
  expect(screen.queryByTestId("output-button-connecting")).toBeNull();
  expect(mockIcons.at(-1)?.name).toBe("castConnected");
});

// A screen reader hears the connection under way, as the indicator shows it.
test("says it is connecting while it connects", async () => {
  await render(<OutputButton />);
  await act(async () =>
    emitRemoteTarget(mockCast, castDoubleTarget("connecting")),
  );
  expect(screen.getByLabelText(LABEL).props.accessibilityValue).toEqual({
    text: "cast.output.connecting",
  });
});

test("passes its window position as the anchor", async () => {
  await render(<OutputButton />);
  await act(async () => fireEvent.press(screen.getByLabelText(LABEL)));
  expect(mockCast.outputPickerCalls).toHaveLength(1);
  expect(mockCast.outputPickerCalls[0].anchor).toEqual(mockAnchor);
  expect(mockCast.outputPickerCalls[0].strings.title).toBe("cast.output.title");
});

// The popover follows the button's own view when the window turns; the frame is the fallback.
test("passes its native view for the popover to follow", async () => {
  await render(<OutputButton />);
  await act(async () => fireEvent.press(screen.getByLabelText(LABEL)));
  expect(mockCast.outputPickerCalls[0].anchorTag).toBe(MOCK_TAG);
});

test("passes what the music player plays here", async () => {
  mockPlayingHere = "Bonus 1";
  await render(<OutputButton />);
  await act(async () => fireEvent.press(screen.getByLabelText(LABEL)));
  expect(mockCast.outputPickerCalls[0].playingHere).toBe("Bonus 1");
});

// Two buttons on screen, one remote asked: the expanded controls open once.
test("remote opens the expanded controls", async () => {
  await render(
    <>
      <OutputButton />
      <OutputButton />
    </>,
  );
  await act(async () => fireEvent.press(screen.getAllByLabelText(LABEL)[0]));
  await act(async () =>
    emitCastEvent(mockCast, "onOutputPickerAction", { action: "remote" }),
  );
  expect(mockCast.dialogs).toEqual(["expandedControls"]);
});

// The sheet starts discovery when it opens; a button on screen costs no scan.
test("starts no discovery on mount", async () => {
  await render(<OutputButton />);
  expect(mockCast.discoveryCalls).toBe(0);
});

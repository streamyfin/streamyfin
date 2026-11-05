import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { getDefaultStore } from "jotai";
import { Platform, type PlatformIOSStatic } from "react-native";
import { Colors } from "@/constants/Colors";
import type { CastMediaStatus } from "@/modules/mpv-player/src/cast";
import {
  type CastDoubleState,
  castDoubleTarget,
  createCastDoubleState,
  emitCastEvent,
  emitRemoteTarget,
} from "@/test-utils/cast";
import { apiAtom, userAtom } from "@/utils/atoms/api";
import { measureInWindow } from "@/utils/cast/measureInWindow";
import { logAndCaptureError } from "@/utils/log";
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
let mockSyncPlayEnabled = false;
jest.mock("@/providers/SyncPlayProvider", () => ({
  useSyncPlay: () => ({ enabled: mockSyncPlayEnabled }),
}));
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
const mockPlayMedia = jest.fn(async (..._args: unknown[]) => undefined);
jest.mock("@/hooks/usePlayMedia", () => ({
  usePlayMedia: () => mockPlayMedia,
}));
const mockGetUserItemData = jest.fn();
jest.mock("@/utils/jellyfin/user-library/getUserItemData", () => ({
  getUserItemData: (...args: unknown[]) => mockGetUserItemData(...args),
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
  mockSyncPlayEnabled = false;
  mockPlayingHere = null;
  mockIcons.length = 0;
  mockPlayMedia.mockClear();
  mockGetUserItemData.mockReset();
  jest.mocked(logAndCaptureError).mockClear();
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
    .spyOn(Platform as PlatformIOSStatic, "isMacCatalyst", "get")
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

const receiverPlaying = (
  customData: Record<string, unknown>,
): CastMediaStatus => ({
  playerState: "playing",
  currentItemId: 1,
  streamPosition: 125.5,
  playbackRate: 1,
  volume: 1,
  isMuted: false,
  mediaInfo: { contentId: null, customData, metadata: null },
  customData: null,
});

const continueHereFromTheSheet = async () => {
  await render(<OutputButton />);
  await act(async () => fireEvent.press(screen.getByLabelText(LABEL)));
  await act(async () =>
    emitCastEvent(mockCast, "onOutputPickerAction", { action: "playHere" }),
  );
};

// The receiver forgets its item once stopped: it is read first, then stopped, and the phone plays it from there.
test("continue here stops the receiver, then plays here where it was", async () => {
  mockCast.mediaStatus = receiverPlaying({
    itemId: "item-1",
    mediaSourceId: "source-1",
    audioStreamIndex: 2,
    subtitleStreamIndex: 3,
    canClientSeek: true,
  });
  mockGetUserItemData.mockResolvedValue({
    Id: "item-1",
    Type: "Episode",
    MediaType: "Video",
  });
  const stopsBeforePlay: number[] = [];
  mockPlayMedia.mockImplementationOnce(async () => {
    stopsBeforePlay.push(mockCast.disconnectCalls.length);
  });

  await continueHereFromTheSheet();

  expect(mockCast.disconnectCalls).toEqual([true]);
  expect(stopsBeforePlay).toEqual([1]);
  expect(mockPlayMedia).toHaveBeenCalledWith(
    {
      itemId: "item-1",
      mediaSourceId: "source-1",
      audioIndex: 2,
      subtitleIndex: 3,
      playbackPositionTicks: 1_255_000_000,
      offline: false,
    },
    { item: expect.objectContaining({ Id: "item-1" }) },
  );
});

// The status held is the receiver's last report, which falls behind while it plays on (bench, 05/11: 19 s): the
// phone asks the receiver where it is now.
test("continue here goes on from where the receiver says it is when asked", async () => {
  mockCast.mediaStatus = receiverPlaying({
    itemId: "item-1",
    canClientSeek: true,
  });
  mockCast.freshMediaStatus = {
    ...receiverPlaying({ itemId: "item-1", canClientSeek: true }),
    streamPosition: 177.4,
  };
  mockGetUserItemData.mockResolvedValue({
    Id: "item-1",
    Type: "Episode",
    MediaType: "Video",
  });

  await continueHereFromTheSheet();

  expect(mockPlayMedia).toHaveBeenCalledWith(
    expect.objectContaining({ playbackPositionTicks: 1_774_000_000 }),
    expect.anything(),
  );
});

test("an item this server does not know only stops the receiver", async () => {
  mockCast.mediaStatus = receiverPlaying({
    itemId: "elsewhere-1",
    canClientSeek: true,
  });
  mockGetUserItemData.mockRejectedValue(
    Object.assign(new Error("Request failed with status code 404"), {
      response: { status: 404 },
    }),
  );

  await continueHereFromTheSheet();

  expect(mockCast.disconnectCalls).toEqual([true]);
  expect(mockPlayMedia).not.toHaveBeenCalled();
  expect(logAndCaptureError).not.toHaveBeenCalled();
});

// A lookup that fails otherwise (a timeout, a server error) leaves nothing playing: it is reported.
test("an item lookup that fails is reported", async () => {
  mockCast.mediaStatus = receiverPlaying({
    itemId: "item-1",
    canClientSeek: true,
  });
  mockGetUserItemData.mockRejectedValue(
    Object.assign(new Error("Request failed with status code 503"), {
      response: { status: 503 },
    }),
  );

  await continueHereFromTheSheet();

  expect(mockPlayMedia).not.toHaveBeenCalled();
  expect(logAndCaptureError).toHaveBeenCalledTimes(1);
});

// The tap was for the receiver that was asked: another one by its answer is neither stopped nor played here.
test("a receiver switched while it was asked is left alone", async () => {
  mockCast.mediaStatus = receiverPlaying({
    itemId: "item-1",
    canClientSeek: true,
  });
  mockCast.renewSessionOnStatusRequest = true;

  await continueHereFromTheSheet();

  expect(mockCast.disconnectCalls).toEqual([]);
  expect(mockPlayMedia).not.toHaveBeenCalled();
});

// The receiver's item belonged to the account that asked: another one by the end of the lookup plays nothing.
test("an account switched during the lookup plays nothing here", async () => {
  mockCast.mediaStatus = receiverPlaying({
    itemId: "item-1",
    canClientSeek: true,
  });
  mockGetUserItemData.mockImplementation(async () => {
    getDefaultStore().set(userAtom, { Id: "user-2" } as never);
    return { Id: "item-1", Type: "Episode", MediaType: "Video" };
  });

  await continueHereFromTheSheet();

  expect(mockPlayMedia).not.toHaveBeenCalled();
});

// A SyncPlay member plays the group's video: the sheet offers no Continue here, and this device only stops the
// receiver.
test("the sheet offers Continue here outside a SyncPlay group only", async () => {
  const view = await render(<OutputButton />);
  await act(async () => fireEvent.press(screen.getByLabelText(LABEL)));
  mockSyncPlayEnabled = true;
  await view.rerender(<OutputButton />);
  await act(async () => fireEvent.press(screen.getByLabelText(LABEL)));

  expect(mockCast.outputPickerCalls.map((call) => call.playHere)).toEqual([
    true,
    false,
  ]);
});

// Music comes back to the phone with its queue in B4: until then the receiver only stops.
test("music on the receiver only stops it", async () => {
  mockCast.mediaStatus = receiverPlaying({
    itemId: "track-1",
    canClientSeek: true,
  });
  mockGetUserItemData.mockResolvedValue({
    Id: "track-1",
    Type: "Audio",
    MediaType: "Audio",
  });

  await continueHereFromTheSheet();

  expect(mockCast.disconnectCalls).toEqual([true]);
  expect(mockPlayMedia).not.toHaveBeenCalled();
});

// The sheet starts discovery when it opens; a button on screen costs no scan.
test("starts no discovery on mount", async () => {
  await render(<OutputButton />);
  expect(mockCast.discoveryCalls).toBe(0);
});

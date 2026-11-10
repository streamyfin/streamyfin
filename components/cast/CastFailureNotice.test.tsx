import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { act, render } from "@testing-library/react-native";
import { getDefaultStore } from "jotai";
import {
  Alert,
  type AlertButton,
  AppState,
  type AppStateStatus,
} from "react-native";
import type { CastMediaStatus } from "@/modules/mpv-player/src/cast";
import {
  type CastDoubleState,
  castDoubleDevice,
  createCastDoubleState,
  setCastSession,
} from "@/test-utils/cast";
import { userAtom } from "@/utils/atoms/api";
import { effectiveSettingsAtom } from "@/utils/atoms/settings";
import { choosePlay, currentPlayChoice } from "@/utils/cast/playTarget";
import { type LoadedCast, watchLoadedCast } from "@/utils/cast/watchLoadedCast";
import { logAndCaptureError, writeErrorLog } from "@/utils/log";
import { secondsToTicks } from "@/utils/time";
import { CastFailureNotice } from "./CastFailureNotice";

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
  return { userAtom: atom({ Id: "user-1" }) };
});
jest.mock("@/utils/log", () => ({
  logAndCaptureError: jest.fn(),
  writeErrorLog: jest.fn(),
}));
jest.mock("@/utils/atoms/settings", () => {
  const { atom } = jest.requireActual("jotai");
  return { effectiveSettingsAtom: atom({}) };
});
let mockSyncPlayEnabled = false;
jest.mock("@/providers/SyncPlayProvider", () => ({
  useSyncPlay: () => ({ enabled: mockSyncPlayEnabled }),
}));
const mockPlayMedia = jest.fn(async (..._args: unknown[]) => undefined);
jest.mock("@/hooks/usePlayMedia", () => ({
  usePlayMedia: () => mockPlayMedia,
}));

/** A remote media client whose status updates the test emits. */
const makeClient = () => {
  let listener: ((status: CastMediaStatus | null) => void) | undefined;
  return {
    sessionId: "session-1",
    onMediaStatusUpdated: (handler: typeof listener) => {
      listener = handler;
      return { remove: () => (listener = undefined) };
    },
    emit: (next: CastMediaStatus | null) => listener?.(next),
  };
};

const idleOnError: CastMediaStatus = {
  playerState: "idle",
  idleReason: "error",
  currentItemId: 1,
  streamPosition: 0,
  playbackRate: 1,
  volume: 1,
  isMuted: false,
  mediaInfo: {
    contentId: "item-1",
    customData: { itemId: "item-1", playSessionId: "play-1" },
    metadata: null,
  },
  customData: null,
};

const film = {
  Id: "item-1",
  Name: "Festen",
  Type: "Movie",
  MediaType: "Video",
} as BaseItemDto;

const loaded = (overrides: Partial<LoadedCast> = {}): LoadedCast => ({
  item: film,
  sent: {
    itemId: "item-1",
    mediaSourceId: "source-1",
    audioIndex: 1,
    subtitleIndex: 2,
    playbackPositionTicks: secondsToTicks(600),
  },
  receiverName: "Salon - Chromecast",
  playSessionId: "play-1",
  choice: currentPlayChoice(),
  userId: "user-1",
  ...overrides,
});

let stopWatching = () => {};

/** The receiver stops with an error on a load followed since it loaded. */
const receiverFailsOn = async (
  load: LoadedCast = loaded(),
  before: () => void = () => {},
) => {
  const client = makeClient();
  stopWatching = watchLoadedCast(client, load);
  before();
  await act(async () => client.emit(idleOnError));
};

const alertButtons = (): AlertButton[] =>
  jest.mocked(Alert.alert).mock.calls[0]?.[2] ?? [];

beforeEach(() => {
  mockCast = createCastDoubleState();
  setCastSession(mockCast, "session-1", castDoubleDevice());
  mockSyncPlayEnabled = false;
  getDefaultStore().set(effectiveSettingsAtom as never, {} as never);
  getDefaultStore().set(userAtom, { Id: "user-1" } as never);
  mockPlayMedia.mockReset().mockResolvedValue(undefined);
  jest
    .spyOn(Alert, "alert")
    .mockReset()
    .mockImplementation(() => undefined);
  jest.mocked(logAndCaptureError).mockClear();
  jest.mocked(writeErrorLog).mockClear();
  appStateListeners = [];
  Object.defineProperty(AppState, "currentState", {
    value: "active",
    writable: true,
    configurable: true,
  });
  jest.spyOn(AppState, "addEventListener").mockImplementation((_, listener) => {
    appStateListeners.push(listener);
    return {
      remove: () => {
        appStateListeners = appStateListeners.filter((l) => l !== listener);
      },
    } as never;
  });
});

afterEach(() => stopWatching());

const originalAppState = Object.getOwnPropertyDescriptor(
  AppState,
  "currentState",
);
afterAll(() => {
  if (originalAppState)
    Object.defineProperty(AppState, "currentState", originalAppState);
});

let appStateListeners: ((state: AppStateStatus) => void)[] = [];

/** The app goes to `state`, as AppState reports it. */
const appGoes = async (state: AppStateStatus) => {
  AppState.currentState = state;
  await act(async () => {
    for (const listener of appStateListeners) listener(state);
  });
};

test("a video the receiver fails on says so and offers to play it here", async () => {
  await render(<CastFailureNotice />);
  await receiverFailsOn();

  expect(Alert.alert).toHaveBeenCalledTimes(1);
  const [title, message] = jest.mocked(Alert.alert).mock.calls[0];
  expect(title).toBe("cast.output.receiver_failed_title");
  expect(message).toBe(
    "cast.output.receiver_failed cast.output.receiver_failed_play_here",
  );
  expect(alertButtons().map((button) => button.text)).toEqual([
    "common.ok",
    "player.play_here",
  ]);
  expect(writeErrorLog).toHaveBeenCalledTimes(1);
});

// The receiver never played it: here it starts where it was sent from, at this device's default quality.
test("play here plays the video here where the receiver was to start it", async () => {
  getDefaultStore().set(
    effectiveSettingsAtom as never,
    { defaultBitrate: { key: "8 Mb/s", value: 8_000_000 } } as never,
  );
  await render(<CastFailureNotice />);
  await receiverFailsOn();

  await act(async () => alertButtons()[1].onPress?.());

  expect(mockPlayMedia).toHaveBeenCalledWith(
    {
      itemId: "item-1",
      mediaSourceId: "source-1",
      audioIndex: 1,
      subtitleIndex: 2,
      playbackPositionTicks: secondsToTicks(600),
      bitrateValue: 8_000_000,
      offline: false,
    },
    { item: film },
  );
});

test("a play here that fails is reported", async () => {
  mockPlayMedia.mockRejectedValueOnce(new Error("no stream"));
  await render(<CastFailureNotice />);
  await receiverFailsOn();

  await act(async () => alertButtons()[1].onPress?.());

  expect(logAndCaptureError).toHaveBeenCalledTimes(1);
});

// Played here or elsewhere since the load: the receiver's failure is old news, and its alert would cover the player.
test("says nothing once a later play was chosen", async () => {
  await render(<CastFailureNotice />);
  await receiverFailsOn(loaded(), () => choosePlay());

  expect(Alert.alert).not.toHaveBeenCalled();
});

test("says nothing to another account", async () => {
  await render(<CastFailureNotice />);
  await receiverFailsOn(loaded(), () =>
    getDefaultStore().set(userAtom, { Id: "user-2" } as never),
  );

  expect(Alert.alert).not.toHaveBeenCalled();
});

// A member plays the group's video, and an audio item goes on in the music player: neither gets Play here.
test.each([
  ["in a SyncPlay group", () => (mockSyncPlayEnabled = true), film],
  [
    "for an audio item",
    () => {},
    { ...film, MediaType: "Audio" } as BaseItemDto,
  ],
])("only says so %s", async (_label, setUp, item) => {
  setUp();
  await render(<CastFailureNotice />);
  await receiverFailsOn(loaded({ item }));

  const [, message] = jest.mocked(Alert.alert).mock.calls[0];
  expect(message).toBe("cast.output.receiver_failed");
  expect(alertButtons().map((button) => button.text)).toEqual(["common.ok"]);
});

// On Android the Cast remote is an activity of its own, which pauses the app's: an alert asked for then is lost
// (React Native keeps it on a helper it throws away), so it waits for the app to be back.
test("a failure while the app is away says so once it is back", async () => {
  await render(<CastFailureNotice />);
  await appGoes("background");
  await receiverFailsOn();

  expect(Alert.alert).not.toHaveBeenCalled();

  await appGoes("active");
  expect(Alert.alert).toHaveBeenCalledTimes(1);

  await appGoes("background");
  await appGoes("active");
  expect(Alert.alert).toHaveBeenCalledTimes(1);
});

test("a failure gone stale while the app was away says nothing", async () => {
  await render(<CastFailureNotice />);
  await appGoes("background");
  await receiverFailsOn();
  choosePlay();

  await appGoes("active");

  expect(Alert.alert).not.toHaveBeenCalled();
});

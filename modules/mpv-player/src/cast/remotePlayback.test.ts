import { act, renderHook } from "@testing-library/react-native";
import {
  type CastDoubleState,
  createCastDoubleState,
  emitCastEvent,
} from "@/test-utils/cast";
import {
  NO_REMOTE_PLAYBACK,
  type ReceiverServerRecord,
  type RemotePlaybackState,
} from "./Cast.types";
import {
  onRemotePlaybackChanged,
  remotePlayback,
  setRemoteServer,
  useRemotePlayback,
} from "./remotePlayback";

let mockCast: CastDoubleState = createCastDoubleState();
// A bundle without the native module (web) keeps CastNative null.
let mockMissing = false;
jest.mock("@/modules/mpv-player/src/cast/CastModule", () => {
  const double = require("@/test-utils/cast").castDoubleModule(() => mockCast);
  return {
    __esModule: true,
    get CastNative() {
      return mockMissing ? null : double;
    },
  };
});

const playing: RemotePlaybackState = {
  connected: true,
  phase: "playing",
  reconnecting: false,
  itemId: "episode-1",
  positionSec: 42.5,
  durationSec: 1320,
  audioIndex: 1,
  subtitleIndex: 3,
  queueItemIds: ["episode-1", "episode-2"],
  playingIndex: 0,
};

const server: ReceiverServerRecord = {
  serverAddress: "https://jellyfin.example.test",
  accessToken: "tok-123",
  userId: "user-1",
  receiverName: "Living Room TV",
};

beforeEach(() => {
  mockCast = createCastDoubleState();
  mockMissing = false;
});

test("remotePlayback reads the native snapshot", () => {
  expect(remotePlayback()).toEqual(NO_REMOTE_PLAYBACK);
  mockCast.remotePlayback = playing;
  expect(remotePlayback()).toEqual(playing);
});

test("useRemotePlayback follows the event", async () => {
  mockCast.remotePlayback = playing;
  const { result, unmount } = await renderHook(() => useRemotePlayback());
  expect(result.current).toEqual(playing);
  const paused = { ...playing, phase: "paused" as const, positionSec: 50 };
  await act(async () =>
    emitCastEvent(mockCast, "onRemotePlaybackChanged", paused),
  );
  expect(result.current).toEqual(paused);
  await unmount();
  expect(mockCast.listeners.onRemotePlaybackChanged).toHaveLength(0);
});

test("onRemotePlaybackChanged hears each new state until removed", () => {
  const heard: RemotePlaybackState[] = [];
  const subscription = onRemotePlaybackChanged((state) => heard.push(state));
  emitCastEvent(mockCast, "onRemotePlaybackChanged", playing);
  subscription.remove();
  emitCastEvent(mockCast, "onRemotePlaybackChanged", NO_REMOTE_PLAYBACK);
  expect(heard).toEqual([playing]);
});

test("setRemoteServer sends the envelope to native", async () => {
  await setRemoteServer(server);
  await setRemoteServer(null);
  expect(mockCast.remoteServerCalls).toEqual([server, null]);
});

test("nothing happens without the module", async () => {
  mockMissing = true;
  mockCast.remotePlayback = playing;
  expect(remotePlayback()).toEqual(NO_REMOTE_PLAYBACK);
  await expect(setRemoteServer(server)).resolves.toBeUndefined();
  const subscription = onRemotePlaybackChanged(() => {});
  subscription.remove();
  expect(mockCast.remoteServerCalls).toEqual([]);
  expect(mockCast.listeners.onRemotePlaybackChanged).toHaveLength(0);
});

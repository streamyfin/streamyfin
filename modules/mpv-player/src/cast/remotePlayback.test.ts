import { act, renderHook } from "@testing-library/react-native";
import {
  type CastDoubleState,
  createCastDoubleState,
  emitCastEvent,
} from "@/test-utils/cast";
import {
  NO_REMOTE_PLAYBACK,
  type ReceiverPlayRequest,
  type ReceiverServerRecord,
  type RemotePlaybackState,
} from "./Cast.types";
import {
  loadOnReceiver,
  onRemotePlaybackChanged,
  reloadOnReceiver,
  remotePlayback,
  setRemoteAudioTrack,
  setRemoteServer,
  setRemoteSubtitleTrack,
  skipOnReceiver,
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
  foreign: false,
  title: "Episode 1",
  imageUrl: null,
  playMethod: "DirectPlay",
};

const server: ReceiverServerRecord = {
  serverAddress: "https://jellyfin.example.test",
  accessToken: "tok-123",
  userId: "user-1",
  receiverName: "Living Room TV",
};

const request: ReceiverPlayRequest = {
  items: [{ id: "episode-1", name: "Pilot", type: "Episode", isFolder: false }],
  startPositionTicks: 600_000_000,
  audioStreamIndex: 1,
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

test("loadOnReceiver answers the native outcome", async () => {
  const capped = { ...server, maxBitrate: 8_000_000 };
  mockCast.loadAnswer = { outcome: "failed", error: "playback_failed" };
  await expect(loadOnReceiver(capped, request)).resolves.toEqual({
    outcome: "failed",
    error: "playback_failed",
  });
  mockCast.loadAnswer = { outcome: "loaded" };
  await expect(loadOnReceiver(capped, request)).resolves.toEqual({
    outcome: "loaded",
  });
  expect(mockCast.loadCalls).toEqual([
    { server: capped, request },
    { server: capped, request },
  ]);
});

test("reloadOnReceiver hands native the server", async () => {
  await reloadOnReceiver({ ...server, maxBitrate: 4_000_000 });
  expect(mockCast.reloadCalls).toEqual([{ ...server, maxBitrate: 4_000_000 }]);
});

test("reloadOnReceiver hands native the subtitle it names, null without one", async () => {
  await reloadOnReceiver(server);
  await reloadOnReceiver(server, { subtitleStreamIndex: 9 });
  expect(mockCast.reloadSubtitles).toEqual([null, 9]);
});

test("a track choice hands native its Jellyfin index", async () => {
  await setRemoteAudioTrack(2);
  await setRemoteSubtitleTrack(-1);
  expect(mockCast.trackCalls).toEqual([
    { kind: "audio", index: 2 },
    { kind: "subtitle", index: -1 },
  ]);
});

test("skipOnReceiver hands native the direction", async () => {
  await skipOnReceiver("next");
  await skipOnReceiver("previous");
  expect(mockCast.skipCalls).toEqual(["next", "previous"]);
});

test("it answers notSent without the module", async () => {
  mockMissing = true;
  const result = await loadOnReceiver(server, request);
  expect(result.outcome).toBe("notSent");
  expect(result.error).toEqual(expect.any(String));
  await expect(reloadOnReceiver(server)).resolves.toBeUndefined();
  await expect(skipOnReceiver("next")).resolves.toBeUndefined();
  expect(mockCast.loadCalls).toEqual([]);
  expect(mockCast.reloadCalls).toEqual([]);
});

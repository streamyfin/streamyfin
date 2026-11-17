import type { Api } from "@jellyfin/sdk";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import { act, render } from "@testing-library/react-native";
import { getDefaultStore } from "jotai";
import type { RemoteTargetState } from "@/modules/mpv-player/src/cast/Cast.types";
import {
  type CastDoubleState,
  createCastDoubleState,
  emitRemoteTarget,
  setCastSession,
} from "@/test-utils/cast";
import {
  createNativePlayerDoubleState,
  emitNativePlayerEvent,
  type NativePlayerDoubleState,
} from "@/test-utils/nativePlayer";
import { stubReactNative } from "@/test-utils/reactNative";
import { apiAtom, userAtom } from "@/utils/atoms/api";
import { remotePlayAtom } from "@/utils/atoms/remotePlayer";
import { RemotePlayerController } from "./RemotePlayerController";

let mockCast: CastDoubleState = createCastDoubleState();
jest.mock("@/modules/mpv-player/src/cast/CastModule", () => ({
  __esModule: true,
  CastNative: require("@/test-utils/cast").castDoubleModule(() => mockCast),
}));
let mockPlayer: NativePlayerDoubleState = createNativePlayerDoubleState();
jest.mock("@/modules/mpv-player/src/NativePlayerModule", () => ({
  __esModule: true,
  NativePlayerNativeModule:
    require("@/test-utils/nativePlayer").nativePlayerDoubleModule(
      () => mockPlayer,
    ),
}));
let mockRouted = true;
jest.mock("@/utils/cast/remotePlayerGate", () => ({
  remotePlayerRouted: () => mockRouted,
}));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock("@/providers/SyncPlayProvider", () => ({
  useSyncPlay: () => ({ enabled: false }),
}));
const mockPlayMedia = jest.fn(async (..._args: unknown[]) => undefined);
jest.mock("@/hooks/usePlayMedia", () => ({
  usePlayMedia: () => mockPlayMedia,
}));
jest.mock("@/utils/log", () => ({
  logAndCaptureError: jest.fn(),
  writeErrorLog: jest.fn(),
}));

const livingRoom = {
  kind: "cast" as const,
  id: "4f0c2b9d8e7a6b5c4d3e2f1a0b9c8d7e",
  name: "Living Room TV",
  capabilities: { volume: true },
};
const connected: RemoteTargetState = {
  state: "connected",
  target: livingRoom,
  reconnecting: false,
  error: null,
  volume: 1,
  muted: false,
  errorCode: null,
  failedTarget: null,
};

const episode: BaseItemDto = {
  Id: "episode-1",
  Name: "Pilot",
  Type: "Episode",
  MediaType: "Video",
};
const play = {
  item: episode,
  positionTicks: 600_000_000,
  mediaSourceId: "source-1",
  audioIndex: 1,
  subtitleIndex: 2,
};

const store = getDefaultStore();
const signIn = () => {
  store.set(apiAtom, {
    basePath: "https://jellyfin.example.test",
    accessToken: "tok-123",
  } as Api);
  store.set(userAtom, { Id: "user-1" });
};
const envelope = {
  serverAddress: "https://jellyfin.example.test",
  accessToken: "tok-123",
  userId: "user-1",
  receiverName: "Living Room TV",
};

beforeEach(() => {
  mockCast = createCastDoubleState();
  mockCast.remoteTarget = connected;
  setCastSession(mockCast, "session-1");
  mockPlayer = createNativePlayerDoubleState();
  mockRouted = true;
  mockPlayMedia.mockClear();
  stubReactNative({ OS: "android" });
  store.set(remotePlayAtom, null);
  signIn();
});

test("the controller gives native the server when the gate is open", async () => {
  await render(<RemotePlayerController />);
  expect(mockCast.remoteServerCalls).toEqual([envelope]);
});

test("it gives nothing in a release build", async () => {
  mockRouted = false;
  await render(<RemotePlayerController />);
  expect(mockCast.remoteServerCalls).toEqual([]);
});

test("it clears the server on sign out", async () => {
  await render(<RemotePlayerController />);
  await act(async () => {
    store.set(apiAtom, null);
    store.set(userAtom, null);
  });
  expect(mockCast.remoteServerCalls.at(-1)).toBeNull();
});

// The receiver names its Jellyfin device from the envelope of every message: a new TV gets its own name.
test("another receiver gets the server again under its name", async () => {
  await render(<RemotePlayerController />);
  await act(async () => {
    emitRemoteTarget(mockCast, {
      ...connected,
      target: { ...livingRoom, id: "9a8b7c6d", name: "Bedroom TV" },
    });
  });
  expect(mockCast.remoteServerCalls.at(-1)).toMatchObject({
    receiverName: "Bedroom TV",
  });
});

// A suspended session (the app in the background on iOS) has no session in JS, while the hub keeps its target
// reconnecting: the server must not change, or native drops the engine the open screen holds.
test("a suspended session keeps the server it had", async () => {
  await render(<RemotePlayerController />);
  await act(async () => {
    emitRemoteTarget(mockCast, {
      ...connected,
      state: "connecting",
      reconnecting: true,
    });
  });
  expect(mockCast.remoteServerCalls).toEqual([envelope]);
});

// Play here, under a failure: the screen closes, the TV is let go, and the phone plays from where the TV was.
test("Play here continues on the phone from the TV's position", async () => {
  store.set(remotePlayAtom, { play, loaded: true });
  await render(<RemotePlayerController />);

  await act(async () => {
    emitNativePlayerEvent(mockPlayer, "onPlayHereRequested", {
      positionSec: 42,
      remote: true,
    });
  });

  expect(mockPlayer.dismissals).toBe(1);
  expect(mockCast.disconnectCalls).toEqual([true]);
  expect(mockPlayMedia).toHaveBeenCalledWith(
    expect.objectContaining({
      itemId: "episode-1",
      mediaSourceId: "source-1",
      audioIndex: 1,
      subtitleIndex: 2,
      playbackPositionTicks: 420_000_000,
      offline: false,
    }),
    { item: episode, itemIsComplete: true },
  );
  expect(store.get(remotePlayAtom)).toBeNull();
});

// A send the TV never started has no TV position: the phone starts where the send asked.
test("Play here after a failed send starts where the send asked", async () => {
  store.set(remotePlayAtom, { play, loaded: false });
  await render(<RemotePlayerController />);

  await act(async () => {
    emitNativePlayerEvent(mockPlayer, "onPlayHereRequested", {
      positionSec: 0,
      remote: true,
    });
  });

  expect(mockPlayMedia).toHaveBeenCalledWith(
    expect.objectContaining({ playbackPositionTicks: 600_000_000 }),
    expect.anything(),
  );
});

// The receiver's error once the item plays (a transcode that fails ten minutes in): said on the screen.
test("an error after the load shows the failure", async () => {
  store.set(remotePlayAtom, { play, loaded: true });
  await render(<RemotePlayerController />);

  await act(async () => {
    emitNativePlayerEvent(mockPlayer, "onError", {
      error: "playback_info_failed",
      remote: true,
    });
    emitNativePlayerEvent(mockPlayer, "onError", {
      error: "The receiver stopped on a playback error",
      remote: true,
    });
  });

  expect(mockPlayer.remoteFailures).toEqual([
    { message: "player.chromecast_playback_request_failed", canPlayHere: true },
    { message: "player.chromecast_playback_failed", canPlayHere: true },
  ]);
});

test("closing the player sends nothing to the TV", async () => {
  store.set(remotePlayAtom, { play, loaded: true });
  await render(<RemotePlayerController />);
  const sentBefore = mockCast.loadCalls.length;

  await act(async () => {
    emitNativePlayerEvent(mockPlayer, "onDismiss", {
      positionSec: 42,
      durationSec: 120,
      reason: "closeButton",
      remote: true,
    });
  });

  expect(store.get(remotePlayAtom)).toBeNull();
  expect(mockCast.loadCalls).toHaveLength(sentBefore);
  expect(mockCast.reloadCalls).toEqual([]);
  expect(mockCast.disconnectCalls).toEqual([]);
  expect(mockPlayMedia).not.toHaveBeenCalled();
});

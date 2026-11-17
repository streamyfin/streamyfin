import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client";
import type { TFunction } from "i18next";
import { createStore } from "jotai";
import type { RemoteTarget } from "@/modules/mpv-player/src/cast";
import type { RemoteLoadResult } from "@/modules/mpv-player/src/cast/Cast.types";
import { CastNative } from "@/modules/mpv-player/src/cast/CastModule";
import {
  type CastDoubleState,
  createCastDoubleState,
  setCastSession,
} from "@/test-utils/cast";
import { makeApi } from "@/test-utils/jellyfinApi";
import {
  createNativePlayerDoubleState,
  type NativePlayerDoubleState,
} from "@/test-utils/nativePlayer";
import { stubReactNative } from "@/test-utils/reactNative";
import { remotePlayAtom } from "@/utils/atoms/remotePlayer";
import { settingsAtom } from "@/utils/atoms/settings";
import { extractImageColor } from "@/utils/imageColors";
import { playOnRemote } from "./playOnRemote";
import { remoteTint } from "./remoteTint";

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
// Auto measures the link with a download: here it measures 30 Mb/s, and a fixed quality stays itself.
jest.mock("@/utils/jellyfin/maxStreamingBitrate", () => ({
  resolveMaxStreamingBitrate: jest.fn(
    async (_api: unknown, quality: unknown) =>
      typeof quality === "number" ? quality : 30_000_000,
  ),
}));
jest.mock("@/utils/imageColors", () => ({
  extractImageColor: jest.fn(async () => null),
}));
jest.mock("@/utils/log", () => ({
  logAndCaptureError: jest.fn(),
  writeErrorLog: jest.fn(),
}));

const t = ((key: string) => key) as unknown as TFunction;

const episode: BaseItemDto = {
  Id: "episode-1",
  Name: "Pilot",
  Type: "Episode",
  MediaType: "Video",
  IsFolder: false,
  MediaSources: [{ Id: "source-1", MediaStreams: [] }],
};

const livingRoom: RemoteTarget = {
  kind: "cast",
  id: "4f0c2b9d8e7a6b5c4d3e2f1a0b9c8d7e",
  name: "Living Room TV",
  capabilities: { volume: true },
};

const play = {
  item: episode,
  positionTicks: 600_000_000,
  mediaSourceId: "source-1",
  audioIndex: 1,
  subtitleIndex: 2,
};

let api = makeApi();
let store = createStore();
const deps = () => ({ api, userId: "user-1", store, t });
const fresh = () => false;
const flush = () => new Promise((resolve) => setImmediate(resolve));

beforeEach(() => {
  mockCast = createCastDoubleState();
  setCastSession(mockCast, "session-1");
  mockPlayer = createNativePlayerDoubleState();
  // No remote screen up: the first send presents one.
  mockPlayer.remoteUpdateAnswer = false;
  api = makeApi();
  store = createStore();
  stubReactNative({ OS: "android" });
  jest.mocked(extractImageColor).mockResolvedValue(null);
});

test("the player opens before the load answers", async () => {
  let answer: (result: RemoteLoadResult) => void = () => {};
  jest.mocked(CastNative!.loadOnReceiver).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        answer = resolve;
      }),
  );

  const sent = playOnRemote(deps(), play, livingRoom, fresh);
  await flush();

  expect(mockPlayer.remotePresented).toHaveLength(1);
  expect(mockPlayer.remotePresented[0]).toMatchObject({
    targetName: "Living Room TV",
    tint: null,
  });
  answer({ outcome: "loaded" });
  await expect(sent).resolves.toEqual({ status: "loaded" });
});

test("a loaded outcome leaves the player as it is", async () => {
  await expect(playOnRemote(deps(), play, livingRoom, fresh)).resolves.toEqual({
    status: "loaded",
  });

  expect(mockPlayer.remoteFailures).toEqual([]);
  expect(store.get(remotePlayAtom)).toEqual({ play, loaded: true });
  expect(mockCast.loadCalls[0].request).toEqual({
    items: [
      {
        id: "episode-1",
        name: "Pilot",
        type: "Episode",
        mediaType: "Video",
        isFolder: false,
      },
    ],
    startPositionTicks: 600_000_000,
    mediaSourceId: "source-1",
    audioStreamIndex: 1,
    subtitleStreamIndex: 2,
  });
});

// Two presses close together: the first is replaced, and says nothing (Review Focus 3).
test("a superseded load says nothing and keeps the player open", async () => {
  mockCast.loadAnswer = { outcome: "superseded" };

  await expect(playOnRemote(deps(), play, livingRoom, fresh)).resolves.toEqual({
    status: "superseded",
  });

  expect(mockPlayer.remoteFailures).toEqual([]);
  expect(mockPlayer.remotePresented).toHaveLength(1);
});

test("a timed out load shows the failure with Play here", async () => {
  mockCast.loadAnswer = { outcome: "timedOut" };

  const result = await playOnRemote(deps(), play, livingRoom, fresh);

  expect(result).toEqual({
    status: "notStarted",
    message: "player.chromecast_did_not_start",
  });
  expect(mockPlayer.remoteFailures).toEqual([
    { message: "player.chromecast_did_not_start", canPlayHere: true },
  ]);
  expect(store.get(remotePlayAtom)).toEqual({ play, loaded: false });
});

test("a refused send shows the failure", async () => {
  mockCast.loadAnswer = { outcome: "failed", error: "playback_failed" };
  await playOnRemote(deps(), play, livingRoom, fresh);

  mockCast.loadAnswer = { outcome: "notSent", error: "No remote engine" };
  const notSent = await playOnRemote(deps(), play, livingRoom, fresh);

  expect(mockPlayer.remoteFailures).toEqual([
    { message: "player.chromecast_playback_failed", canPlayHere: true },
    { message: "cast.output.failed", canPlayHere: true },
  ]);
  expect(notSent).toEqual({
    status: "notStarted",
    message: "cast.output.failed",
  });
});

test("the envelope carries the bitrate cap of the remote quality setting", async () => {
  store.set(settingsAtom, {
    remotePlaybackQuality: {
      byKind: { cast: "8 Mb/s" },
      byTarget: {},
      known: [],
    },
  });

  await playOnRemote(deps(), play, livingRoom, fresh);

  expect(mockCast.loadCalls[0].server).toEqual({
    serverAddress: "https://jellyfin.example.com",
    accessToken: "SECRET_TOKEN",
    userId: "user-1",
    receiverName: "Living Room TV",
    maxBitrate: 8_000_000,
  });
});

// The receiver reports the playback to the server itself; a report from the phone would be a second session.
test("no playback report is sent for a remote play", async () => {
  await playOnRemote(deps(), play, livingRoom, fresh);

  expect(api.mock.history.post).toEqual([]);
  expect(api.mock.history.get).toEqual([]);
});

test("a stale send presents nothing", async () => {
  const result = await playOnRemote(deps(), play, livingRoom, () => true);

  expect(result).toEqual({ status: "superseded" });
  expect(mockPlayer.remotePresented).toEqual([]);
  expect(mockPlayer.remoteUpdates).toEqual([]);
  expect(mockCast.loadCalls).toEqual([]);
});

test("a send while the player is up updates it in place", async () => {
  mockPlayer.remoteUpdateAnswer = true;

  await playOnRemote(deps(), play, livingRoom, fresh);

  expect(mockPlayer.remoteUpdates).toHaveLength(1);
  expect(mockPlayer.remotePresented).toEqual([]);
});

// The screen opens on the neutral background; the artwork's color fades in once known, never waited for.
test("the tint follows once the artwork's color is known", async () => {
  jest.mocked(extractImageColor).mockResolvedValue("#1F6F8B");

  await playOnRemote(deps(), play, livingRoom, fresh);
  await flush();

  expect(mockPlayer.remoteTints).toEqual([remoteTint("#1F6F8B")]);
});

// Refused natively (no remote engine for the session): no screen says it, so the caller does, and nothing loads.
test("a remote player that does not open leaves the failure to the caller", async () => {
  mockPlayer.remoteRefusal = new Error("No remote engine");

  const result = await playOnRemote(deps(), play, livingRoom, fresh);

  expect(result).toEqual({ status: "failed", message: "cast.output.failed" });
  expect(mockCast.loadCalls).toEqual([]);
  expect(mockPlayer.remoteFailures).toEqual([]);
  expect(store.get(remotePlayAtom)).toBeNull();
});

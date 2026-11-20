import type { TFunction } from "i18next";
import { createStore } from "jotai";
import type { RemoteTarget } from "@/modules/mpv-player/src/cast";
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
import { localSubtitleIndex } from "@/utils/subtitles/subtitleIndex";
import {
  handOffToRemote,
  mayHandOff,
  resolveCastHandOff,
  stepAfterRefusal,
} from "./resolveCastHandOff";

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
jest.mock("@/utils/jellyfin/maxStreamingBitrate", () => ({
  resolveMaxStreamingBitrate: jest.fn(async () => 30_000_000),
}));
// The remote player's tint reads the artwork natively.
jest.mock("@/utils/imageColors", () => ({
  extractImageColor: jest.fn(async () => null),
}));
jest.mock("@/utils/log", () => ({
  logAndCaptureError: jest.fn(),
  writeErrorLog: jest.fn(),
}));

const t = ((key: string) => key) as unknown as TFunction;
const livingRoom: RemoteTarget = {
  kind: "cast",
  id: "device-a",
  name: "Living Room TV",
  capabilities: { volume: true },
};

const item = { Id: "item-1", Name: "Film", Type: "Movie" } as never;
const session = {
  item,
  mediaSourceId: "source-1",
  currentAudioIndex: 2,
  currentSubtitleIndex: 4,
  awaitingLoad: false,
  positionMs: 0,
};

// The local player closes first: native refuses the remote screen over it. The TV goes on where the player was.
test("handing the local player off opens the remote player where it was", async () => {
  mockCast = createCastDoubleState();
  setCastSession(mockCast, "session-1");
  mockPlayer = createNativePlayerDoubleState();
  mockPlayer.remoteUpdateAnswer = false;
  stubReactNative({ OS: "android" });
  let shownWhenClosed: number | undefined;

  const result = await handOffToRemote(
    {
      api: makeApi(),
      userId: "user-1",
      store: createStore(),
      t,
      closeLocalPlayer: async () => {
        shownWhenClosed = mockPlayer.remotePresented.length;
      },
    },
    session,
    61.5,
    livingRoom,
    () => false,
  );

  expect(result).toEqual({ status: "loaded" });
  expect(shownWhenClosed).toBe(0);
  expect(mockPlayer.remotePresented).toHaveLength(1);
  expect(mockCast.loadCalls[0].request).toMatchObject({
    items: [{ id: "item-1" }],
    startPositionTicks: 615_000_000,
    mediaSourceId: "source-1",
    audioStreamIndex: 2,
    subtitleStreamIndex: 4,
  });
});

test("the hand-off sends the session's streams at the position", () => {
  expect(resolveCastHandOff(session, 61.5)).toEqual({
    item,
    positionTicks: 615_000_000,
    mediaSourceId: "source-1",
    audioIndex: 2,
    subtitleIndex: 4,
  });
});

// During an in-place swap the native position is still the outgoing stream's: the incoming item goes from where its
// start report said, as the teardown report does.
test("a hand-off during an in-place load goes from where the incoming item starts", () => {
  expect(
    resolveCastHandOff(
      { ...session, awaitingLoad: true, positionMs: 30_000 },
      812,
    ).positionTicks,
  ).toBe(300_000_000);
});

// A live channel has no position to go on from: the receiver joins it live, as the item page's Play sends it.
test("a live channel goes to the receiver live", () => {
  expect(
    resolveCastHandOff(
      {
        ...session,
        item: { Id: "channel-1", Name: "News", Type: "TvChannel" } as never,
      },
      125,
    ).positionTicks,
  ).toBe(0);
});

// Subtitles turned off stay off on the receiver.
test("subtitles turned off stay off", () => {
  expect(
    resolveCastHandOff({ ...session, currentSubtitleIndex: -1 }, 0)
      .subtitleIndex,
  ).toBe(-1);
});

// A subtitle file on this device is not the server's: the receiver plays without subtitles.
test("a subtitle on this device gives none on the receiver", () => {
  expect(
    resolveCastHandOff(
      { ...session, currentSubtitleIndex: localSubtitleIndex(0) },
      0,
    ).subtitleIndex,
  ).toBe(-1);
});

const request = {
  itemId: "item-1",
  session,
  inSyncPlay: false,
  receiverConnected: true,
  wasPlaying: true,
};

test("a connected receiver takes the item the player plays", () => {
  expect(mayHandOff(request)).toBe(true);
});

// A group joined while the sheet was open: the player plays for the group, here.
test("a group member's player keeps playing here", () => {
  expect(mayHandOff({ ...request, inSyncPlay: true })).toBe(false);
});

// An in-place swap holds the next item already while the player still shows the one it hands off.
test("a hand-off for another item than the session's goes nowhere", () => {
  expect(mayHandOff({ ...request, itemId: "item-2" })).toBe(false);
});

test("nothing goes without a connected receiver or a session", () => {
  expect(mayHandOff({ ...request, receiverConnected: false })).toBe(false);
  expect(mayHandOff({ ...request, session: null })).toBe(false);
});

// The player paused for the hand-off: refused, it plays on.
test("a refused hand-off plays on", () => {
  expect(stepAfterRefusal({ ...request, receiverConnected: false })).toEqual({
    kind: "resume",
  });
});

// A group member plays on the group's command only, so its player stays paused until the group's next one.
test("a hand-off refused in a SyncPlay group leaves the player to the group", () => {
  expect(stepAfterRefusal({ ...request, inSyncPlay: true })).toEqual({
    kind: "none",
  });
});

// A video paused before the sheet opened stays paused when its hand-off goes nowhere.
test("a refused hand-off of a paused player leaves it paused", () => {
  expect(
    stepAfterRefusal({
      ...request,
      receiverConnected: false,
      wasPlaying: false,
    }),
  ).toEqual({ kind: "none" });
});

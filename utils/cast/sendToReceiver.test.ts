import { createStore } from "jotai";
import { effectiveSettingsAtom } from "@/utils/atoms/settings";
import { castToJellyfinReceiver } from "@/utils/cast/jellyfinReceiver";
import { choosePlay } from "@/utils/cast/playTarget";
import { watchLoadedCast } from "@/utils/cast/watchLoadedCast";
import { sendToReceiver } from "./sendToReceiver";

let mockSession: { id: string } | null = { id: "session-1" };
let mockSessionError: Error | null = null;
// The status the client holds once the receiver loaded: its first buffering report.
let mockHeldStatus: unknown = null;

jest.mock("@/modules/mpv-player/src/cast", () => ({
  castClientFor: (session: { id: string }) => ({
    id: `client-of-${session.id}`,
    getMediaStatus: async () => mockHeldStatus,
  }),
  currentCastSession: () => {
    if (mockSessionError) throw mockSessionError;
    return mockSession;
  },
}));
jest.mock("@/utils/atoms/settings", () => ({
  effectiveSettingsAtom: jest.requireActual("jotai").atom(null),
}));
jest.mock("@/utils/cast/jellyfinReceiver", () => ({
  castToJellyfinReceiver: jest.fn(async () => ({ status: "loaded" })),
  currentReceiverName: async () => "Living room",
  parseReceiverCustomData: jest.requireActual("@/utils/cast/jellyfinReceiver")
    .parseReceiverCustomData,
}));
jest.mock("@/utils/cast/watchLoadedCast", () => ({
  watchLoadedCast: jest.fn(),
}));
jest.mock("@/utils/log", () => ({
  logAndCaptureError: jest.fn(),
  writeErrorLog: jest.fn(),
}));

const livingRoom = {
  kind: "cast",
  id: "device-a",
  name: "Living room",
  capabilities: { volume: true },
} as never;
const item = { Id: "item-1", Name: "Film", Type: "Movie" } as never;
const store = createStore();
const deps = {
  api: { basePath: "https://jellyfin.example.com" } as never,
  userId: "user-1",
  store,
  t: ((key: string) => key) as never,
};
const play = {
  item,
  positionTicks: 1_200_000_000,
  mediaSourceId: "source-1",
  audioIndex: 2,
  subtitleIndex: 4,
};
const load = castToJellyfinReceiver as jest.Mock;
const watch = watchLoadedCast as jest.Mock;

beforeEach(() => {
  mockSession = { id: "session-1" };
  mockSessionError = null;
  mockHeldStatus = null;
  watch.mockReset();
  load.mockReset();
  load.mockImplementation(async () => ({ status: "loaded" }));
  store.set(
    effectiveSettingsAtom as never,
    {
      remotePlaybackQuality: {
        byKind: { cast: "4 Mb/s" },
        byTarget: {},
        known: [],
      },
    } as never,
  );
});

test("sends the item at the position with its streams", async () => {
  const result = await sendToReceiver(deps, play, livingRoom, () => false);

  expect(result).toEqual({ status: "loaded" });
  expect(load).toHaveBeenCalledTimes(1);
  const [client, session, request] = load.mock.calls[0];
  expect(client).toMatchObject({ id: "client-of-session-1" });
  expect(session).toMatchObject({
    userId: "user-1",
    receiverName: "Living room",
  });
  expect(request).toEqual({
    items: [item],
    startPositionTicks: 1_200_000_000,
    mediaSourceId: "source-1",
    audioStreamIndex: 2,
    subtitleStreamIndex: 4,
  });
});

test("uses the receiver's quality", async () => {
  await sendToReceiver(deps, play, livingRoom, () => false);

  expect(load.mock.calls[0][1].maxBitrate).toBe(4_000_000);
});

// The caller's moment passed (another account, a later choice): the load reads the receiver, then sends nothing.
test("sends nothing once stale", async () => {
  load.mockImplementation(
    async (_client, _session, _request, _timeout, isStale) =>
      isStale() ? { status: "superseded" } : { status: "loaded" },
  );

  const result = await sendToReceiver(deps, play, livingRoom, () => true);

  expect(result).toEqual({ status: "superseded" });
});

// A switch to another receiver between the read of the session and the send makes the load stale too.
test("a load made for another session is stale", async () => {
  let staleAtSend = false;
  load.mockImplementation(
    async (_client, _session, _request, _timeout, isStale) => {
      mockSession = { id: "session-2" };
      staleAtSend = isStale();
      return { status: "superseded" };
    },
  );

  await sendToReceiver(deps, play, livingRoom, () => false);

  expect(staleAtSend).toBe(true);
});

test("says why when the receiver does not start", async () => {
  load.mockImplementation(async () => ({ status: "timed_out" }));

  const result = await sendToReceiver(deps, play, livingRoom, () => false);

  expect(result).toEqual({
    status: "notStarted",
    message: "player.chromecast_did_not_start",
  });
});

test("says why without a Cast session", async () => {
  mockSession = null;

  const result = await sendToReceiver(deps, play, livingRoom, () => false);

  expect(result).toEqual({ status: "failed", message: "cast.output.failed" });
  expect(load).not.toHaveBeenCalled();
});

// On Android the Cast module throws once it lost its React context: the send says why instead of rejecting.
test("says why when the Cast session cannot be read", async () => {
  mockSessionError = new Error("The React context is gone");

  const result = await sendToReceiver(deps, play, livingRoom, () => false);

  expect(result).toEqual({
    status: "failed",
    message: "player.chromecast_playback_failed",
  });
  expect(load).not.toHaveBeenCalled();
});

test("says why when the load throws", async () => {
  load.mockImplementation(async () => {
    throw new Error("socket closed");
  });

  const result = await sendToReceiver(deps, play, livingRoom, () => false);

  expect(result).toEqual({
    status: "failed",
    message: "player.chromecast_playback_failed",
  });
});

// The load answer comes at the first buffering status: a stream the receiver fails on later is followed from there,
// told from the next load by the play session the receiver opened for it.
test("follows a loaded video for a failure the receiver reports later", async () => {
  mockHeldStatus = {
    playerState: "buffering",
    mediaInfo: { customData: { itemId: "item-1", playSessionId: "play-1" } },
  };
  const choice = choosePlay();

  await sendToReceiver(deps, play, livingRoom, () => false);

  expect(watch).toHaveBeenCalledTimes(1);
  expect(watch.mock.calls[0][0]).toMatchObject({ id: "client-of-session-1" });
  expect(watch.mock.calls[0][1]).toEqual({
    item,
    sent: {
      itemId: "item-1",
      mediaSourceId: "source-1",
      audioIndex: 2,
      subtitleIndex: 4,
      playbackPositionTicks: 1_200_000_000,
    },
    receiverName: "Living room",
    playSessionId: "play-1",
    choice,
    userId: "user-1",
  });
});

// The receiver plays the video: a follow that cannot start (the status read, the subscription) does not undo that.
test("a loaded send stays loaded when it cannot be followed", async () => {
  watch.mockImplementation(() => {
    throw new Error("no media client");
  });

  const result = await sendToReceiver(deps, play, livingRoom, () => false);

  expect(result).toEqual({ status: "loaded" });
});

test("follows a load by its item when the status held is another one's", async () => {
  mockHeldStatus = {
    playerState: "playing",
    mediaInfo: { customData: { itemId: "item-2", playSessionId: "play-2" } },
  };

  await sendToReceiver(deps, play, livingRoom, () => false);

  expect(watch.mock.calls[0][1].playSessionId).toBeNull();
});

test.each([
  ["did not start", { status: "timed_out" }],
  ["was superseded", { status: "superseded" }],
])("follows nothing for a send that %s", async (_label, outcome) => {
  load.mockImplementation(async () => outcome);

  await sendToReceiver(deps, play, livingRoom, () => false);

  expect(watch).not.toHaveBeenCalled();
});

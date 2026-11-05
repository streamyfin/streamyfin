import { createStore } from "jotai";
import { effectiveSettingsAtom } from "@/utils/atoms/settings";
import { castToJellyfinReceiver } from "@/utils/cast/jellyfinReceiver";
import { sendToReceiver } from "./sendToReceiver";

let mockSession: { id: string } | null = { id: "session-1" };
let mockSessionError: Error | null = null;

jest.mock("@/modules/mpv-player/src/cast", () => ({
  castClientFor: (session: { id: string }) => ({
    id: `client-of-${session.id}`,
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

beforeEach(() => {
  mockSession = { id: "session-1" };
  mockSessionError = null;
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
  expect(client).toEqual({ id: "client-of-session-1" });
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

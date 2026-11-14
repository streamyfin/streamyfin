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
// How the client answers its status read; a test can hold it or act while it runs.
let mockReadHeldStatus: () => Promise<unknown> = async () => mockHeldStatus;

jest.mock("@/modules/mpv-player/src/cast", () => ({
  castClientFor: (session: { id: string }) => ({
    id: `client-of-${session.id}`,
    getMediaStatus: () => mockReadHeldStatus(),
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
  toReceiverRequest: jest.requireActual("@/utils/cast/jellyfinReceiver")
    .toReceiverRequest,
}));
jest.mock("@/utils/cast/watchLoadedCast", () => ({
  watchLoadedCast: jest.fn(),
}));
jest.mock("@/utils/log", () => ({
  logAndCaptureError: jest.fn(),
  writeErrorLog: jest.fn(),
  writeToLog: jest.fn(),
}));
// The server's speed test: what Auto measures on the link.
const mockDetectBitrate = jest.fn(async () => 12_000_000);
jest.mock("@/utils/jellyfin/bitrateTest", () => ({
  detectBitrate: (...args: unknown[]) => mockDetectBitrate(...(args as [])),
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
// The follow runs after the load answer: lets it read the status and start before the test looks.
const followed = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  mockSession = { id: "session-1" };
  mockSessionError = null;
  mockHeldStatus = null;
  mockReadHeldStatus = async () => mockHeldStatus;
  watch.mockReset();
  load.mockReset();
  mockDetectBitrate.mockReset();
  mockDetectBitrate.mockImplementation(async () => 12_000_000);
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
  expect(await session).toMatchObject({
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

// The bitrate the receiver was handed: the session may still be measuring when the load takes its turn.
const sentBitrate = async () => (await load.mock.calls[0][1]).maxBitrate;
const withQuality = (
  byKind: Record<string, string>,
  byTarget: Record<string, string> = {},
) =>
  store.set(
    effectiveSettingsAtom as never,
    { remotePlaybackQuality: { byKind, byTarget, known: [] } } as never,
  );

test("uses the receiver's quality", async () => {
  await sendToReceiver(deps, play, livingRoom, () => false);

  expect(await sentBitrate()).toBe(4_000_000);
  expect(mockDetectBitrate).not.toHaveBeenCalled();
});

// Rule of 30/10: Auto is the cast's default. The receiver knows no Auto: it is handed what the link measured.
describe("Auto on the receiver", () => {
  test("is the quality when none is set, at the bitrate measured", async () => {
    withQuality({});
    await sendToReceiver(deps, play, livingRoom, () => false);

    expect(await sentBitrate()).toBe(12_000_000);
    expect(mockDetectBitrate).toHaveBeenCalledTimes(1);
  });

  test("is measured when picked for the receiver", async () => {
    withQuality({ cast: "4 Mb/s" }, { "device-a": "Auto" });
    await sendToReceiver(deps, play, livingRoom, () => false);

    expect(await sentBitrate()).toBe(12_000_000);
  });

  // No cap: castToJellyfinReceiver then names the receiver's own ceiling.
  test("that measures nothing sets no cap", async () => {
    withQuality({});
    mockDetectBitrate.mockRejectedValueOnce(new Error("nothing measured"));
    await sendToReceiver(deps, play, livingRoom, () => false);

    expect(await sentBitrate()).toBeUndefined();
  });

  // The load takes its turn now: a cast picked while Auto measures replaces it, as develop's item page did.
  test("lets the load take its turn while it measures", async () => {
    withQuality({});
    let measured: (bitrate: number) => void = () => {};
    mockDetectBitrate.mockImplementationOnce(
      () => new Promise<number>((resolve) => (measured = resolve)),
    );
    const sent = sendToReceiver(deps, play, livingRoom, () => false);

    await followed();
    expect(load).toHaveBeenCalledTimes(1);
    measured(9_000_000);
    expect(await sentBitrate()).toBe(9_000_000);
    await sent;
  });
});

test("Max sets no cap and measures nothing", async () => {
  withQuality({ cast: "Max" });
  await sendToReceiver(deps, play, livingRoom, () => false);

  expect(await sentBitrate()).toBeUndefined();
  expect(mockDetectBitrate).not.toHaveBeenCalled();
});

// Live TV plays without a cap unless a bitrate was picked by hand, as on this device: Auto never measures for it.
describe("live TV on the receiver", () => {
  const channel = {
    ...play,
    item: { Id: "channel-1", Name: "News", Type: "TvChannel" } as never,
  };

  test("plays without a cap under Auto", async () => {
    withQuality({});
    await sendToReceiver(deps, channel, livingRoom, () => false);

    expect(await sentBitrate()).toBeUndefined();
    expect(mockDetectBitrate).not.toHaveBeenCalled();
  });

  test("keeps a bitrate picked by hand", async () => {
    withQuality({ cast: "8 Mb/s" });
    await sendToReceiver(deps, channel, livingRoom, () => false);

    expect(await sentBitrate()).toBe(8_000_000);
  });
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
  await followed();

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

// A guide program goes as its channel (live, without the page's stream picks): the watch follows what the receiver
// plays, or the program id matches no status and it stops at the first one.
test("follows a guide program as the channel the receiver plays", async () => {
  mockHeldStatus = {
    playerState: "buffering",
    mediaInfo: { customData: { itemId: "channel-1", playSessionId: "live-1" } },
  };
  const program = {
    Id: "program-1",
    Name: "Evening news",
    Type: "Program",
    ChannelId: "channel-1",
    ChannelName: "News",
  } as never;

  await sendToReceiver(
    deps,
    { ...play, item: program },
    livingRoom,
    () => false,
  );
  await followed();

  expect(watch).toHaveBeenCalledTimes(1);
  expect(watch.mock.calls[0][1]).toMatchObject({
    item: { Id: "channel-1", Name: "News", Type: "TvChannel" },
    sent: {
      itemId: "channel-1",
      mediaSourceId: undefined,
      audioIndex: undefined,
      subtitleIndex: undefined,
    },
    playSessionId: "live-1",
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
  await followed();

  expect(watch.mock.calls[0][1].playSessionId).toBeNull();
});

// A play chosen while the status is read is the user's next one: the receiver's failure gives way to it.
test("a load is followed with the play choice of its answer", async () => {
  const choice = choosePlay();
  mockReadHeldStatus = async () => {
    choosePlay();
    return mockHeldStatus;
  };

  await sendToReceiver(deps, play, livingRoom, () => false);
  await followed();

  expect(watch.mock.calls[0][1].choice).toBe(choice);
});

// The hand-off closes the player at the load answer: a status read that hangs must not hold it.
test("a status read that does not answer leaves the load answer alone", async () => {
  mockReadHeldStatus = () => new Promise(() => {});

  const result = await Promise.race([
    sendToReceiver(deps, play, livingRoom, () => false),
    new Promise((resolve) => setTimeout(() => resolve("held"), 50)),
  ]);

  expect(result).toEqual({ status: "loaded" });
});

test("a follow that ends after a newer load's follows nothing", async () => {
  let releaseFirst = () => {};
  const reads = [
    () =>
      new Promise((resolve) => {
        releaseFirst = () => resolve(mockHeldStatus);
      }),
    async () => mockHeldStatus,
  ];
  mockReadHeldStatus = () => (reads.shift() ?? (async () => null))();

  void sendToReceiver(deps, play, livingRoom, () => false);
  await followed();
  await sendToReceiver(
    deps,
    { ...play, positionTicks: 0 },
    livingRoom,
    () => false,
  );
  await followed();
  releaseFirst();
  await followed();

  expect(watch).toHaveBeenCalledTimes(1);
  expect(watch.mock.calls[0][1].sent.playbackPositionTicks).toBe(0);
});

test.each([
  ["did not start", { status: "timed_out" }],
  ["was superseded", { status: "superseded" }],
])("follows nothing for a send that %s", async (_label, outcome) => {
  load.mockImplementation(async () => outcome);

  await sendToReceiver(deps, play, livingRoom, () => false);

  expect(watch).not.toHaveBeenCalled();
});

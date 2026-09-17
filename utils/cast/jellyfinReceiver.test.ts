import { beforeEach, describe, expect, mock, test } from "bun:test";

type FakeChannel = {
  connected: boolean;
  sendMessage: ReturnType<typeof mock>;
  remove: ReturnType<typeof mock>;
  receive: (message: unknown) => void;
};

let channels: FakeChannel[] = [];
let connectOnAdd = true;
let sessionId: string | undefined = "session-1";
let holdAdd: Promise<void> | null = null;
let friendlyName: string | undefined = "Living Room TV";

mock.module("react-native-google-cast", () => ({
  default: {
    getSessionManager: () => ({
      getCurrentCastSession: async () =>
        sessionId === undefined
          ? null
          : {
              id: sessionId,
              getCastDevice: async () =>
                friendlyName === undefined ? null : { friendlyName },
            },
    }),
  },
  CastChannel: {
    add: mock(async (_namespace: string, onMessage: (m: unknown) => void) => {
      if (holdAdd) await holdAdd;
      const channel: FakeChannel = {
        connected: connectOnAdd,
        sendMessage: mock(async () => {}),
        remove: mock(async () => {}),
        receive: onMessage,
      };
      channels.push(channel);
      return channel;
    }),
  },
}));

const {
  currentReceiverName,
  JELLYFIN_CAST_NAMESPACE,
  playOnJellyfinReceiver,
  queueWindow,
  sendJellyfinCastCommand,
  subscribeToJellyfinReceiverMessages,
  watchReceiverLoadErrors,
} = await import("./jellyfinReceiver");
const { makeApi } = await import("@/test-utils/jellyfinApi");

const lastChannel = () => channels[channels.length - 1];

let nextSession = 0;

beforeEach(() => {
  // The module caches its channel per Cast session, so each test starts on a
  // session of its own rather than on whatever the last one left open.
  nextSession += 1;
  sessionId = `session-${nextSession}`;
  friendlyName = "Living Room TV";
  channels = [];
  connectOnAdd = true;
  holdAdd = null;
});

describe("playOnJellyfinReceiver", () => {
  test("hands the receiver the server, the user and the chosen streams", async () => {
    const api = makeApi();

    await playOnJellyfinReceiver(
      { api, userId: "user-1", receiverName: "Salon", maxBitrate: 8_000_000 },
      {
        items: [
          {
            Id: "item-1",
            Name: "Festen",
            Type: "Movie",
            MediaType: "Video",
            Overview: "Not needed by the receiver",
            MediaSources: [{ Id: "source-1" }],
          },
        ],
        startPositionTicks: 42,
        mediaSourceId: "source-1",
        audioStreamIndex: 2,
        subtitleStreamIndex: 5,
      },
    );

    expect(lastChannel().sendMessage).toHaveBeenCalledWith({
      command: "PlayNow",
      serverAddress: "https://jellyfin.example.com",
      accessToken: "SECRET_TOKEN",
      userId: "user-1",
      receiverName: "Salon",
      maxBitrate: 8_000_000,
      options: {
        items: [
          {
            Id: "item-1",
            Name: "Festen",
            Type: "Movie",
            MediaType: "Video",
            IsFolder: false,
          },
        ],
        startPositionTicks: 42,
        mediaSourceId: "source-1",
        audioStreamIndex: 2,
        subtitleStreamIndex: 5,
      },
    });
  });

  test("leaves out the receiver name and bitrate when there are none", async () => {
    await sendJellyfinCastCommand("Stop", { api: makeApi(), userId: "user-1" });

    const [message] = lastChannel().sendMessage.mock.calls[0];
    expect(message).not.toHaveProperty("receiverName");
    expect(message).not.toHaveProperty("maxBitrate");
  });
});

describe("receiver channel", () => {
  test("is opened on the Jellyfin namespace and reused while connected", async () => {
    const session = { api: makeApi(), userId: "user-1" };

    await sendJellyfinCastCommand("Pause", session);
    await sendJellyfinCastCommand("Unpause", session);

    expect(channels).toHaveLength(1);
    expect(JELLYFIN_CAST_NAMESPACE).toBe("urn:x-cast:com.connectsdk");
  });

  test("is opened again for a new Cast session, and the old one removed", async () => {
    // Android never marks a channel disconnected, so a session change is the
    // only sign that the receiver callbacks have to be registered again.
    const session = { api: makeApi(), userId: "user-1" };

    await sendJellyfinCastCommand("Pause", session);
    const previous = lastChannel();
    sessionId = "session-next";
    await sendJellyfinCastCommand("Unpause", session);

    expect(channels).toHaveLength(2);
    expect(previous.remove).toHaveBeenCalled();
  });

  test("opens one channel for two commands sent at once", async () => {
    // Both would otherwise register on the session, with only the last one
    // tracked and the other left behind for good.
    let release = () => {};
    holdAdd = new Promise<void>((resolve) => {
      release = resolve;
    });
    const session = { api: makeApi(), userId: "user-1" };

    const commands = Promise.all([
      sendJellyfinCastCommand("Pause", session),
      sendJellyfinCastCommand("Unpause", session),
    ]);
    release();
    await commands;

    expect(channels).toHaveLength(1);
    expect(lastChannel().sendMessage).toHaveBeenCalledTimes(2);
  });

  test("refuses to send when the channel does not connect", async () => {
    connectOnAdd = false;

    await expect(
      sendJellyfinCastCommand("Pause", { api: makeApi(), userId: "user-1" }),
    ).rejects.toThrow("not connected");
  });

  test("parses the raw JSON the native modules hand over", async () => {
    // Both native modules pass the receiver's payload as a string; read as an
    // object it has no `type` and every receiver error goes unnoticed.
    const received: unknown[] = [];
    subscribeToJellyfinReceiverMessages((message) => received.push(message));
    await sendJellyfinCastCommand("Pause", {
      api: makeApi(),
      userId: "user-1",
    });

    lastChannel().receive('{"type":"connectionerror","message":""}');
    lastChannel().receive("not json");

    expect(received).toEqual([
      { type: "connectionerror", message: "" },
      "not json",
    ]);
  });

  test("passes receiver messages to subscribers until they unsubscribe", async () => {
    const received: unknown[] = [];
    const unsubscribe = subscribeToJellyfinReceiverMessages((message) =>
      received.push(message),
    );
    await sendJellyfinCastCommand("Pause", {
      api: makeApi(),
      userId: "user-1",
    });

    lastChannel().receive({ type: "connectionerror", message: "" });
    unsubscribe();
    lastChannel().receive({ type: "error", message: "ignored" });

    expect(received).toEqual([{ type: "connectionerror", message: "" }]);
  });
});

describe("queueWindow", () => {
  const tracks = Array.from({ length: 250 }, (_, i) => `track-${i}`);

  test("sends a short queue whole", () => {
    expect(queueWindow(tracks.slice(0, 5), 3, 100)).toEqual({
      items: tracks.slice(0, 5),
      startIndex: 3,
    });
  });

  test("keeps a track picked past the limit in what gets sent", () => {
    const { items, startIndex } = queueWindow(tracks, 120, 100);

    expect(items).toHaveLength(100);
    expect(items[startIndex]).toBe("track-120");
  });

  test("fills the window backwards near the end of the queue", () => {
    const { items, startIndex } = queueWindow(tracks, 249, 100);

    expect(items[0]).toBe("track-150");
    expect(items[startIndex]).toBe("track-249");
  });

  test("clamps an index outside the queue", () => {
    expect(queueWindow(tracks.slice(0, 3), 7, 100).startIndex).toBe(2);
  });
});

describe("watchReceiverLoadErrors", () => {
  const openChannel = () =>
    sendJellyfinCastCommand("Pause", { api: makeApi(), userId: "user-1" });

  test("reports the first load error, then stops listening", async () => {
    await openChannel();
    const errors: string[] = [];
    watchReceiverLoadErrors((error) => errors.push(error), 1_000);

    lastChannel().receive('{"type":"playbackprogress"}');
    lastChannel().receive('{"type":"connectionerror","message":""}');
    lastChannel().receive('{"type":"playbackerror","message":"NoStream"}');

    expect(errors).toEqual(["server_unreachable"]);
  });

  test("only reports for the latest cast command", async () => {
    await openChannel();
    const first: string[] = [];
    const second: string[] = [];
    watchReceiverLoadErrors((error) => first.push(error), 1_000);
    watchReceiverLoadErrors((error) => second.push(error), 1_000);

    lastChannel().receive({ type: "error", message: "Missing params" });

    expect(first).toEqual([]);
    expect(second).toEqual(["rejected"]);
  });

  test("stops listening once the window is over", async () => {
    await openChannel();
    const errors: string[] = [];
    watchReceiverLoadErrors((error) => errors.push(error), 5);

    await new Promise((resolve) => setTimeout(resolve, 20));
    lastChannel().receive({ type: "playbackerror", message: "late" });

    expect(errors).toEqual([]);
  });

  test("stops listening when the command could not be sent", async () => {
    await openChannel();
    const errors: string[] = [];
    const stop = watchReceiverLoadErrors((error) => errors.push(error), 1_000);

    stop();
    lastChannel().receive({ type: "connectionerror", message: "" });

    expect(errors).toEqual([]);
  });
});

describe("currentReceiverName", () => {
  test("reads the device name off the live Cast session", async () => {
    expect(await currentReceiverName()).toBe("Living Room TV");
  });

  test("is undefined with no session or no device name", async () => {
    sessionId = undefined;
    expect(await currentReceiverName()).toBeUndefined();

    sessionId = "session-x";
    friendlyName = undefined;
    expect(await currentReceiverName()).toBeUndefined();
  });
});

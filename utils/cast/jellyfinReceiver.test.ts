import { RECEIVER_CHANNEL_OPEN_ATTEMPTS } from "@/constants/Cast";
import { makeApi } from "@/test-utils/jellyfinApi";
import {
  castToJellyfinReceiver,
  currentReceiverName,
  JELLYFIN_CAST_NAMESPACE,
  playOnJellyfinReceiver,
  queueWindow,
  receiverNameFor,
  sendJellyfinCastCommand,
  subscribeToJellyfinReceiverMessages,
  toReceiverDeviceName,
  watchReceiverLoadErrors,
} from "./jellyfinReceiver";

type FakeChannel = {
  connected: boolean;
  sendMessage: jest.Mock;
  remove: jest.Mock;
  receive: (message: unknown) => void;
};

// Read by the Cast double below. Jest hoists `jest.mock` above the imports and
// only lets its factory reach variables named `mock*`.
let mockChannels: FakeChannel[] = [];
let mockConnectOnAdd = true;
let mockSessionId: string | undefined = "session-1";
let mockHoldAdd: Promise<void> | null = null;
let mockFriendlyName: string | undefined = "Living Room TV";
let mockRenewSessionOnAdd = false;
const mockSessionListeners: Record<string, (() => void)[]> = {};
const mockListen = (event: string) => (handler: () => void) => {
  mockSessionListeners[event] = [
    ...(mockSessionListeners[event] ?? []),
    handler,
  ];
  return { remove: () => {} };
};

jest.mock("react-native-google-cast", () => ({
  __esModule: true,
  default: {
    getSessionManager: () => ({
      onSessionEnded: mockListen("ended"),
      onSessionSuspended: mockListen("suspended"),
      onSessionResumed: mockListen("resumed"),
      getCurrentCastSession: async () =>
        mockSessionId === undefined
          ? null
          : {
              id: mockSessionId,
              getCastDevice: async () =>
                mockFriendlyName === undefined
                  ? null
                  : {
                      friendlyName: mockFriendlyName,
                      deviceId: "4f0c2b9d8e7a6b5c4d3e2f1a0b9c8d7e",
                    },
            },
    }),
  },
  MediaPlayerState: {
    IDLE: "idle",
    LOADING: "loading",
    BUFFERING: "buffering",
    PLAYING: "playing",
    PAUSED: "paused",
  },
  CastChannel: {
    add: jest.fn(
      async (_namespace: string, onMessage: (m: unknown) => void) => {
        if (mockHoldAdd) await mockHoldAdd;
        if (mockRenewSessionOnAdd) mockSessionId = `${mockSessionId}-renewed`;
        const channel: FakeChannel = {
          connected: mockConnectOnAdd,
          sendMessage: jest.fn(async () => {}),
          remove: jest.fn(async () => {}),
          receive: onMessage,
        };
        mockChannels.push(channel);
        return channel;
      },
    ),
  },
}));

const lastChannel = () => mockChannels[mockChannels.length - 1];

let nextSession = 0;

beforeEach(() => {
  // The module caches its channel per Cast session, so each test starts on a
  // session of its own rather than on whatever the last one left open.
  nextSession += 1;
  mockSessionId = `session-${nextSession}`;
  mockFriendlyName = "Living Room TV";
  mockChannels = [];
  mockConnectOnAdd = true;
  mockHoldAdd = null;
  mockRenewSessionOnAdd = false;
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

  test("casts a live program through its channel, from the live edge", async () => {
    // The receiver has no program-to-channel lookup: handed the program, it
    // asks PlaybackInfo for an item with no media and the TV stays idle.
    await playOnJellyfinReceiver(
      { api: makeApi(), userId: "user-1" },
      {
        items: [
          {
            Id: "program-1",
            Name: "Evening News",
            Type: "Program",
            ChannelId: "channel-1",
            ChannelName: "News 24",
          },
        ],
        startPositionTicks: 600_000_000,
        mediaSourceId: "program-1",
        audioStreamIndex: 1,
        subtitleStreamIndex: 3,
      },
    );

    const [message] = lastChannel().sendMessage.mock.calls[0];
    expect(message.options).toEqual({
      items: [
        {
          Id: "channel-1",
          Name: "News 24",
          Type: "TvChannel",
          MediaType: "Video",
          IsFolder: false,
        },
      ],
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

    expect(mockChannels).toHaveLength(1);
    expect(JELLYFIN_CAST_NAMESPACE).toBe("urn:x-cast:com.connectsdk");
  });

  test("is opened again for a new Cast session, and the old one removed", async () => {
    // Android never marks a channel disconnected, so a session change is the
    // only sign that the receiver callbacks have to be registered again.
    const session = { api: makeApi(), userId: "user-1" };

    await sendJellyfinCastCommand("Pause", session);
    const previous = lastChannel();
    mockSessionId = "session-next";
    await sendJellyfinCastCommand("Unpause", session);

    expect(mockChannels).toHaveLength(2);
    expect(previous.remove).toHaveBeenCalled();
  });

  test.each(["ended", "suspended", "resumed"])(
    "is opened again after a session %s event, with the same session id",
    async (event) => {
      // Rejoining a receiver that kept playing gives back the same session id,
      // but the old channel was registered on the session object that is gone.
      const session = { api: makeApi(), userId: "user-1" };

      await sendJellyfinCastCommand("Pause", session);
      const previous = lastChannel();
      for (const handler of mockSessionListeners[event] ?? []) handler();
      await sendJellyfinCastCommand("Unpause", session);

      expect(mockChannels).toHaveLength(2);
      expect(previous.remove).toHaveBeenCalled();
      expect(previous.sendMessage).toHaveBeenCalledTimes(1);
      expect(lastChannel().sendMessage).toHaveBeenCalledTimes(1);
    },
  );

  test("opens one channel for two commands sent at once", async () => {
    // Both would otherwise register on the session, with only the last one
    // tracked and the other left behind for good.
    let release = () => {};
    mockHoldAdd = new Promise<void>((resolve) => {
      release = resolve;
    });
    const session = { api: makeApi(), userId: "user-1" };

    const commands = Promise.all([
      sendJellyfinCastCommand("Pause", session),
      sendJellyfinCastCommand("Unpause", session),
    ]);
    release();
    await commands;

    expect(mockChannels).toHaveLength(1);
    expect(lastChannel().sendMessage).toHaveBeenCalledTimes(2);
  });

  test("opens a channel for the session the command is sent on", async () => {
    // The session can change while the open is pending; the old session's
    // channel would reach the receiver that is no longer there.
    let release = () => {};
    mockHoldAdd = new Promise<void>((resolve) => {
      release = resolve;
    });
    const command = sendJellyfinCastCommand("Pause", {
      api: makeApi(),
      userId: "user-1",
    });

    mockSessionId = "session-after";
    mockHoldAdd = null;
    release();
    await command;

    expect(mockChannels).toHaveLength(2);
    expect(mockChannels[0].sendMessage).not.toHaveBeenCalled();
    expect(mockChannels[0].remove).toHaveBeenCalled();
    expect(mockChannels[1].sendMessage).toHaveBeenCalledTimes(1);
  });

  test("gives up when the Cast session changes on every try", async () => {
    mockRenewSessionOnAdd = true;

    await expect(
      sendJellyfinCastCommand("Pause", { api: makeApi(), userId: "user-1" }),
    ).rejects.toThrow("the Cast session keeps changing");
    expect(mockChannels).toHaveLength(RECEIVER_CHANNEL_OPEN_ATTEMPTS);
    expect(
      mockChannels.every((channel) => !channel.sendMessage.mock.calls.length),
    ).toBe(true);
  });

  test("refuses to send when the channel does not connect", async () => {
    mockConnectOnAdd = false;

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
    mockSessionId = undefined;
    expect(await currentReceiverName()).toBeUndefined();

    mockSessionId = "session-x";
    mockFriendlyName = undefined;
    expect(await currentReceiverName()).toBeUndefined();
  });

  test("gives a TV with no ASCII letter in its name one the receiver can use", async () => {
    mockFriendlyName = "Гостиная";
    expect(await currentReceiverName()).toBe("Chromecast 0b9c8d7e");
  });
});

describe("receiverNameFor", () => {
  const deviceId = "4f0c2b9d8e7a6b5c4d3e2f1a0b9c8d7e";

  test("passes a name the receiver can take through unchanged", () => {
    // The receiver then names the TV exactly as it does for jellyfin-web.
    expect(receiverNameFor({ friendlyName: "Télé du salon", deviceId })).toBe(
      "Télé du salon",
    );
    expect(
      receiverNameFor({ friendlyName: 'Salon (TV) — 55"', deviceId }),
    ).toBe('Salon (TV) — 55"');
  });

  test("swaps whitespace the receiver cannot encode for a plain space", () => {
    expect(
      receiverNameFor({ friendlyName: "Living\u3000Room\u202fTV", deviceId }),
    ).toBe("Living Room TV");
  });

  test.each(["Гостиная", "客厅电视", "リビング\u3000テレビ", ""])(
    "names a TV called %p after its Cast device id",
    (friendlyName) => {
      expect(receiverNameFor({ friendlyName, deviceId })).toBe(
        "Chromecast 0b9c8d7e",
      );
    },
  );

  test("falls back to a plain name when the device has no id", () => {
    expect(receiverNameFor({ friendlyName: "客厅电视" })).toBe("Chromecast");
  });

  test("is undefined with no device", () => {
    expect(receiverNameFor(null)).toBeUndefined();
    expect(receiverNameFor(undefined)).toBeUndefined();
  });

  test.each([
    "Living Room TV",
    "Télé du salon",
    "リビング\u3000テレビ",
    "Living\u3000Room",
    "Гостиная",
    "\u2003",
  ])("leaves the receiver a non-empty name it can encode, from %p", (name) => {
    // What the receiver does with the name before it calls btoa() on it.
    const kept = toReceiverDeviceName(
      receiverNameFor({ friendlyName: name, deviceId }) ?? "",
    );

    expect(kept.trim()).not.toBe("");
    expect(() => btoa(kept)).not.toThrow();
  });
});

describe("toReceiverDeviceName", () => {
  test("applies the receiver's own cleanup of the Cast device name", () => {
    expect(toReceiverDeviceName('Salon (TV) — 55"')).toBe("Salon TV  55");
  });
});

describe("castToJellyfinReceiver", () => {
  type Status = {
    playerState: string;
    mediaInfo: { customData: { itemId: string; playSessionId: string } };
  };

  const status = (
    playerState: string,
    itemId: string,
    playSessionId: string,
  ): Status => ({
    playerState,
    mediaInfo: { customData: { itemId, playSessionId } },
  });

  /** A remote media client whose status updates the test emits. */
  const makeClient = (current: Status | null = null) => {
    let listener: ((status: Status | null) => void) | undefined;
    return {
      getMediaStatus: jest.fn(async () => current),
      onMediaStatusUpdated: jest.fn((handler: typeof listener) => {
        listener = handler;
        return {
          remove: () => {
            listener = undefined;
          },
        };
      }),
      emit: (next: Status | null) => listener?.(next),
    };
  };

  const movie = { Id: "item-1", Name: "Festen", Type: "Movie" as const };
  const session = () => ({ api: makeApi(), userId: "user-1" });
  // Lets the media status read and the channel open run before the test acts.
  const sent = () => new Promise((resolve) => setTimeout(resolve, 0));

  const settledWith = async (outcome: Promise<unknown>) => {
    let result: unknown = "pending";
    void outcome.then((value) => {
      result = value;
    });
    await sent();
    return result;
  };

  test("waits for the receiver to load the item, not for the send", async () => {
    const client = makeClient();
    const outcome = castToJellyfinReceiver(
      client as never,
      session(),
      { items: [movie] },
      1_000,
    );
    await sent();

    expect(lastChannel().sendMessage).toHaveBeenCalledTimes(1);
    expect(await settledWith(outcome)).toBe("pending");

    // The receiver reports the new item idle before it starts loading it.
    client.emit(status("idle", "item-1", "session-a"));
    expect(await settledWith(outcome)).toBe("pending");

    client.emit(status("buffering", "item-1", "session-a"));
    expect(await outcome).toEqual({ status: "loaded" });
  });

  test("does not take the media being replaced for the new load", async () => {
    // Recasting the item on the TV (another audio track, say): until the
    // receiver opens a new play session, the status is the old playback.
    const client = makeClient(status("playing", "item-1", "session-old"));
    const outcome = castToJellyfinReceiver(
      client as never,
      session(),
      { items: [movie] },
      1_000,
    );
    await sent();

    client.emit(status("playing", "item-1", "session-old"));
    client.emit(status("playing", "other-item", "session-b"));
    expect(await settledWith(outcome)).toBe("pending");

    client.emit(status("playing", "item-1", "session-new"));
    expect(await outcome).toEqual({ status: "loaded" });
  });

  test("waits for a live program's channel", async () => {
    const client = makeClient();
    const outcome = castToJellyfinReceiver(
      client as never,
      session(),
      {
        items: [{ Id: "program-1", Type: "Program", ChannelId: "channel-1" }],
      },
      1_000,
    );
    await sent();

    client.emit(status("buffering", "channel-1", "session-a"));
    expect(await outcome).toEqual({ status: "loaded" });
  });

  test("waits for the selected track of a queue", async () => {
    const client = makeClient();
    const outcome = castToJellyfinReceiver(
      client as never,
      session(),
      {
        items: [
          { Id: "track-1", Type: "Audio" },
          { Id: "track-2", Type: "Audio" },
        ],
        startIndex: 1,
      },
      1_000,
    );
    await sent();

    client.emit(status("playing", "track-1", "session-a"));
    expect(await settledWith(outcome)).toBe("pending");
    client.emit(status("playing", "track-2", "session-b"));
    expect(await outcome).toEqual({ status: "loaded" });
  });

  test("reports a load error the receiver sends back", async () => {
    const client = makeClient();
    const outcome = castToJellyfinReceiver(
      client as never,
      session(),
      { items: [movie] },
      1_000,
    );
    await sent();

    lastChannel().receive(
      '{"type":"playbackerror","message":"NoCompatibleStream"}',
    );

    expect(await outcome).toEqual({
      status: "failed",
      error: "playback_failed",
      message: { type: "playbackerror", message: "NoCompatibleStream" },
    });
  });

  test("gives up when the receiver neither loads nor answers", async () => {
    // What a TV that cannot reach the server does: its first request fails
    // and it says nothing to the phone.
    const client = makeClient();
    const outcome = castToJellyfinReceiver(
      client as never,
      session(),
      { items: [movie] },
      10,
    );

    expect(await outcome).toEqual({ status: "timed_out" });
  });

  /** Holds the next media status read until the test answers it. */
  const holdMediaStatus = (client: ReturnType<typeof makeClient>) => {
    let answer = () => {};
    client.getMediaStatus.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          answer = () => resolve(null);
        }),
    );
    return () => answer();
  };

  test.each([
    ["the older one", true],
    ["the newer one", false],
  ])(
    "sends only the newer of two casts started together, when %s reads its status first",
    async (_, olderAnswersFirst) => {
      // A double tap, or the music auto-cast overlapping a manual cast: both
      // are still reading the media status when the second one starts.
      const client = makeClient();
      const answerFirst = holdMediaStatus(client);
      const answerSecond = holdMediaStatus(client);
      const first = castToJellyfinReceiver(
        client as never,
        session(),
        { items: [movie] },
        1_000,
      );
      const second = castToJellyfinReceiver(
        client as never,
        session(),
        { items: [{ Id: "item-2", Type: "Movie" }] },
        1_000,
      );

      const [answerEarly, answerLate] = olderAnswersFirst
        ? [answerFirst, answerSecond]
        : [answerSecond, answerFirst];
      answerEarly();
      await sent();
      answerLate();
      await sent();

      expect(await settledWith(first)).toEqual({ status: "superseded" });
      const playNows = mockChannels
        .flatMap((channel) => channel.sendMessage.mock.calls)
        .filter(([message]) => message.command === "PlayNow");
      expect(playNows).toHaveLength(1);
      expect(playNows[0][0].options.items[0].Id).toBe("item-2");

      client.emit(status("buffering", "item-2", "session-b"));
      expect(await second).toEqual({ status: "loaded" });
    },
  );

  test("settles an older cast as replaced when a newer one starts", async () => {
    const client = makeClient();
    const first = castToJellyfinReceiver(
      client as never,
      session(),
      { items: [movie] },
      1_000,
    );
    await sent();
    const second = castToJellyfinReceiver(
      client as never,
      session(),
      { items: [{ Id: "item-2", Type: "Movie" }] },
      1_000,
    );

    expect(await first).toEqual({ status: "superseded" });
    await sent();
    client.emit(status("buffering", "item-2", "session-b"));
    expect(await second).toEqual({ status: "loaded" });
  });

  test("rejects when the command cannot be sent", async () => {
    mockConnectOnAdd = false;

    await expect(
      castToJellyfinReceiver(
        makeClient() as never,
        session(),
        { items: [movie] },
        1_000,
      ),
    ).rejects.toThrow("not connected");
  });
});

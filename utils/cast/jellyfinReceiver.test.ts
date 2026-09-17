import { beforeEach, describe, expect, mock, test } from "bun:test";

type FakeChannel = {
  connected: boolean;
  sendMessage: ReturnType<typeof mock>;
  receive: (message: unknown) => void;
};

let channels: FakeChannel[] = [];
let connectOnAdd = true;

mock.module("react-native-google-cast", () => ({
  CastChannel: {
    add: mock(async (_namespace: string, onMessage: (m: unknown) => void) => {
      const channel: FakeChannel = {
        connected: connectOnAdd,
        sendMessage: mock(async () => {}),
        receive: onMessage,
      };
      channels.push(channel);
      return channel;
    }),
  },
}));

const {
  JELLYFIN_CAST_NAMESPACE,
  playOnJellyfinReceiver,
  sendJellyfinCastCommand,
  subscribeToJellyfinReceiverMessages,
} = await import("./jellyfinReceiver");
const { makeApi } = await import("@/test-utils/jellyfinApi");

const lastChannel = () => channels[channels.length - 1];

beforeEach(() => {
  // The module caches its channel; a disconnected one is what a new Cast
  // session leaves behind, so each test starts from that.
  for (const channel of channels) channel.connected = false;
  channels = [];
  connectOnAdd = true;
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

  test("is opened again once the previous session's channel is gone", async () => {
    const session = { api: makeApi(), userId: "user-1" };

    await sendJellyfinCastCommand("Pause", session);
    lastChannel().connected = false;
    await sendJellyfinCastCommand("Unpause", session);

    expect(channels).toHaveLength(2);
  });

  test("refuses to send when the channel does not connect", async () => {
    connectOnAdd = false;

    await expect(
      sendJellyfinCastCommand("Pause", { api: makeApi(), userId: "user-1" }),
    ).rejects.toThrow("not connected");
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

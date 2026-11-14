/**
 * Replays the shared receiver protocol vectors from e2e/fixtures/receiver-protocol
 * against the TypeScript sender. The Python bench sender and the native engines
 * replay the same files; see the README there before changing a case.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Api } from "@jellyfin/sdk";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import type { CastClient } from "@/modules/mpv-player/src/cast";
import {
  createCastDoubleState,
  lastCastChannel,
  receiveOnChannel,
  sentOn,
  setCastSession,
} from "@/test-utils/cast";
import {
  castToJellyfinReceiver,
  type JellyfinCastSession,
  parseReceiverCustomData,
  playOnJellyfinReceiver,
  queueWindow,
  ReceiverContainerRefusedError,
  type ReceiverMessage,
  receiverNameFor,
  receiverPositionInItem,
  sendJellyfinCastCommand,
  subscribeToJellyfinReceiverMessages,
  toReceiverDeviceName,
} from "./jellyfinReceiver";

const mockCast = createCastDoubleState();
jest.mock("@/modules/mpv-player/src/cast/CastModule", () => ({
  __esModule: true,
  // The factory runs before this file's body, so the state is read lazily.
  CastNative: require("@/test-utils/cast").castDoubleModule(() => mockCast),
}));

type Vector = any;

const vectors = (file: string): Vector =>
  JSON.parse(
    readFileSync(
      join(__dirname, "../../e2e/fixtures/receiver-protocol", file),
      "utf8",
    ),
  );

const table = (cases: Array<{ name: string }>): Array<[string, Vector]> =>
  cases.map((c) => [c.name, c]);

const sessionFrom = (raw: {
  basePath: string;
  accessToken: string;
  userId: string;
  receiverName?: string;
  maxBitrate?: number;
}): JellyfinCastSession => ({
  // The sender only reads the base path and the token off the API object.
  api: {
    basePath: raw.basePath,
    accessToken: raw.accessToken,
  } as unknown as Api,
  userId: raw.userId,
  ...(raw.receiverName ? { receiverName: raw.receiverName } : {}),
  ...(raw.maxBitrate ? { maxBitrate: raw.maxBitrate } : {}),
});

const sentMessages = () =>
  mockCast.channels.flatMap((channel) => sentOn(channel));

let session = 0;
beforeEach(() => {
  session += 1;
  setCastSession(mockCast, `session-${session}`);
  mockCast.channels = [];
  mockCast.connectOnAdd = true;
});

describe("play-now.json", () => {
  const { cases } = vectors("play-now.json");
  test.each(table(cases))("%s", async (_name, vector) => {
    const castSession = sessionFrom(vector.session);
    if (vector.expected.refused === "container") {
      await expect(
        playOnJellyfinReceiver(castSession, vector.request),
      ).rejects.toThrow(ReceiverContainerRefusedError);
      expect(sentMessages()).toEqual([]);
      return;
    }
    if (vector.request) {
      await playOnJellyfinReceiver(castSession, vector.request);
    } else {
      await sendJellyfinCastCommand(
        vector.command,
        castSession,
        vector.options,
      );
    }
    expect(sentOn(lastCastChannel(mockCast))[0]).toEqual(vector.expected);
  });
});

describe("receiver-name.json", () => {
  const { receiverNameFor: nameCases, toReceiverDeviceName: cleanupCases } =
    vectors("receiver-name.json");
  test.each(table(nameCases))("receiverNameFor: %s", (_name, vector) => {
    expect(receiverNameFor(vector.input) ?? null).toBe(vector.expected);
  });
  test.each(table(cleanupCases))(
    "toReceiverDeviceName: %s",
    (_name, vector) => {
      expect(toReceiverDeviceName(vector.input)).toBe(vector.expected);
    },
  );
});

describe("queue-window.json", () => {
  const { cases } = vectors("queue-window.json");
  test.each(table(cases))("%s", (_name, vector) => {
    const { queue, selectedIndex, maxItems } = vector.input;
    expect(queueWindow(queue, selectedIndex, maxItems)).toEqual(
      vector.expected,
    );
  });
});

describe("bus-messages.json", () => {
  const { cases } = vectors("bus-messages.json");
  test.each(table(cases))("%s", async (_name, vector) => {
    const received: ReceiverMessage[] = [];
    const unsubscribe = subscribeToJellyfinReceiverMessages((message) =>
      received.push(message),
    );
    await sendJellyfinCastCommand(
      "Identify",
      sessionFrom(vectors("play-now.json").cases[0].session),
    );
    receiveOnChannel(mockCast, lastCastChannel(mockCast), vector.input);
    unsubscribe();
    if (vector.expected.invalid) {
      expect(received).toEqual([vector.input]);
    } else {
      expect(received).toEqual([vector.expected]);
    }
  });
});

describe("media-status-custom-data.json", () => {
  const { cases } = vectors("media-status-custom-data.json");
  test.each(table(cases))("%s", (_name, vector) => {
    expect(parseReceiverCustomData(vector.input)).toEqual(vector.expected);
  });
});

describe("media-position.json", () => {
  const { cases } = vectors("media-position.json");
  test.each(table(cases))("%s", (_name, vector) => {
    const { currentTime, customData } = vector.input;
    expect(
      receiverPositionInItem(currentTime, parseReceiverCustomData(customData)),
    ).toBe(vector.expected);
  });
});

describe("load-outcomes.json", () => {
  const file = vectors("load-outcomes.json");
  const statusOf = (data: Record<string, unknown>) => ({
    playerState: data.playerState,
    mediaInfo: { customData: { ...data, playerState: undefined } },
  });

  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ["setImmediate", "nextTick"] });
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  const flush = async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve();
  };

  test.each(table(file.cases))("%s", async (_name, vector) => {
    const request: { items: BaseItemDto[] } = vector.request ?? file.request;
    let listener: ((status: unknown) => void) | undefined;
    const client = {
      getMediaStatus: async () =>
        vector.previous
          ? {
              playerState: "playing",
              mediaInfo: { customData: vector.previous },
            }
          : null,
      onMediaStatusUpdated: (handler: (status: unknown) => void) => {
        listener = handler;
        return { remove: () => {} };
      },
    } as unknown as CastClient;
    const castSession = sessionFrom(vectors("play-now.json").cases[1].session);
    // A refused cast rejects at once: caught here, so that its events still
    // play out before the outcome is read.
    const outcome = castToJellyfinReceiver(
      client,
      castSession,
      request,
      file.timeoutMs,
    ).then(
      (result) => ({ result, error: undefined }),
      (error: unknown) => ({ result: undefined, error }),
    );
    await flush();
    for (const event of vector.events) {
      if (event.status) listener?.(statusOf(event.status));
      if (event.message)
        receiveOnChannel(
          mockCast,
          lastCastChannel(mockCast),
          JSON.stringify(event.message),
        );
      if (event.timeout) jest.advanceTimersByTime(file.timeoutMs);
      if (event.supersede) {
        void castToJellyfinReceiver(
          client,
          castSession,
          request,
          file.timeoutMs,
        );
      }
      await flush();
    }
    const { result, error } = await outcome;
    if (vector.expected.refused === "container") {
      expect(error).toBeInstanceOf(ReceiverContainerRefusedError);
      expect(sentMessages()).toEqual([]);
      return;
    }
    expect(error).toBeUndefined();
    expect(result?.status).toBe(vector.expected.status);
    if (vector.expected.error) {
      expect((result as { error?: string }).error).toBe(vector.expected.error);
    }
  });
});

/**
 * Replays the shared receiver protocol vectors from e2e/fixtures/receiver-protocol
 * against the TypeScript sender. The Python bench sender and the native engines
 * replay the same files; see the README there before changing a case.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Api } from "@jellyfin/sdk";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import type { RemoteMediaClient } from "react-native-google-cast";
import {
  createCastDoubleState,
  lastCastChannel,
} from "@/test-utils/googleCast";
import {
  castToJellyfinReceiver,
  type JellyfinCastSession,
  parseReceiverCustomData,
  playOnJellyfinReceiver,
  queueWindow,
  type ReceiverMessage,
  receiverNameFor,
  sendJellyfinCastCommand,
  subscribeToJellyfinReceiverMessages,
  toReceiverDeviceName,
} from "./jellyfinReceiver";

const mockCast = createCastDoubleState();
jest.mock("react-native-google-cast", () =>
  // The factory runs before this file's body, so the state is read lazily.
  require("@/test-utils/googleCast").castDoubleModule(() => mockCast),
);

// biome-ignore lint/suspicious/noExplicitAny: the vectors are untyped JSON by design
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

let session = 0;
beforeEach(() => {
  session += 1;
  mockCast.sessionId = `session-${session}`;
  mockCast.channels = [];
  mockCast.connectOnAdd = true;
});

describe("play-now.json", () => {
  const { cases } = vectors("play-now.json");
  test.each(table(cases))("%s", async (_name, vector) => {
    const castSession = sessionFrom(vector.session);
    if (vector.request) {
      await playOnJellyfinReceiver(castSession, vector.request);
    } else {
      await sendJellyfinCastCommand(
        vector.command,
        castSession,
        vector.options,
      );
    }
    expect(lastCastChannel(mockCast).sendMessage).toHaveBeenCalledWith(
      vector.expected,
    );
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
    lastCastChannel(mockCast).receive(vector.input);
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

describe("load-outcomes.json", () => {
  const file = vectors("load-outcomes.json");
  const request = {
    items: [{ Id: file.request.itemId, Name: "Item" } as BaseItemDto],
  };
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
    } as unknown as RemoteMediaClient;
    const castSession = sessionFrom(vectors("play-now.json").cases[1].session);
    const outcome = castToJellyfinReceiver(
      client,
      castSession,
      request,
      file.timeoutMs,
    );
    await flush();
    for (const event of vector.events) {
      if (event.status) listener?.(statusOf(event.status));
      if (event.message)
        lastCastChannel(mockCast).receive(JSON.stringify(event.message));
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
    const result = await outcome;
    expect(result.status).toBe(vector.expected.status);
    if (vector.expected.error) {
      expect((result as { error?: string }).error).toBe(vector.expected.error);
    }
  });
});

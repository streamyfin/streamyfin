import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { act, render } from "@testing-library/react-native";
import { getDefaultStore } from "jotai";
import { Text } from "react-native";
import { claimAudioOwner, getAudioOwner } from "@/services/audioOwner";
import { resetTrackPlayerSetupForTests } from "@/services/trackPlayerSetup";
import { makeApi } from "@/test-utils/jellyfinApi";
import { clearMmkv } from "@/test-utils/mmkv";
import { QueryWrapper } from "@/test-utils/queryWrapper";
import { apiAtom, userAtom } from "@/utils/atoms/api";
import { bookFromParts } from "@/utils/audiobooks/books";
import { getLocalProgress, saveSession } from "@/utils/audiobooks/storage";
import {
  AudiobookPlayerProvider,
  useAudiobookPlayer,
  useAudiobookProgress,
} from "./AudiobookPlayerProvider";

type Listener = (event: Record<string, unknown>) => void;

/** The native player: its queue, every call that changes it, and its listeners. */
const mockNative = {
  queue: [] as { id: string; url: string }[],
  calls: [] as string[],
  listeners: new Map<string, Listener[]>(),
};

// The package is installed from git with `main` pointing at a build output it
// does not ship, so only Metro (through the `react-native` field) resolves it.
jest.mock(
  "react-native-track-player",
  () => {
    const record =
      (name: string) =>
      async (...args: unknown[]) => {
        mockNative.calls.push(
          args.length && typeof args[0] !== "object"
            ? `${name}(${args.join(",")})`
            : name,
        );
      };
    return {
      __esModule: true,
      Capability: {
        Play: 0,
        Pause: 1,
        Stop: 2,
        SeekTo: 3,
        JumpForward: 4,
        JumpBackward: 5,
      },
      RepeatMode: { Off: 0, Track: 1, Queue: 2 },
      PitchAlgorithm: { Voice: 2 },
      State: {
        Playing: "playing",
        Paused: "paused",
        Buffering: "buffering",
        Loading: "loading",
      },
      Event: {
        PlaybackActiveTrackChanged: "playback-active-track-changed",
        PlaybackState: "playback-state",
        PlaybackQueueEnded: "playback-queue-ended",
        PlaybackProgressUpdated: "playback-progress-updated",
        PlaybackError: "playback-error",
      },
      default: {
        setupPlayer: record("setupPlayer"),
        updateOptions: async () => undefined,
        setRepeatMode: record("setRepeatMode"),
        setVolume: async () => undefined,
        play: record("play"),
        pause: record("pause"),
        setRate: record("setRate"),
        seekTo: record("seekTo"),
        updateMetadataForTrack: async () => undefined,
        reset: async () => {
          mockNative.calls.push("reset");
          mockNative.queue = [];
        },
        add: async (track: { id: string; url: string }) => {
          mockNative.calls.push(`add(${track.id})`);
          mockNative.queue.push(track);
        },
        skip: record("skip"),
        getQueue: async () => [...mockNative.queue],
        remove: record("remove"),
        addEventListener: (event: string, listener: Listener) => {
          const list = mockNative.listeners.get(event) ?? [];
          list.push(listener);
          mockNative.listeners.set(event, list);
          return {
            remove: () => {
              mockNative.listeners.set(
                event,
                (mockNative.listeners.get(event) ?? []).filter(
                  (l) => l !== listener,
                ),
              );
            },
          };
        },
      },
    };
  },
  { virtual: true },
);

jest.mock("@/utils/jellyfin/audio/getAudioStreamUrl", () => ({
  getAudioStreamUrl: async (
    _api: unknown,
    _userId: string,
    itemId: string,
  ) => ({
    url: `https://jellyfin.example.com/Audio/${itemId}/stream`,
    sessionId: `session-${itemId}`,
    mediaSource: { Id: itemId, Container: "m4b" },
    isTranscoding: false,
  }),
}));
jest.mock("@/providers/AudioStorage", () => {
  const { EventEmitter } = jest.requireActual("eventemitter3");
  return {
    audioStorageEvents: new EventEmitter(),
    initAudioStorage: async () => undefined,
    getLocalPath: () => null,
    isDownloading: () => false,
    downloadTrack: async () => undefined,
  };
});
jest.mock("@/providers/NetworkStatusProvider", () => ({
  useNetworkStatus: () => ({ isConnected: true, serverConnected: true }),
}));

const HOUR = 3600;
const ticks = (seconds: number) => seconds * 10_000_000;

const part = (
  id: string,
  userData: Partial<NonNullable<BaseItemDto["UserData"]>> = {},
): BaseItemDto => ({
  Id: id,
  Name: id,
  Type: "AudioBook",
  ServerId: "server",
  ParentId: "folder",
  RunTimeTicks: ticks(HOUR),
  UserData: { Key: id, ...userData },
});

const api = makeApi();
const START_URL = "https://jellyfin.example.com/Sessions/Playing";
const STOP_URL = "https://jellyfin.example.com/Sessions/Playing/Stopped";

const fire = async (event: string, payload: Record<string, unknown>) => {
  await act(async () => {
    for (const listener of mockNative.listeners.get(event) ?? []) {
      listener(payload);
    }
  });
  await settle();
};

const settle = async () => {
  for (let i = 0; i < 20; i++) {
    await act(async () => {});
  }
};

type Player = ReturnType<typeof useAudiobookPlayer>;
let player: Player;
let position = 0;

const Probe = () => {
  player = useAudiobookPlayer();
  position = useAudiobookProgress().position;
  return <Text>{player.book?.title ?? "none"}</Text>;
};

const mount = async () => {
  await render(
    <QueryWrapper>
      <AudiobookPlayerProvider>
        <Probe />
      </AudiobookPlayerProvider>
    </QueryWrapper>,
  );
  await settle();
};

const run = async (action: (player: Player) => unknown) => {
  await act(async () => {
    await action(player);
  });
  await settle();
};

const reported = (url: string) =>
  (api.mock.history.post ?? [])
    .filter((request) => request.url === url)
    .map((request) => JSON.parse(request.data).ItemId);

beforeEach(() => {
  clearMmkv();
  resetTrackPlayerSetupForTests();
  mockNative.queue = [];
  mockNative.calls = [];
  api.mock.reset();
  api.mock.resetHistory();
  api.mock.onPost().reply(204);
  getDefaultStore().set(apiAtom, api);
  getDefaultStore().set(userAtom, { Id: "user", ServerId: "server" });
});

afterEach(() => {
  // A fresh owner for the next test.
  claimAudioOwner("music");
});

describe("playing a book", () => {
  test("starts where the server has it and queues the parts after", async () => {
    const book = bookFromParts([
      part("p1", { Played: true, LastPlayedDate: "2026-11-01T10:00:00Z" }),
      part("p2", {
        PlaybackPositionTicks: ticks(600),
        LastPlayedDate: "2026-11-02T10:00:00Z",
      }),
      part("p3"),
    ]);
    await mount();
    await run((p) => p.playBook(book));

    expect(mockNative.calls).toEqual(
      expect.arrayContaining([
        "reset",
        "add(p2)",
        "seekTo(600)",
        "play",
        "setRate(1)",
        "add(p3)",
      ]),
    );
    expect(mockNative.queue.map((track) => track.id)).toEqual(["p2", "p3"]);
    expect(getAudioOwner()).toBe("audiobook");
    expect(player.isLive).toBe(true);
    expect(player.partIndex).toBe(1);
    expect(position).toBe(HOUR + 600);
    expect(reported(START_URL)).toEqual(["p2"]);
  });

  test("tells how the part playing plays, the next one once it plays", async () => {
    const book = bookFromParts([part("p1"), part("p2")]);
    await mount();
    await run((p) => p.playBook(book));
    expect(player.partMedia).toEqual({
      mediaSource: { Id: "p1", Container: "m4b" },
      method: "DirectStream",
    });

    await fire("playback-active-track-changed", {
      index: 1,
      lastPosition: HOUR,
    });

    expect(player.partMedia?.mediaSource?.Id).toBe("p2");
  });

  test("a part ending reports it and starts the next", async () => {
    const book = bookFromParts([part("p1"), part("p2")]);
    await mount();
    await run((p) => p.playBook(book));
    api.mock.resetHistory();

    await fire("playback-active-track-changed", {
      index: 1,
      lastPosition: HOUR,
    });

    expect(reported(STOP_URL)).toEqual(["p1"]);
    expect(reported(START_URL)).toEqual(["p2"]);
    expect(player.partIndex).toBe(1);
  });

  test("seeking back before the part it started on reloads from there", async () => {
    const book = bookFromParts([
      part("p1"),
      part("p2", {
        PlaybackPositionTicks: ticks(60),
        LastPlayedDate: "2026-11-02T10:00:00Z",
      }),
    ]);
    await mount();
    await run((p) => p.playBook(book));
    mockNative.calls = [];

    await run((p) => p.seekTo(120));

    expect(
      mockNative.calls.filter((call) => !call.startsWith("setRepeatMode")),
    ).toEqual(expect.arrayContaining(["reset", "add(p1)", "seekTo(120)"]));
    expect(mockNative.queue.map((track) => track.id)).toEqual(["p1", "p2"]);
    expect(player.partIndex).toBe(0);
  });

  test("skipping within the part playing only seeks", async () => {
    const book = bookFromParts([part("p1")]);
    await mount();
    await run((p) => p.playBook(book));
    await fire("playback-progress-updated", { position: 100, track: 0 });
    mockNative.calls = [];

    await run((p) => p.skipBy(-15));

    expect(mockNative.calls).toEqual(["seekTo(85)"]);
  });
});

describe("the end of a book", () => {
  test("plays the next book in the queue", async () => {
    const first = bookFromParts([part("a1")]);
    const second = bookFromParts([part("b1")]);
    await mount();
    await run((p) => p.playBook(first));
    await run((p) => p.addToQueue(second));
    expect(player.queue.map((book) => book.id)).toEqual(["b1"]);

    await fire("playback-queue-ended", { track: 0, position: HOUR });

    expect(player.book?.id).toBe("b1");
    expect(player.queue).toEqual([]);
    expect(getLocalProgress("server:user", "a1")?.finished).toBe(true);
    // Its end is told once, not again by the next book's load.
    expect(reported(STOP_URL)).toEqual(["a1"]);
  });

  test("play on a finished book starts it over", async () => {
    const book = bookFromParts([part("a1"), part("a2")]);
    await mount();
    await run((p) => p.playBook(book, { position: HOUR + 10 }));
    // Loaded from the second part, which is the native queue's first track.
    await fire("playback-queue-ended", { track: 0, position: HOUR });
    expect(player.isLive).toBe(false);
    mockNative.calls = [];

    await run((p) => p.play());

    expect(mockNative.calls).toEqual(
      expect.arrayContaining(["reset", "add(a1)", "play"]),
    );
    expect(mockNative.calls).not.toContain("seekTo(3600)");
  });

  // A reset empties the native queue too: only the end of the part counts.
  test("a queue emptied far from the part's end is not the end", async () => {
    const book = bookFromParts([part("a1")]);
    await mount();
    await run((p) => p.playBook(book));

    await fire("playback-queue-ended", { track: 0, position: 12 });

    expect(getLocalProgress("server:user", "a1")?.finished).toBe(false);
  });
});

describe("sharing the native player with music", () => {
  test("music taking over lets the book go and keeps its place", async () => {
    const book = bookFromParts([part("p1")]);
    await mount();
    await run((p) => p.playBook(book));
    await fire("playback-progress-updated", { position: 900, track: 0 });
    mockNative.calls = [];

    await act(async () => {
      claimAudioOwner("music");
    });
    await settle();

    expect(player.book).toBe(null);
    expect(getLocalProgress("server:user", "p1")?.partPosition).toBe(900);
    // The player is music's now: nothing of the book touches it.
    expect(mockNative.calls).toEqual([]);
  });
});

describe("after a restart", () => {
  test("the book comes back paused and plays from where it was", async () => {
    const book = bookFromParts([part("p1"), part("p2")]);
    saveSession({
      account: "server:user",
      book,
      partIndex: 1,
      partPosition: 300,
      queue: [],
    });
    await mount();

    expect(player.book?.id).toBe("p1");
    expect(player.isLive).toBe(false);
    expect(mockNative.calls).toEqual([]);

    await run((p) => p.play());

    expect(mockNative.calls).toEqual(
      expect.arrayContaining(["reset", "add(p2)", "seekTo(300)", "play"]),
    );
  });

  test("another account's book does not come back", async () => {
    saveSession({
      account: "server:someone-else",
      book: bookFromParts([part("p1")]),
      partIndex: 0,
      partPosition: 300,
      queue: [],
    });
    await mount();

    expect(player.book).toBe(null);
  });
});

describe("the sleep timer", () => {
  test("the end of chapter timer waits for the chapter playing", async () => {
    const book = bookFromParts([
      {
        ...part("p1"),
        Chapters: [
          { Name: "One", StartPositionTicks: 0 },
          { Name: "Two", StartPositionTicks: ticks(600) },
        ],
      },
    ]);
    await mount();
    await run((p) => p.playBook(book));
    await fire("playback-progress-updated", { position: 30, track: 0 });
    await run((p) => p.setSleepTimer({ mode: "chapter" }));

    expect(player.sleepTimer).toEqual({ mode: "chapter" });
    await run((p) => p.setSleepTimer({ mode: "off" }));
    expect(player.sleepTimer).toEqual({ mode: "off" });
  });
});

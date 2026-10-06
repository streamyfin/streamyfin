import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { act, render } from "@testing-library/react-native";
import { getDefaultStore } from "jotai";
import { userAtom } from "@/providers/JellyfinProvider";
import { clearMmkv } from "@/test-utils/mmkv";
import { storage } from "@/utils/mmkv";
import { MusicPlayerProvider, useMusicPlayer } from "./MusicPlayerProvider";

interface NativeTrack {
  id: string;
}

/**
 * The native queue, with the bounds react-native-track-player enforces on iOS
 * (RNTrackPlayer.swift): `skip` rejects past the last track, and `add` rejects
 * with the very same message when asked to insert past the end.
 */
const mockNative = {
  queue: [] as NativeTrack[],
  activeIndex: undefined as number | undefined,
  outOfBounds: () => new Error("The track index is out of bounds"),
  /**
   * Runs between the native side answering a queue read and the caller seeing
   * the answer, which is when another caller's edit can slip in.
   */
  afterQueueRead: undefined as (() => Promise<void>) | undefined,
  /** Queue reads the spec keeps pending, or null to answer them at once. */
  heldQueueReads: null as Array<() => void> | null,
  /** Resets the spec keeps from answering, or null to answer them at once. */
  heldResets: null as Array<() => void> | null,
};

// The package is installed from git with `main` pointing at a build output it
// does not ship, so only Metro (through the `react-native` field) resolves it.
jest.mock(
  "react-native-track-player",
  () => ({
    __esModule: true,
    Capability: {},
    RepeatMode: { Off: 0, Track: 1, Queue: 2 },
    default: {
      setupPlayer: async () => undefined,
      updateOptions: async () => undefined,
      setRepeatMode: async () => undefined,
      play: async () => undefined,
      pause: async () => undefined,
      seekTo: async () => undefined,
      getProgress: async () => ({ position: 0, duration: 0, buffered: 0 }),
      getQueue: async () => {
        const held = mockNative.heldQueueReads;
        if (held) await new Promise<void>((release) => held.push(release));
        const answer = [...mockNative.queue];
        await mockNative.afterQueueRead?.();
        return answer;
      },
      getActiveTrackIndex: async () => mockNative.activeIndex,
      getActiveTrack: async () =>
        mockNative.activeIndex === undefined
          ? undefined
          : mockNative.queue[mockNative.activeIndex],
      // The native side runs its calls in the order they were made, so the
      // queue is empty at once and only the answer can be kept waiting.
      reset: async () => {
        mockNative.queue = [];
        mockNative.activeIndex = undefined;
        const held = mockNative.heldResets;
        if (held) await new Promise<void>((release) => held.push(release));
      },
      add: async (
        tracks: NativeTrack | NativeTrack[],
        insertBeforeIndex = -1,
      ) => {
        const added = Array.isArray(tracks) ? tracks : [tracks];
        const count = mockNative.queue.length;
        const index = insertBeforeIndex === -1 ? count : insertBeforeIndex;
        if (index < 0 || index > count) throw mockNative.outOfBounds();
        mockNative.queue.splice(index, 0, ...added);
        if (mockNative.activeIndex === undefined) {
          mockNative.activeIndex = 0;
        } else if (index <= mockNative.activeIndex) {
          mockNative.activeIndex += added.length;
        }
        return index;
      },
      skip: async (index: number) => {
        if (index < 0 || index > mockNative.queue.length - 1) {
          throw mockNative.outOfBounds();
        }
        mockNative.activeIndex = index;
      },
      skipToNext: async () => {
        if ((mockNative.activeIndex ?? -1) < mockNative.queue.length - 1) {
          mockNative.activeIndex = (mockNative.activeIndex ?? -1) + 1;
        }
      },
      skipToPrevious: async () => {
        if ((mockNative.activeIndex ?? 0) > 0) {
          mockNative.activeIndex = (mockNative.activeIndex ?? 0) - 1;
        }
      },
    },
  }),
  { virtual: true },
);

/** Stream URL requests the spec keeps pending, by item id. */
const mockHeldStreams = new Map<string, Array<() => void>>();
/** Items the server has no stream for. */
const mockUnavailableStreams = new Set<string>();

jest.mock("@/utils/jellyfin/audio/getAudioStreamUrl", () => ({
  getAudioStreamUrl: async (_api: unknown, _userId: string, itemId: string) => {
    const held = mockHeldStreams.get(itemId);
    if (held) await new Promise<void>((release) => held.push(release));
    if (mockUnavailableStreams.has(itemId)) return null;
    return {
      url: `https://jellyfin.example.com/Audio/${itemId}/stream`,
      sessionId: null,
      mediaSource: null,
      isTranscoding: false,
    };
  },
}));
jest.mock(
  "react-native-mmkv",
  () => jest.requireActual("@/test-utils/mmkv").mmkvModule,
);
// The log module loads Sentry and its timers. Nothing on the path under test logs.
jest.mock("@/utils/log", () => ({ logAndCaptureError: () => undefined }));
jest.mock("@/utils/customHeaders", () => ({
  getJellyfinHeadersForUrl: () => undefined,
}));
jest.mock("@/utils/atoms/settings", () => ({
  settingsAtom: jest.requireActual("jotai").atom({}),
}));
jest.mock("@/providers/JellyfinProvider", () => {
  const { atom } = jest.requireActual("jotai");
  return {
    apiAtom: atom({ basePath: "https://jellyfin.example.com" }),
    userAtom: atom({ Id: "user", ServerId: "server" }),
  };
});
jest.mock("@/providers/NetworkStatusProvider", () => ({
  useNetworkStatus: () => ({ isConnected: true, serverConnected: true }),
}));
jest.mock("@/providers/AudioStorage", () => ({
  initAudioStorage: async () => undefined,
  setMaxCacheSizeMB: () => undefined,
  getLocalPath: () => null,
  isDownloading: () => false,
  downloadTrack: async () => undefined,
}));
jest.mock("@jellyfin/sdk/lib/utils/api", () => ({
  getPlaystateApi: () => ({
    reportPlaybackStart: async () => undefined,
    reportPlaybackProgress: async () => undefined,
    reportPlaybackStopped: async () => undefined,
  }),
}));

const track = (id: string): BaseItemDto => ({
  Id: id,
  Name: id,
  ServerId: "server",
});
const ALBUM = ["t0", "t1", "t2", "t3", "t4"].map(track);

/** Keeps the stream URL request of these tracks pending until released. */
const holdStreams = (...ids: string[]) => {
  for (const id of ids) mockHeldStreams.set(id, []);
};

/** Lets every pending stream URL request through, and the ones after it. */
const releaseStreams = async () => {
  const pending = [...mockHeldStreams.values()].flat();
  mockHeldStreams.clear();
  await act(async () => {
    for (const release of pending) release();
  });
  await settle();
};

/** Lets the pending stream URL request of one track through. */
const releaseStream = (id: string) => {
  const pending = mockHeldStreams.get(id) ?? [];
  mockHeldStreams.delete(id);
  for (const release of pending) release();
};

/** Keeps every native queue read pending until released. */
const holdQueueReads = () => {
  mockNative.heldQueueReads = [];
};

const releaseQueueReads = async () => {
  const pending = mockNative.heldQueueReads ?? [];
  mockNative.heldQueueReads = null;
  await act(async () => {
    for (const release of pending) release();
  });
  await settle();
};

/** Keeps every reset of the native queue from answering until released. */
const holdResets = () => {
  mockNative.heldResets = [];
};

const releaseResets = async () => {
  const pending = mockNative.heldResets ?? [];
  mockNative.heldResets = null;
  await act(async () => {
    for (const release of pending) release();
  });
  await settle();
};

/** Lets the promise chains started by the last action run out. */
const settle = async () => {
  for (let i = 0; i < 20; i++) {
    await act(async () => {});
  }
};

type Player = ReturnType<typeof useMusicPlayer>;
let player: Player;

const Probe = () => {
  player = useMusicPlayer();
  return null;
};

/**
 * Runs a player action to its end. The context types them as returning
 * nothing, since screens fire them from a press handler without awaiting,
 * which is why a rejection in one surfaces as an unhandled rejection.
 */
const run = async (action: (player: Player) => unknown) => {
  await act(async () => {
    await action(player);
  });
  await settle();
};

const mount = async () => {
  await render(
    <MusicPlayerProvider>
      <Probe />
    </MusicPlayerProvider>,
  );
  await settle();
};

/** What a previous launch left behind: a queue, and the track it was on. */
const persistQueue = (queue: BaseItemDto[], queueIndex: number) => {
  storage.set("music_player_queue", JSON.stringify(queue));
  storage.set("music_player_queue_index", queueIndex.toString());
  storage.set("music_player_queue_owner", "server:user");
};

const nativeIds = () => mockNative.queue.map((t) => t.id);
const nativeActiveId = () =>
  mockNative.activeIndex === undefined
    ? undefined
    : mockNative.queue[mockNative.activeIndex]?.id;

describe("MusicPlayerProvider and the native queue", () => {
  beforeEach(() => {
    clearMmkv();
    mockHeldStreams.clear();
    mockUnavailableStreams.clear();
    mockNative.queue = [];
    mockNative.activeIndex = undefined;
    mockNative.afterQueueRead = undefined;
    getDefaultStore().set(userAtom, { Id: "user", ServerId: "server" });
    mockNative.heldQueueReads = null;
    mockNative.heldResets = null;
  });

  // Sentry REACT-NATIVE-AW. Playback starts on one track and the rest of the
  // queue is added in the background, a network round trip per track, so the
  // native queue is shorter than the one on screen for a while. Tapping a row
  // further down asked the native side to insert at the row's index.
  test("jumps to a track the background load has not reached yet", async () => {
    await mount();
    holdStreams("t1");
    await run((p) => p.playQueue(ALBUM, 0));
    expect(nativeIds()).toEqual(["t0"]);

    holdStreams("t2");
    await run((p) => p.jumpToIndex(3));

    expect(nativeActiveId()).toBe("t3");
    expect(player.currentTrack?.Id).toBe("t3");
    expect(player.queueIndex).toBe(3);
    expect(player.isLoading).toBe(false);

    // The load catches up without playing t3 twice or out of turn.
    await releaseStreams();
    expect(nativeIds()).toEqual(["t0", "t1", "t2", "t3", "t4"]);
    expect(nativeActiveId()).toBe("t3");
  });

  test("jumps back to a track that comes before the one playback started on", async () => {
    await mount();
    holdStreams("t0");
    await run((p) => p.playQueue(ALBUM, 3));
    expect(nativeIds()).toEqual(["t3"]);

    holdStreams("t2");
    await run((p) => p.jumpToIndex(1));
    expect(nativeIds()).toEqual(["t1", "t3"]);
    expect(nativeActiveId()).toBe("t1");

    await releaseStreams();
    expect(nativeIds()).toEqual(["t0", "t1", "t2", "t3", "t4"]);
    expect(nativeActiveId()).toBe("t1");
    expect(player.currentTrack?.Id).toBe("t1");
    expect(player.queueIndex).toBe(1);
  });

  // The tracks in front of the start track go in once they are all prepared.
  // Nothing moved playback meanwhile, so the position is theirs to set.
  test("points at the track playback started on once the earlier tracks are in", async () => {
    await mount();
    holdStreams("t0");
    await run((p) => p.playQueue(ALBUM, 3));
    expect(nativeIds()).toEqual(["t3"]);

    await releaseStreams();

    expect(nativeIds()).toEqual(["t0", "t1", "t2", "t3", "t4"]);
    expect(nativeActiveId()).toBe("t3");
    expect(player.currentTrack?.Id).toBe("t3");
    expect(player.queueIndex).toBe(3);
  });

  // A jump reads the native queue and then acts on what it read, and the
  // background load edits that queue on its own schedule. Here the load gets
  // its next stream URL right after the jump's read: without taking turns it
  // appends t1 (then t2, t3...) under the jump, which goes on to add t3 a
  // second time and to skip to the index it worked out from the stale read.
  test("plays the tapped track when the background load adds one at the same moment", async () => {
    await mount();
    holdStreams("t1");
    await run((p) => p.playQueue(ALBUM, 0));
    expect(nativeIds()).toEqual(["t0"]);

    let reads = 0;
    mockNative.afterQueueRead = async () => {
      reads += 1;
      // The jump's second read, the one it takes after preparing the track.
      if (reads !== 2) return;
      releaseStream("t1");
      for (let i = 0; i < 20; i++) await Promise.resolve();
    };
    await run((p) => p.jumpToIndex(3));
    mockNative.afterQueueRead = undefined;
    await settle();

    expect(nativeIds()).toEqual(["t0", "t1", "t2", "t3", "t4"]);
    expect(nativeActiveId()).toBe("t3");
    expect(player.currentTrack?.Id).toBe("t3");
  });

  // Switching account resets the player, and nothing of the previous account
  // may come back into it. A jump that was waiting for its stream URL used to
  // carry on: it added the old account's track to the emptied queue and made
  // it the current track again.
  test("drops a jump whose track arrives after the session switched account", async () => {
    await mount();
    holdStreams("t1");
    await run((p) => p.playQueue(ALBUM, 0));

    holdStreams("t3");
    let jump: unknown;
    await act(async () => {
      jump = player.jumpToIndex(3);
    });
    await act(async () => {
      getDefaultStore().set(userAtom, { Id: "other", ServerId: "server" });
    });
    await settle();
    expect(nativeIds()).toEqual([]);

    await releaseStreams();
    await act(async () => {
      await jump;
    });

    expect(nativeIds()).toEqual([]);
    expect(player.currentTrack).toBeNull();
    expect(player.isLoading).toBe(false);
  });

  // The same switch, later: the stream URL is in and the jump is already
  // reading the queue. Checking the session once after the request is not
  // enough, it has to hold at the moment the track is added.
  test("drops a jump when the account switches while it reads the queue", async () => {
    await mount();
    holdStreams("t1");
    await run((p) => p.playQueue(ALBUM, 0));

    let reads = 0;
    let finishRead = () => {};
    mockNative.afterQueueRead = async () => {
      reads += 1;
      // The jump's second read, the one it takes after preparing the track.
      if (reads !== 2) return;
      await new Promise<void>((resolve) => {
        finishRead = resolve;
      });
    };
    let jump: unknown;
    await act(async () => {
      jump = player.jumpToIndex(3);
    });
    await settle();

    await act(async () => {
      getDefaultStore().set(userAtom, { Id: "other", ServerId: "server" });
    });
    await settle();
    expect(nativeIds()).toEqual([]);

    mockNative.afterQueueRead = undefined;
    await act(async () => {
      finishRead();
      await jump;
    });
    await settle();

    expect(nativeIds()).toEqual([]);
    expect(player.currentTrack).toBeNull();
    expect(player.isLoading).toBe(false);
  });

  // Same report, the other way in: a queue restored after a restart is only
  // on screen. Resuming loads the one track it stopped on.
  test("jumps to another track of a queue restored after a restart", async () => {
    persistQueue(ALBUM, 2);
    await mount();
    await run((p) => p.resume());
    expect(nativeIds()).toEqual(["t2"]);

    await run((p) => p.jumpToIndex(4));
    expect(nativeIds()).toEqual(["t2", "t4"]);
    expect(nativeActiveId()).toBe("t4");
    expect(player.currentTrack?.Id).toBe("t4");

    await run((p) => p.jumpToIndex(0));
    expect(nativeIds()).toEqual(["t0", "t2", "t4"]);
    expect(nativeActiveId()).toBe("t0");
    expect(player.queueIndex).toBe(0);
  });

  // An id cannot tell two copies of a track apart; the row's index can, once
  // the native queue has caught up with the one on screen.
  test("jumps to the second copy of a track that is queued twice", async () => {
    await mount();
    await run((p) => p.playQueue(["a", "b", "a"].map(track), 0));
    expect(nativeIds()).toEqual(["a", "b", "a"]);

    await run((p) => p.jumpToIndex(2));

    expect(mockNative.activeIndex).toBe(2);
    expect(player.queueIndex).toBe(2);
  });

  test("previous wraps to the last track loaded while the queue is still loading", async () => {
    storage.set("music_player_repeat_mode", "all");
    await mount();
    holdStreams("t2");
    await run((p) => p.playQueue(ALBUM, 0));
    expect(nativeIds()).toEqual(["t0", "t1"]);

    await run((p) => p.previous());

    expect(nativeActiveId()).toBe("t1");
    expect(player.currentTrack?.Id).toBe("t1");
    expect(player.queueIndex).toBe(1);
  });

  // The native queue lines up with the one on screen here, so the copy the
  // player landed on is the row at the same index, not the first row that
  // has its id.
  test("previous wraps to the last copy of a track that is queued twice", async () => {
    storage.set("music_player_repeat_mode", "all");
    await mount();
    await run((p) => p.playQueue(["a", "b", "a"].map(track), 0));

    await run((p) => p.previous());

    expect(mockNative.activeIndex).toBe(2);
    expect(player.queueIndex).toBe(2);
  });

  // After a jump has loaded a track on demand the native queue has gaps, and
  // its neighbours are not the rows next to each other on screen.
  test("next and previous show the track the player moved to across a gap", async () => {
    persistQueue(ALBUM, 2);
    await mount();
    await run((p) => p.resume());
    await run((p) => p.jumpToIndex(4));
    expect(nativeIds()).toEqual(["t2", "t4"]);

    await run((p) => p.previous());
    expect(nativeActiveId()).toBe("t2");
    expect(player.currentTrack?.Id).toBe("t2");
    expect(player.queueIndex).toBe(2);

    await run((p) => p.next());
    expect(nativeActiveId()).toBe("t4");
    expect(player.currentTrack?.Id).toBe("t4");
    expect(player.queueIndex).toBe(4);
  });

  test("next leaves a restored queue alone until something is loaded", async () => {
    storage.set("music_player_repeat_mode", "all");
    persistQueue(ALBUM, 2);
    await mount();

    await run((p) => p.next());

    expect(nativeIds()).toEqual([]);
    expect(player.currentTrack?.Id).toBe("t2");
    expect(player.queueIndex).toBe(2);
  });

  // The insert position used to be read before the stream URL request, and a
  // queue started during that request is shorter than the position.
  test("plays next after the track that is playing once the stream URL arrives", async () => {
    await mount();
    await run((p) => p.playQueue(ALBUM, 0));
    await run((p) => p.jumpToIndex(4));
    expect(nativeActiveId()).toBe("t4");

    holdStreams("extra");
    let queued: unknown;
    await act(async () => {
      queued = player.playNext(track("extra"));
    });
    await run((p) => p.playQueue([track("other")], 0));
    expect(nativeIds()).toEqual(["other"]);

    await releaseStreams();
    await act(async () => {
      await queued;
    });

    expect(nativeIds()).toEqual(["other", "extra"]);
    expect(nativeActiveId()).toBe("other");
  });

  // The rest of a queue is added in the background, a network round trip per
  // track, and that load only noticed an account switch. Starting another queue
  // meanwhile reset the native queue, and the first load went on appending its
  // own tracks behind the new one, where they played without being on screen.
  describe("a queue that is still loading", () => {
    const OTHER = ["o0", "o1"].map(track);

    test("stops loading once another queue replaces it", async () => {
      await mount();
      holdStreams("t2");
      await run((p) => p.playQueue(ALBUM, 0));
      expect(nativeIds()).toEqual(["t0", "t1"]);

      await run((p) => p.playQueue(OTHER, 0));
      await releaseStreams();

      expect(nativeIds()).toEqual(["o0", "o1"]);
      expect(nativeActiveId()).toBe("o0");
      expect(player.queue.map((t) => t.Id)).toEqual(["o0", "o1"]);
      expect(player.queueIndex).toBe(0);
    });

    // The tracks in front of the one that was tapped go in as one batch, and
    // the load then points the index at the tapped track by id. Playing that
    // same track on its own left the index past the end of a one track queue.
    test("leaves the index of the queue that replaced it alone", async () => {
      await mount();
      holdStreams("t0");
      await run((p) => p.playQueue(ALBUM, 3));
      expect(nativeIds()).toEqual(["t3"]);

      await run((p) => p.playQueue([track("t3")], 0));
      await releaseStreams();

      expect(nativeIds()).toEqual(["t3"]);
      expect(player.queue.map((t) => t.Id)).toEqual(["t3"]);
      expect(player.queueIndex).toBe(0);
    });

    // A track that fails to load is dropped from the queue on screen once the
    // load is through, by id, so it must not reach a queue that came after.
    test("does not drop its unavailable tracks from the queue that replaced it", async () => {
      await mount();
      mockUnavailableStreams.add("t1");
      holdStreams("t2");
      await run((p) => p.playQueue(ALBUM, 0));
      mockUnavailableStreams.clear();

      await run((p) => p.playQueue(["o0", "t1"].map(track), 0));
      await releaseStreams();

      expect(nativeIds()).toEqual(["o0", "t1"]);
      expect(player.queue.map((t) => t.Id)).toEqual(["o0", "t1"]);
    });

    test("stops loading once playback is stopped", async () => {
      await mount();
      holdStreams("t2");
      await run((p) => p.playQueue(ALBUM, 0));

      await run((p) => p.stop());
      await releaseStreams();

      expect(nativeIds()).toEqual([]);
      expect(player.queue).toEqual([]);
      expect(player.currentTrack).toBeNull();
    });

    // The load has to be called off before the reset is sent, not once it has
    // answered: a stream URL that arrives in between passes for current, and
    // its track lands in the queue the reset just emptied.
    test("adds nothing while the reset that stops playback is under way", async () => {
      await mount();
      holdStreams("t2");
      await run((p) => p.playQueue(ALBUM, 0));

      holdResets();
      let stopped: unknown;
      await act(async () => {
        stopped = player.stop();
      });
      await releaseStreams();
      await releaseResets();
      await act(async () => {
        await stopped;
      });

      expect(nativeIds()).toEqual([]);
      expect(player.queue).toEqual([]);
    });

    test("adds nothing while the reset for the queue that replaces it is under way", async () => {
      await mount();
      holdStreams("t2");
      await run((p) => p.playQueue(ALBUM, 0));

      holdResets();
      await run((p) => p.playQueue(OTHER, 0));
      await releaseStreams();
      await releaseResets();

      expect(nativeIds()).toEqual(["o0", "o1"]);
      expect(player.queue.map((t) => t.Id)).toEqual(["o0", "o1"]);
    });

    // Nothing was reset, so the first queue is still the one playing and the
    // one on screen. Cancelling its load here would leave it cut short.
    test("keeps loading when the queue meant to replace it cannot start", async () => {
      await mount();
      holdStreams("t2");
      await run((p) => p.playQueue(ALBUM, 0));

      mockUnavailableStreams.add("gone");
      await run((p) => p.playQueue([track("gone")], 0));
      expect(player.isLoading).toBe(false);
      await releaseStreams();

      expect(nativeIds()).toEqual(["t0", "t1", "t2", "t3", "t4"]);
      expect(nativeActiveId()).toBe("t0");
      expect(player.queue.map((t) => t.Id)).toEqual(nativeIds());
    });

    // After a jump ahead of the load, each track is placed by reading the
    // native queue first. A queue that starts during that read has already
    // reset by the time the answer is back.
    test("does not place a track in a queue that started while it read the native one", async () => {
      await mount();
      holdStreams("t1");
      await run((p) => p.playQueue(ALBUM, 0));
      await run((p) => p.jumpToIndex(3));
      expect(nativeIds()).toEqual(["t0", "t3"]);

      holdQueueReads();
      await releaseStreams();
      await run((p) => p.playQueue([track("o0")], 0));
      await releaseQueueReads();

      expect(nativeIds()).toEqual(["o0"]);
    });
  });
});

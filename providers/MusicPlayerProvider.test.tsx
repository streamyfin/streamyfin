import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { act, render, screen, waitFor } from "@testing-library/react-native";
import { getDefaultStore } from "jotai";
import { Text } from "react-native";
import { userAtom } from "@/providers/JellyfinProvider";
import type { makeApi } from "@/test-utils/jellyfinApi";
import { clearMmkv } from "@/test-utils/mmkv";
import { storage } from "@/utils/mmkv";
import { enterVideoSession } from "@/utils/videoSession";
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
      setVolume: async () => undefined,
      play: async () => undefined,
      pause: async () => undefined,
      seekTo: async () => undefined,
      getProgress: async () => ({ position: 0, duration: 0, buffered: 0 }),
      getQueue: async () => {
        const answer = [...mockNative.queue];
        await mockNative.afterQueueRead?.();
        return answer;
      },
      getActiveTrackIndex: async () => mockNative.activeIndex,
      getActiveTrack: async () =>
        mockNative.activeIndex === undefined
          ? undefined
          : mockNative.queue[mockNative.activeIndex],
      reset: async () => {
        mockNative.queue = [];
        mockNative.activeIndex = undefined;
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

/** The socket's subscribers, by message type. */
const mockHandlers = new Map<string, (data: unknown) => void>();

/** Stream URL requests the spec keeps pending, by item id. */
const mockHeldStreams = new Map<string, Array<() => void>>();

jest.mock("@/utils/jellyfin/audio/getAudioStreamUrl", () => ({
  getAudioStreamUrl: async (_api: unknown, _userId: string, itemId: string) => {
    const held = mockHeldStreams.get(itemId);
    if (held) await new Promise<void>((release) => held.push(release));
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
  const { makeApi: make } = jest.requireActual("@/test-utils/jellyfinApi");
  const mockApi = make();
  return {
    apiAtom: atom(mockApi),
    userAtom: atom({ Id: "user", ServerId: "server" }),
    mockApi,
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
jest.mock("@/providers/WebSocketProvider", () => ({
  useWebSocketContext: () => ({
    subscribe: (type: string, handler: (data: unknown) => void) => {
      mockHandlers.set(type, handler);
      return () => mockHandlers.delete(type);
    },
  }),
}));

const api: ReturnType<typeof makeApi> = jest.requireMock(
  "@/providers/JellyfinProvider",
).mockApi;

const START_URL = "https://jellyfin.example.com/Sessions/Playing";
const PROGRESS_URL = "https://jellyfin.example.com/Sessions/Playing/Progress";

const track = (id: string): BaseItemDto => ({
  Id: id,
  Name: id,
  ServerId: "server",
});
const ALBUM = ["t0", "t1", "t2", "t3", "t4"].map(track);
const TRACK = track("track-1");

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
  return (
    <Text>{`${player.repeatMode} ${player.shuffleEnabled ? "shuffled" : "sorted"}`}</Text>
  );
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

const reports = (url: string) =>
  api.mock.history.post
    .filter((request) => request.url === url)
    .map((request) => JSON.parse(request.data));

/** A remote control's command, as the socket delivers it. */
const receive = (Name: string, Arguments: Record<string, string>) =>
  act(async () => mockHandlers.get("GeneralCommand")?.({ Name, Arguments }));

/** Lets a request that was on its way reach the server double. */
const settleRequests = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

/** Mounts the player with one track playing and its start reported. */
const startPlaying = async () => {
  await mount();
  await act(async () => player.playQueue([TRACK]));
  await waitFor(() => expect(reports(START_URL)).toHaveLength(1));
};

beforeEach(() => {
  clearMmkv();
  mockHandlers.clear();
  mockHeldStreams.clear();
  mockNative.queue = [];
  mockNative.activeIndex = undefined;
  mockNative.afterQueueRead = undefined;
  getDefaultStore().set(userAtom, { Id: "user", ServerId: "server" });
  api.mock.reset();
  api.mock.onPost().reply(204);
});

describe("MusicPlayerProvider and the native queue", () => {
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
});

describe("MusicPlayerProvider repeat and shuffle", () => {
  test("the playback start report carries the saved modes", async () => {
    storage.set("music_player_repeat_mode", "all");
    storage.set("music_player_shuffle_enabled", true);

    await startPlaying();

    expect(reports(START_URL)[0]).toMatchObject({
      ItemId: "track-1",
      RepeatMode: "RepeatAll",
      PlaybackOrder: "Shuffle",
    });
  });

  // The heartbeat is 10 s apart. A remote control that had to wait for it
  // would show the old mode long after its own command was obeyed.
  test("a remote repeat command is applied and reported at once", async () => {
    await startPlaying();

    await receive("SetRepeatMode", { RepeatMode: "RepeatOne" });

    expect(screen.getByText("one sorted")).toBeTruthy();
    await waitFor(() =>
      expect(reports(PROGRESS_URL)).toEqual([
        expect.objectContaining({
          ItemId: "track-1",
          RepeatMode: "RepeatOne",
          PlaybackOrder: "Default",
        }),
      ]),
    );
    // The app's own repeat button reads the same setting on the next launch.
    expect(storage.getString("music_player_repeat_mode")).toBe("one");
  });

  test("a remote shuffle command is applied and reported at once", async () => {
    await startPlaying();

    await receive("SetShuffleQueue", { ShuffleMode: "Shuffle" });

    expect(screen.getByText("off shuffled")).toBeTruthy();
    await waitFor(() =>
      expect(reports(PROGRESS_URL)).toEqual([
        expect.objectContaining({ PlaybackOrder: "Shuffle" }),
      ]),
    );

    await receive("SetShuffleQueue", { ShuffleMode: "Sorted" });

    expect(screen.getByText("off sorted")).toBeTruthy();
    await waitFor(() =>
      expect(reports(PROGRESS_URL)[1]).toMatchObject({
        PlaybackOrder: "Default",
      }),
    );
  });

  // The command names a mode, it does not toggle: a remote that sends the
  // mode already in effect must not flip it, or reshuffle the queue.
  test("a command for the mode already in effect changes nothing", async () => {
    storage.set("music_player_shuffle_enabled", true);
    await startPlaying();

    await receive("SetShuffleQueue", { ShuffleMode: "Shuffle" });
    expect(screen.getByText("off shuffled")).toBeTruthy();

    // The next real change is the first thing the server hears about.
    await receive("SetShuffleQueue", { ShuffleMode: "Sorted" });
    await waitFor(() => expect(reports(PROGRESS_URL)).not.toEqual([]));
    expect(reports(PROGRESS_URL)).toEqual([
      expect.objectContaining({ PlaybackOrder: "Default" }),
    ]);
  });

  test("the app's own shuffle and repeat buttons report at once too", async () => {
    await startPlaying();

    await act(async () => player.toggleShuffle());
    await act(async () => player.setRepeatMode("all"));

    await waitFor(() =>
      expect(reports(PROGRESS_URL)).toEqual([
        expect.objectContaining({ PlaybackOrder: "Shuffle" }),
        expect.objectContaining({
          PlaybackOrder: "Shuffle",
          RepeatMode: "RepeatAll",
        }),
      ]),
    );
  });

  // The engine offers a heartbeat every 10 s of playback and the provider
  // drops one that follows another too closely. A mode report is not a
  // heartbeat: counting it would cost the next real one.
  test("a mode report does not hold back the next heartbeat", async () => {
    await startPlaying();
    await receive("SetRepeatMode", { RepeatMode: "RepeatAll" });
    await waitFor(() => expect(reports(PROGRESS_URL)).toHaveLength(1));

    await act(async () => player.reportProgress());

    await waitFor(() => expect(reports(PROGRESS_URL)).toHaveLength(2));
  });

  // The session is the whole app's: the command also arrives while a video
  // plays, or with nothing playing at all. Neither is the music player's to
  // act on, and a progress report from it would invent a playing session.
  test("a command is left alone while no music is playing", async () => {
    await mount();

    await receive("SetRepeatMode", { RepeatMode: "RepeatAll" });
    await receive("SetShuffleQueue", { ShuffleMode: "Shuffle" });
    await settleRequests();

    expect(screen.getByText("off sorted")).toBeTruthy();
    expect(api.mock.history.post).toEqual([]);
  });

  // A song paused in the mini player still counts as a track of the music
  // player's own. With a video on screen the remote is controlling the video:
  // obeying it here reshuffled the song's queue, and the report that follows
  // a mode change put the song in place of the video on the server.
  test("a command is left to the video while one is on screen", async () => {
    await startPlaying();
    const leaveVideo = enterVideoSession();
    try {
      await receive("SetRepeatMode", { RepeatMode: "RepeatAll" });
      await receive("SetShuffleQueue", { ShuffleMode: "Shuffle" });
      await settleRequests();

      expect(screen.getByText("off sorted")).toBeTruthy();
      expect(reports(PROGRESS_URL)).toEqual([]);
    } finally {
      leaveVideo();
    }

    // Back on the music player, the same command is its own again.
    await receive("SetRepeatMode", { RepeatMode: "RepeatAll" });

    expect(screen.getByText("all sorted")).toBeTruthy();
    await waitFor(() => expect(reports(PROGRESS_URL)).toHaveLength(1));
  });

  test("changing a mode with nothing playing reports nothing", async () => {
    await mount();

    await act(async () => player.setRepeatMode("one"));
    await settleRequests();

    expect(screen.getByText("one sorted")).toBeTruthy();
    expect(api.mock.history.post).toEqual([]);
  });
});

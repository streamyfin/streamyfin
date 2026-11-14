import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { act, renderHook } from "@testing-library/react-native";
import { RECEIVER_NEXT_ITEM_WAIT_MS } from "@/constants/Cast";
import {
  type CastDoubleState,
  createCastDoubleState,
  emitCastEvent,
  setCastSession,
} from "@/test-utils/cast";
import { makeApi } from "@/test-utils/jellyfinApi";
import {
  type MusicCastRemoteView,
  useMusicCastRemote,
} from "./useMusicCastRemote";

let mockCast: CastDoubleState = createCastDoubleState();
jest.mock("@/modules/mpv-player/src/cast/CastModule", () => ({
  __esModule: true,
  CastNative: require("@/test-utils/cast").castDoubleModule(() => mockCast),
}));
jest.mock("@/utils/log", () => ({
  logAndCaptureError: jest.fn(),
  writeErrorLog: jest.fn(),
}));

const castNative = () =>
  jest.requireMock("@/modules/mpv-player/src/cast/CastModule").CastNative as {
    pause: jest.Mock;
    play: jest.Mock;
  };

const track = (id: string): BaseItemDto => ({
  Id: id,
  Name: id,
  RunTimeTicks: 150 * 10_000_000,
});
/** An album with a track queued twice. */
const ALBUM = ["a", "b", "a", "c"].map(track);

type Props = Parameters<typeof useMusicCastRemote>[0];

const api = makeApi();
let sessions = 0;
let props: Props;

beforeEach(() => {
  // The module keeps its channels per session: a fresh one per test.
  sessions += 1;
  mockCast = createCastDoubleState();
  mockCast.castState = "connected";
  setCastSession(mockCast, `session-${sessions}`);
  castNative().pause.mockClear();
  props = {
    api,
    userId: "user",
    ownerKey: "server:user",
    connected: true,
    repeatMode: "off",
    onHandBack: jest.fn(),
  };
});

const mountRemote = () =>
  renderHook((current: Props) => useMusicCastRemote(current), {
    initialProps: props,
  });

/** The receiver reporting an item under one of its play sessions. */
const receiverStatus = (
  itemId: string,
  playSessionId: string,
  playerState = "playing",
  streamPosition = 0,
  idleReason?: string,
) =>
  act(async () => {
    const status = {
      playerState,
      idleReason,
      currentItemId: 1,
      streamPosition,
      playbackRate: 1,
      volume: 1,
      isMuted: false,
      mediaInfo: { customData: { itemId, playSessionId } },
      customData: null,
    } as never;
    mockCast.mediaStatus = status;
    emitCastEvent(mockCast, "onMediaStatusChanged", { status });
  });

const settle = () => act(async () => {});

// A film still plays while the queue loads: a pause then would pause the film.
test("ignores the controls until the receiver reports the queue", async () => {
  const { result } = await mountRemote();
  await settle();
  await receiverStatus("film", "ps-film", "playing", 100);

  await act(async () => {
    result.current.begin(ALBUM, 0);
  });
  await act(async () => {
    await result.current.pause();
  });
  expect(castNative().pause).not.toHaveBeenCalled();

  await receiverStatus("a", "ps-1");
  await act(async () => {
    await result.current.pause();
  });
  expect(castNative().pause).toHaveBeenCalledTimes(1);
});

test("hands back nothing when the session ends before the receiver reports", async () => {
  const { result, rerender } = await mountRemote();
  await settle();

  await act(async () => {
    result.current.begin(ALBUM, 3);
  });
  await act(async () => {
    rerender({ ...props, connected: false });
  });

  expect(props.onHandBack).not.toHaveBeenCalled();
});

test("hands back where the receiver was when the session ends", async () => {
  const { result, rerender } = await mountRemote();
  await settle();

  await act(async () => {
    result.current.begin(ALBUM, 0);
  });
  await receiverStatus("b", "ps-1", "playing", 30);
  await act(async () => {
    rerender({ ...props, connected: false });
  });

  const view = (props.onHandBack as jest.Mock).mock
    .calls[0]?.[0] as MusicCastRemoteView;
  expect(view.currentTrack.Id).toBe("b");
  expect(view.queueIndex).toBe(1);
  expect(view.progress).toBeCloseTo(30, 0);
});

// A track picked in the queue is cast again: until it loads, the receiver
// still plays where it was, and that is what the phone takes back.
test("hands back the reported place, not a pick still loading", async () => {
  const { result, rerender } = await mountRemote();
  await settle();

  await act(async () => {
    result.current.begin(ALBUM, 0);
  });
  await receiverStatus("a", "ps-1", "playing", 10);
  await act(async () => {
    result.current.begin(ALBUM, 3);
  });
  await act(async () => {
    rerender({ ...props, connected: false });
  });

  const view = (props.onHandBack as jest.Mock).mock
    .calls[0]?.[0] as MusicCastRemoteView;
  expect(view.currentTrack.Id).toBe("a");
  expect(view.queueIndex).toBe(0);
  expect(view.progress).toBeCloseTo(10, 0);
});

test("follows a track queued twice to the copy the receiver plays", async () => {
  const { result } = await mountRemote();
  await settle();

  await act(async () => {
    result.current.begin(ALBUM, 0);
  });
  await receiverStatus("a", "ps-1");
  expect(result.current.view?.queueIndex).toBe(0);
  await receiverStatus("b", "ps-2");
  expect(result.current.view?.queueIndex).toBe(1);
  await receiverStatus("a", "ps-3");
  expect(result.current.view?.queueIndex).toBe(2);
  await receiverStatus("c", "ps-4");
  expect(result.current.view?.queueIndex).toBe(3);
  // Previous from the last track goes back to the second copy.
  await receiverStatus("a", "ps-5");
  expect(result.current.view?.queueIndex).toBe(2);
});

// The receiver still plays the earlier queue when a new cast does not start.
test("a cast that does not start puts back the queue the receiver plays", async () => {
  const { result } = await mountRemote();
  await settle();
  const first = [track("x"), track("y")];

  await act(async () => {
    result.current.begin(first, 0);
  });
  await receiverStatus("x", "ps-1");
  let failed = 0;
  await act(async () => {
    failed = result.current.begin(ALBUM, 0);
  });
  await act(async () => {
    result.current.end(failed);
  });

  expect(result.current.view?.queue.map((item) => item.Id)).toEqual(["x", "y"]);
  expect(result.current.view?.currentTrack.Id).toBe("x");
});

test("an account switch drops the queue and hands nothing back", async () => {
  const { result, rerender } = await mountRemote();
  await settle();

  await act(async () => {
    result.current.begin(ALBUM, 0);
  });
  await receiverStatus("a", "ps-1", "playing", 10);
  await act(async () => {
    rerender({ ...props, userId: "other", ownerKey: "server:other" });
  });
  expect(result.current.view).toBeNull();

  await act(async () => {
    rerender({
      ...props,
      userId: "other",
      ownerKey: "server:other",
      connected: false,
    });
  });
  expect(props.onHandBack).not.toHaveBeenCalled();
});

/** A status as the module reports it, null once the receiver has no media. */
const rawStatus = (status: unknown) =>
  act(async () => {
    mockCast.mediaStatus = status as never;
    emitCastEvent(mockCast, "onMediaStatusChanged", {
      status: status as never,
    });
  });

/** Keeps the receiver channel from opening until the returned release runs. */
const holdChannel = () => {
  let release = () => {};
  mockCast.holdAdd = new Promise<void>((resolve) => {
    release = resolve;
  });
  return () => act(async () => release());
};

const sentCommands = () =>
  mockCast.sent.map(
    (entry) => (JSON.parse(entry.message) as { command: string }).command,
  );

// Media loaded by a sender that is not Jellyfin carries none of the receiver's
// own data: the queue is gone from the receiver, nothing to show or take back.
test("lets go of the queue once the receiver plays media another sender loaded", async () => {
  const { result, rerender } = await mountRemote();
  await settle();

  await act(async () => {
    result.current.begin(ALBUM, 0);
  });
  await receiverStatus("b", "ps-1", "playing", 30);
  await rawStatus({
    playerState: "playing",
    currentItemId: 7,
    streamPosition: 4,
    playbackRate: 1,
    volume: 1,
    isMuted: false,
    mediaInfo: { customData: null },
    customData: null,
  });
  expect(result.current.view).toBeNull();

  await act(async () => {
    rerender({ ...props, connected: false });
  });
  expect(props.onHandBack).not.toHaveBeenCalled();
});

// Stopped from the TV's remote, say: the receiver keeps the session and plays
// nothing. The player shows where it stopped, not the queue loading from its
// first track.
test("shows where the receiver stopped once it plays nothing", async () => {
  const { result, rerender } = await mountRemote();
  await settle();

  await act(async () => {
    result.current.begin(ALBUM, 0);
  });
  await receiverStatus("b", "ps-1", "playing", 30);
  await rawStatus(null);

  expect(result.current.view?.currentTrack.Id).toBe("b");
  expect(result.current.view?.queueIndex).toBe(1);
  expect(result.current.view?.isPlaying).toBe(false);
  expect(result.current.view?.progress).toBeCloseTo(30, 0);
  expect(result.current.stopped).toBe(true);

  await act(async () => {
    rerender({ ...props, connected: false });
  });
  const view = (props.onHandBack as jest.Mock).mock
    .calls[0]?.[0] as MusicCastRemoteView;
  expect(view.currentTrack.Id).toBe("b");
  expect(view.progress).toBeCloseTo(30, 0);
});

// What a Google TV Streamer did on 2026-11-03 after a Stop from its remote:
// the sender keeps the last track's status, idle. Its media session is over,
// so a play there does nothing.
test("an idle receiver counts as stopped on the track it reports", async () => {
  const { result } = await mountRemote();
  await settle();

  await act(async () => {
    result.current.begin(ALBUM, 0);
  });
  await receiverStatus("b", "ps-1", "playing", 30);
  expect(result.current.stopped).toBe(false);
  await receiverStatus("b", "ps-1", "idle", 0);

  expect(result.current.view?.currentTrack.Id).toBe("b");
  expect(result.current.view?.isPlaying).toBe(false);
  expect(result.current.stopped).toBe(true);
});

// The receiver reports the track it finished as idle while it fetches the
// next one, and a stream it reloads from a Seek as interrupted: the queue goes
// on, and Play, Next or Previous then would race the receiver's own move.
describe("an idle receiver going on with the queue", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  const castAlbumAt = async (
    startIndex: number,
  ): Promise<{ current: ReturnType<typeof useMusicCastRemote> }> => {
    const { result } = await mountRemote();
    await settle();
    await act(async () => {
      result.current.begin(ALBUM, startIndex);
    });
    return result;
  };

  test("still plays while the receiver fetches the next track", async () => {
    const result = await castAlbumAt(1);
    await receiverStatus("b", "ps-1", "playing", 148);
    await receiverStatus("b", "ps-1", "idle", 0, "finished");

    expect(result.current.stopped).toBe(false);
    expect(result.current.view?.currentTrack.Id).toBe("b");
    expect(result.current.view?.isPlaying).toBe(true);
  });

  test("still plays while the receiver reloads the stream", async () => {
    const result = await castAlbumAt(1);
    await receiverStatus("b", "ps-1", "playing", 30);
    await receiverStatus("b", "ps-1", "idle", 0, "interrupted");

    expect(result.current.stopped).toBe(false);
    expect(result.current.view?.isPlaying).toBe(true);
  });

  test("sends neither Next nor Previous while the receiver moves on", async () => {
    const result = await castAlbumAt(1);
    await receiverStatus("b", "ps-1", "playing", 148);
    await receiverStatus("b", "ps-1", "idle", 0, "finished");
    const before = mockCast.sent.length;

    await act(async () => {
      await result.current.next();
      await result.current.previous();
    });

    expect(mockCast.sent.slice(before)).toEqual([]);
  });

  test("counts as stopped once the receiver stayed idle past the wait", async () => {
    jest.useFakeTimers();
    const result = await castAlbumAt(1);
    await receiverStatus("b", "ps-1", "playing", 148);
    await receiverStatus("b", "ps-1", "idle", 0, "finished");
    expect(result.current.stopped).toBe(false);

    await act(async () => {
      jest.advanceTimersByTime(RECEIVER_NEXT_ITEM_WAIT_MS);
    });

    expect(result.current.stopped).toBe(true);
    expect(result.current.view?.isPlaying).toBe(false);
    expect(result.current.view?.progress).toBe(0);
  });

  test("a status sent again while it waits does not extend the wait", async () => {
    jest.useFakeTimers();
    const result = await castAlbumAt(1);
    await receiverStatus("b", "ps-1", "playing", 148);
    await receiverStatus("b", "ps-1", "idle", 0, "finished");
    await act(async () => {
      jest.advanceTimersByTime(RECEIVER_NEXT_ITEM_WAIT_MS - 1_000);
    });
    // A volume change, say: the same idle status again.
    await receiverStatus("b", "ps-1", "idle", 0, "finished");

    await act(async () => {
      jest.advanceTimersByTime(1_000);
    });

    expect(result.current.stopped).toBe(true);
  });

  test("the last track finished ends the queue at once", async () => {
    const result = await castAlbumAt(3);
    await receiverStatus("c", "ps-1", "playing", 148);
    await receiverStatus("c", "ps-1", "idle", 0, "finished");

    expect(result.current.stopped).toBe(true);
    expect(result.current.view?.isPlaying).toBe(false);
  });

  test.each(["all", "one"] as const)(
    "with repeat %s, the last track finished goes on",
    async (repeatMode) => {
      props = { ...props, repeatMode };
      const result = await castAlbumAt(3);
      await receiverStatus("c", "ps-1", "playing", 148);
      await receiverStatus("c", "ps-1", "idle", 0, "finished");

      expect(result.current.stopped).toBe(false);
      expect(result.current.view?.isPlaying).toBe(true);
    },
  );

  test("a stop from the TV's remote is a stop at once", async () => {
    const result = await castAlbumAt(1);
    await receiverStatus("b", "ps-1", "playing", 30);
    await receiverStatus("b", "ps-1", "idle", 0, "cancelled");

    expect(result.current.stopped).toBe(true);
  });
});

// The receiver appends what it is sent to the queue it plays then, so the
// tracks go to the queue that was there when they were sent, or nowhere.
test("an enqueue that lands after another cast began leaves that queue alone", async () => {
  const { result } = await mountRemote();
  await settle();
  const first = [track("x"), track("y")];

  await act(async () => {
    result.current.begin(first, 0);
  });
  await receiverStatus("x", "ps-1");
  const release = holdChannel();
  let enqueued: Promise<unknown> = Promise.resolve();
  await act(async () => {
    enqueued = result.current.enqueue("PlayLast", [track("n1")]);
  });
  await act(async () => {
    result.current.begin(ALBUM, 0);
  });
  await release();
  await act(async () => {
    await enqueued;
  });

  expect(result.current.view?.queue.map((item) => item.Id)).toEqual(
    ALBUM.map((item) => item.Id),
  );
});

// Every message carries the account's credentials, and the receiver signs in
// with the last ones it got.
test("a command still waiting on the channel when the account switched sends nothing", async () => {
  const { result, rerender } = await mountRemote();
  await settle();

  await act(async () => {
    result.current.begin(ALBUM, 0);
  });
  await receiverStatus("a", "ps-1");
  const release = holdChannel();
  let pending: Promise<unknown>[] = [];
  await act(async () => {
    pending = [
      result.current.enqueue("PlayLast", [track("n1")]),
      result.current.next(),
      result.current.setRepeat("all"),
    ];
  });
  await act(async () => {
    rerender({ ...props, userId: "other", ownerKey: "server:other" });
  });
  await release();
  await act(async () => {
    await Promise.all(pending);
  });

  expect(sentCommands()).toEqual([]);
});

test("a repeat change reports whether the receiver was told", async () => {
  const { result } = await mountRemote();
  await settle();

  await act(async () => {
    result.current.begin(ALBUM, 0);
  });
  let sent: boolean | undefined;
  await act(async () => {
    sent = await result.current.setRepeat("all");
  });
  expect(sent).toBe(false);

  await receiverStatus("a", "ps-1");
  await act(async () => {
    sent = await result.current.setRepeat("all");
  });
  expect(sent).toBe(true);
  expect(sentCommands()).toEqual(["SetRepeatMode"]);
});

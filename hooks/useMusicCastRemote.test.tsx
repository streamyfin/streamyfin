import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { act, renderHook } from "@testing-library/react-native";
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
) =>
  act(async () => {
    const status = {
      playerState,
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

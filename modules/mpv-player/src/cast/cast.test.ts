import {
  type CastDoubleState,
  castDoubleDevice,
  createCastDoubleState,
  emitCastEvent,
} from "@/test-utils/cast";
import type { CastMediaStatus } from "./Cast.types";
import {
  addCastChannel,
  castClientFor,
  castDevices,
  castState,
  currentCastSession,
  isCastAvailable,
  onCastSessionEvent,
  showCastDialog,
} from "./cast";

let mockCast: CastDoubleState = createCastDoubleState();
jest.mock("@/modules/mpv-player/src/cast/CastModule", () => ({
  __esModule: true,
  // The factory runs before this file's body, so the state is read lazily.
  CastNative: require("@/test-utils/cast").castDoubleModule(() => mockCast),
}));

const NAMESPACE = "urn:x-cast:com.connectsdk";

const status = (
  playerState: CastMediaStatus["playerState"],
): CastMediaStatus => ({
  playerState,
  currentItemId: 1,
  streamPosition: 0,
  playbackRate: 1,
  volume: 1,
  isMuted: false,
  mediaInfo: null,
  customData: null,
});

beforeEach(() => {
  mockCast = createCastDoubleState();
});

test("every call is a no-op when the module says it is unavailable", async () => {
  mockCast.available = false;

  expect(isCastAvailable()).toBe(false);
  expect(castState()).toBeNull();
  expect(castDevices()).toEqual([]);
  expect(currentCastSession()).toBeNull();
  await expect(showCastDialog()).resolves.toBe(false);

  const channel = await addCastChannel(NAMESPACE, () => {});
  expect(channel.connected).toBe(false);
  await expect(channel.sendMessage("hi")).rejects.toThrow(
    "Cast is not available on this platform",
  );
  expect(mockCast.channels).toHaveLength(0);

  // The listener still reaches the module: it emits nothing while unavailable
  // and starts to once Play Services are back, without a new subscription.
  const subscription = onCastSessionEvent(() => {});
  expect(mockCast.listeners.onSessionEvent).toHaveLength(1);
  subscription.remove();
  expect(mockCast.listeners.onSessionEvent).toHaveLength(0);
});

test("addCastChannel registers the receiver listener for its namespace only", async () => {
  const received: unknown[] = [];
  const channel = await addCastChannel(NAMESPACE, (message) =>
    received.push(message),
  );

  emitCastEvent(mockCast, "onReceiverMessage", {
    namespace: "urn:x-cast:other",
    message: "{}",
  });
  emitCastEvent(mockCast, "onReceiverMessage", {
    namespace: NAMESPACE,
    message: '{"type":"playbackstart"}',
  });

  // The raw string reaches the listener; parsing is the receiver module's job.
  expect(received).toEqual(['{"type":"playbackstart"}']);
  await channel.remove();
});

test("a channel's remove drops its listener and the native channel", async () => {
  const received: unknown[] = [];
  const channel = await addCastChannel(NAMESPACE, (message) =>
    received.push(message),
  );

  await channel.remove();
  emitCastEvent(mockCast, "onReceiverMessage", {
    namespace: NAMESPACE,
    message: "{}",
  });

  expect(received).toEqual([]);
  expect(mockCast.removed).toEqual([NAMESPACE]);
  expect(mockCast.listeners.onReceiverMessage).toHaveLength(0);
});

test("sendMessage stringifies an object once and sends a string as is", async () => {
  const channel = await addCastChannel(NAMESPACE, () => {});

  await channel.sendMessage({ command: "Pause", options: {} });
  await channel.sendMessage("raw");

  expect(mockCast.sent).toEqual([
    { namespace: NAMESPACE, message: '{"command":"Pause","options":{}}' },
    { namespace: NAMESPACE, message: "raw" },
  ]);
  await channel.remove();
});

test("castClientFor reads and follows the media status of its session", async () => {
  mockCast.mediaStatus = status("playing");
  const client = castClientFor(mockCast.session!);

  expect(client.sessionId).toBe("session-1");
  await expect(client.getMediaStatus()).resolves.toEqual(status("playing"));

  const seen: (CastMediaStatus | null)[] = [];
  const subscription = client.onMediaStatusUpdated((value) => seen.push(value));
  emitCastEvent(mockCast, "onMediaStatusChanged", { status: status("paused") });
  subscription.remove();
  emitCastEvent(mockCast, "onMediaStatusChanged", { status: status("idle") });

  expect(seen).toEqual([status("paused")]);
});

test("opens the channel on a session that was resumed before any listener", async () => {
  mockCast.session = { id: "resumed-7", device: castDoubleDevice() };

  expect(currentCastSession()?.id).toBe("resumed-7");
  const channel = await addCastChannel(NAMESPACE, () => {});

  expect(channel.connected).toBe(true);
  expect(mockCast.channels).toMatchObject([
    { namespace: NAMESPACE, connected: true },
  ]);
  await channel.remove();
});

test("listeners share one native subscription per event and release it with the last remove", () => {
  const first = onCastSessionEvent(() => {});
  const second = onCastSessionEvent(() => {});
  expect(mockCast.listeners.onSessionEvent).toHaveLength(1);

  first.remove();
  expect(mockCast.listeners.onSessionEvent).toHaveLength(1);
  second.remove();
  expect(mockCast.listeners.onSessionEvent).toHaveLength(0);
});

test("a session event reaches every listener with its payload", () => {
  const seen: string[] = [];
  const first = onCastSessionEvent(({ event, error }) =>
    seen.push(`${event}:${error}`),
  );
  const second = onCastSessionEvent(({ event }) => seen.push(event));

  emitCastEvent(mockCast, "onSessionEvent", {
    event: "ended",
    sessionId: "session-1",
    error: null,
  });

  expect(seen).toEqual(["ended:null", "ended"]);
  first.remove();
  second.remove();
});

test("two subscriptions of the same function stay independent", () => {
  const seen: string[] = [];
  const listener = ({ event }: { event: string }) => seen.push(event);
  const first = onCastSessionEvent(listener);
  const second = onCastSessionEvent(listener);

  first.remove();
  emitCastEvent(mockCast, "onSessionEvent", {
    event: "started",
    sessionId: "session-1",
    error: null,
  });
  second.remove();

  // The second subscription is still there: the event reaches it once.
  expect(seen).toEqual(["started"]);
});

test("a message sent while the channel opens reaches its listener", async () => {
  mockCast.session = { id: "session-1", device: castDoubleDevice() };
  let release: () => void = () => {};
  mockCast.holdAdd = new Promise<void>((resolve) => {
    release = resolve;
  });
  const seen: unknown[] = [];

  const pending = addCastChannel(NAMESPACE, (message) => seen.push(message));
  // The receiver answers as soon as the namespace opens, before the native
  // addChannel has returned to JS.
  emitCastEvent(mockCast, "onReceiverMessage", {
    namespace: NAMESPACE,
    message: "early",
  });
  release();
  await pending;

  expect(seen).toEqual(["early"]);
});

test("a subscription made while Cast is unavailable hears events once it is", () => {
  mockCast.available = false;
  const seen: string[] = [];
  const subscription = onCastSessionEvent(({ event }) => seen.push(event));

  // Play Services finished updating: the module is the same, only its answer changed.
  mockCast.available = true;
  emitCastEvent(mockCast, "onSessionEvent", {
    event: "started",
    sessionId: "session-1",
    error: null,
  });
  subscription.remove();

  expect(seen).toEqual(["started"]);
});

test("a client drives its own session only", async () => {
  const native = jest.requireMock(
    "@/modules/mpv-player/src/cast/CastModule",
  ).CastNative;
  native.pause.mockClear();
  const client = castClientFor(mockCast.session!);

  await client.pause();
  expect(native.pause).toHaveBeenCalledTimes(1);

  // The TV changed under a client captured across an await.
  mockCast.session = { id: "session-2", device: castDoubleDevice() };
  await client.pause();
  await expect(client.getMediaStatus()).resolves.toBeNull();
  expect(native.pause).toHaveBeenCalledTimes(1);
});

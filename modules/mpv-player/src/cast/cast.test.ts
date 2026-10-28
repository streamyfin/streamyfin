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

  const subscription = onCastSessionEvent(() => {});
  expect(mockCast.listeners.onSessionEvent).toHaveLength(0);
  subscription.remove();
});

test("addCastChannel registers the receiver listener for its namespace only", async () => {
  const received: unknown[] = [];
  await addCastChannel(NAMESPACE, (message) => received.push(message));

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
  onCastSessionEvent(({ event, error }) => seen.push(`${event}:${error}`));
  onCastSessionEvent(({ event }) => seen.push(event));

  emitCastEvent(mockCast, "onSessionEvent", {
    event: "ended",
    sessionId: "session-1",
    error: null,
  });

  expect(seen).toEqual(["ended:null", "ended"]);
});

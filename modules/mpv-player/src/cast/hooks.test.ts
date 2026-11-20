import { act, renderHook } from "@testing-library/react-native";
import {
  type CastDoubleState,
  castDoubleDevice,
  createCastDoubleState,
  emitCastEvent,
} from "@/test-utils/cast";
import type { CastMediaStatus, CastSessionEvent } from "./Cast.types";
import {
  useCastClient,
  useCastDevice,
  useCastDevices,
  useCastMediaStatus,
  useCastSession,
  useCastState,
} from "./hooks";

let mockCast: CastDoubleState = createCastDoubleState();
jest.mock("@/modules/mpv-player/src/cast/CastModule", () => ({
  __esModule: true,
  CastNative: require("@/test-utils/cast").castDoubleModule(() => mockCast),
}));

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

const otherDevice = {
  ...castDoubleDevice(),
  deviceId: "other",
  friendlyName: "Bedroom",
};

const sessionEvent = (event: CastSessionEvent, sessionId: string) =>
  act(() =>
    emitCastEvent(mockCast, "onSessionEvent", {
      event,
      sessionId,
      error: null,
    }),
  );

beforeEach(() => {
  mockCast = createCastDoubleState();
});

test("useCastState starts from the native state and follows changes", async () => {
  mockCast.castState = "notConnected";
  const view = await renderHook(useCastState);
  expect(view.result.current).toBe("notConnected");

  await act(() =>
    emitCastEvent(mockCast, "onCastStateChanged", { state: "connected" }),
  );
  expect(view.result.current).toBe("connected");

  await view.unmount();
  expect(mockCast.listeners.onCastStateChanged).toHaveLength(0);
});

test("useCastSession follows started, resumed, suspended and ended", async () => {
  mockCast.session = null;
  const view = await renderHook(useCastSession);
  expect(view.result.current).toBeNull();

  mockCast.session = { id: "session-1", device: castDoubleDevice() };
  await sessionEvent("started", "session-1");
  expect(view.result.current?.id).toBe("session-1");

  await sessionEvent("suspended", "session-1");
  expect(view.result.current).toBeNull();

  await sessionEvent("resumed", "session-1");
  expect(view.result.current?.id).toBe("session-1");

  mockCast.session = null;
  await sessionEvent("ended", "session-1");
  expect(view.result.current).toBeNull();
});

test("useCastDevice is the device of the current session", async () => {
  const view = await renderHook(useCastDevice);
  expect(view.result.current).toEqual(castDoubleDevice());

  mockCast.session = null;
  await sessionEvent("ended", "session-1");
  expect(view.result.current).toBeNull();
});

test("useCastClient keeps one client per session id", async () => {
  const view = await renderHook(useCastClient);
  const first = view.result.current;
  expect(first?.sessionId).toBe("session-1");

  await view.rerender(undefined);
  expect(view.result.current).toBe(first);

  mockCast.session = { id: "session-2", device: otherDevice };
  await sessionEvent("started", "session-2");
  expect(view.result.current).not.toBe(first);
  expect(view.result.current?.sessionId).toBe("session-2");
});

test("useCastDevices starts from getDevices and follows onDevicesChanged", async () => {
  mockCast.devices = [castDoubleDevice()];
  const view = await renderHook(useCastDevices);
  expect(view.result.current).toEqual([castDoubleDevice()]);

  await act(() =>
    emitCastEvent(mockCast, "onDevicesChanged", {
      devices: [castDoubleDevice(), otherDevice],
    }),
  );
  expect(view.result.current).toHaveLength(2);
});

test("useCastMediaStatus follows onMediaStatusChanged and resets without session", async () => {
  mockCast.mediaStatus = status("playing");
  const view = await renderHook(useCastMediaStatus);
  await act(async () => {});
  expect(view.result.current).toEqual(status("playing"));

  await act(() =>
    emitCastEvent(mockCast, "onMediaStatusChanged", {
      status: status("paused"),
    }),
  );
  expect(view.result.current).toEqual(status("paused"));

  mockCast.session = null;
  await sessionEvent("ended", "session-1");
  expect(view.result.current).toBeNull();
});

test("useCastSession picks up a session announced by the cast state alone", async () => {
  mockCast.session = null;
  const view = await renderHook(useCastSession);
  expect(view.result.current).toBeNull();

  // The SDK resumed a session before JS listened: no session event, only the state.
  mockCast.session = { id: "session-1", device: castDoubleDevice() };
  await act(() =>
    emitCastEvent(mockCast, "onCastStateChanged", { state: "connected" }),
  );
  expect(view.result.current?.id).toBe("session-1");
});

test("useCastSession keeps its object while the session id stays the same", async () => {
  const view = await renderHook(useCastSession);
  const first = view.result.current;
  expect(first?.id).toBe("session-1");

  await sessionEvent("resumed", "session-1");
  expect(view.result.current).toBe(first);
});

test("useCastMediaStatus reads the status once on mount", async () => {
  const native = jest.requireMock(
    "@/modules/mpv-player/src/cast/CastModule",
  ).CastNative;
  native.getMediaStatus.mockClear();
  mockCast.mediaStatus = status("playing");

  const view = await renderHook(useCastMediaStatus);
  await act(async () => {});
  expect(view.result.current).toEqual(status("playing"));
  expect(native.getMediaStatus).toHaveBeenCalledTimes(1);
});

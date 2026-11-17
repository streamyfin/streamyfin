import { act, render } from "@testing-library/react-native";
import {
  type CastDoubleState,
  castDoubleDevice,
  createCastDoubleState,
  emitCastSessionEvent,
  setCastSession,
} from "@/test-utils/cast";
import { JellyfinCastStopReporter } from "./JellyfinCastStopReporter";

let mockCast: CastDoubleState = createCastDoubleState();
jest.mock("@/modules/mpv-player/src/cast/CastModule", () => ({
  __esModule: true,
  CastNative: require("@/test-utils/cast").castDoubleModule(() => mockCast),
}));
jest.mock("@/providers/JellyfinProvider", () => ({
  apiAtom: jest.requireActual("jotai").atom({
    basePath: "https://jellyfin.example.com",
    accessToken: "SECRET_TOKEN",
  }),
  userAtom: jest.requireActual("jotai").atom({ Id: "user-1" }),
}));
const mockReport = jest.fn(async (_input: unknown) => true);
jest.mock("@/utils/cast/reportOrphanedReceiverStop", () => ({
  reportOrphanedReceiverStop: (input: unknown) => mockReport(input),
}));
jest.mock("@/utils/log", () => ({
  logAndCaptureError: jest.fn(),
  writeInfoLog: jest.fn(),
}));

beforeEach(() => {
  mockCast = createCastDoubleState();
  mockCast.mediaStatus = {
    playerState: "playing",
    currentItemId: 1,
    streamPosition: 10,
    playbackRate: 1,
    volume: 1,
    isMuted: false,
    mediaInfo: {
      contentId: null,
      customData: { itemId: "item-1", playSessionId: "ps-1" },
      metadata: null,
    },
    customData: null,
  };
  mockReport.mockReset();
  mockReport.mockImplementation(async (_input: unknown) => true);
});

// The SDK reports no error only for a stop asked from this phone, which also
// closes the receiver app; any other end may leave the TV playing on its own.
test.each([
  ["without an error, as a closed receiver", null, true],
  [
    "with an error, as a receiver that may still play",
    "NETWORK_ERROR (7)",
    false,
  ],
])("reports the stop of the last cast %s", async (_name, error, closed) => {
  await render(<JellyfinCastStopReporter />);
  await act(async () => {});

  await act(async () => {
    emitCastSessionEvent(mockCast, "ended", error);
  });

  expect(mockReport).toHaveBeenCalledTimes(1);
  expect(mockReport.mock.calls[0][0]).toMatchObject({
    userId: "user-1",
    deviceName: "Living Room TV",
    receiverClosed: closed,
    itemId: "item-1",
    playSessionId: "ps-1",
  });
});

// A disconnect that asked to keep the receiver ends without an error too, but
// the TV may still play (this session joined it) or have closed (it launched
// it): the report waits to see whether the receiver still checks in.
test("a disconnect without stop checks the TV before reporting", async () => {
  await render(<JellyfinCastStopReporter />);
  await act(async () => {});

  await act(async () => {
    emitCastSessionEvent(mockCast, "ended", null, { withoutStop: true });
  });

  expect(mockReport).toHaveBeenCalledTimes(1);
  expect(mockReport.mock.calls[0][0]).toMatchObject({
    receiverClosed: false,
    itemId: "item-1",
  });
});

test("a stop still reports the orphaned session", async () => {
  await render(<JellyfinCastStopReporter />);
  await act(async () => {});
  // A disconnect without stop first...
  mockCast.session = null;
  await act(async () => {
    emitCastSessionEvent(mockCast, "ended", null, { withoutStop: true });
  });

  // ...then a new cast to the same TV, stopped from the phone, which closes the receiver.
  mockCast.session = { id: "session-2", device: castDoubleDevice() };
  await act(async () => {
    emitCastSessionEvent(mockCast, "started");
  });
  await act(async () => {});
  await act(async () => {
    emitCastSessionEvent(mockCast, "ended");
  });

  expect(mockReport).toHaveBeenCalledTimes(2);
  expect(mockReport.mock.calls[1][0]).toMatchObject({
    deviceName: "Living Room TV",
    receiverClosed: true,
    itemId: "item-1",
  });
});

const SECOND_TV = {
  deviceId: "9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d",
  friendlyName: "Bedroom TV",
  modelName: "Google TV Streamer",
  videoOut: true,
};

const pendingSignal = (call: number) =>
  (mockReport.mock.calls[call][0] as { signal: AbortSignal }).signal;

// The check of a receiver that may still play waits for it (3 s, then 15 s), until it ends or is cancelled.
const holdReports = () =>
  mockReport.mockImplementation(
    (input: unknown) =>
      new Promise<boolean>((resolve) =>
        (input as { signal: AbortSignal }).signal.addEventListener(
          "abort",
          () => resolve(false),
        ),
      ),
  );

// A switch from the output sheet ends the session on the TV left (status 2155 on Android) and starts one on the
// next 7 ms later (bench, 15/11): the check of the TV left must go on, or its playback stays on the dashboard.
test("a session starting on another TV keeps the check of the TV left", async () => {
  holdReports();
  await render(<JellyfinCastStopReporter />);
  await act(async () => {});

  await act(async () => {
    emitCastSessionEvent(mockCast, "ended", "Cast session status code 2155");
  });
  await act(async () => {
    setCastSession(mockCast, "session-2", SECOND_TV);
    emitCastSessionEvent(mockCast, "starting");
  });
  await act(async () => {
    emitCastSessionEvent(mockCast, "started");
  });

  expect(mockReport).toHaveBeenCalledTimes(1);
  expect(mockReport.mock.calls[0][0]).toMatchObject({
    deviceName: "Living Room TV",
    receiverClosed: false,
  });
  expect(pendingSignal(0).aborted).toBe(false);
});

// The check of a TV must not stop a new cast the same TV plays.
test("a session starting on the same TV drops the check left over", async () => {
  holdReports();
  await render(<JellyfinCastStopReporter />);
  await act(async () => {});

  await act(async () => {
    emitCastSessionEvent(mockCast, "ended", "NETWORK_ERROR (7)");
  });
  await act(async () => {
    setCastSession(mockCast, "session-2", castDoubleDevice());
    emitCastSessionEvent(mockCast, "starting");
  });
  await act(async () => {
    emitCastSessionEvent(mockCast, "started");
  });

  expect(pendingSignal(0).aborted).toBe(true);
});

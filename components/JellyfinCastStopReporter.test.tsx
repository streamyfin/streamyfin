import { act, render } from "@testing-library/react-native";
import {
  type CastDoubleState,
  castDoubleDevice,
  createCastDoubleState,
  emitCastSessionEvent,
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
// The refresh itself is covered by its own spec; here only when it runs.
const mockRefreshProgress = jest.fn(async () => {});
jest.mock("@/hooks/useRevalidatePlaybackProgressCache", () => ({
  useInvalidatePlaybackProgressCache: () => mockRefreshProgress,
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

// Cast from a film's page, stopped from the Cast dialog, Play on the same page: the page still held the resume point
// it had before the cast and sent 0, and the receiver's next report wrote 0 over the server's position (iPhone 17e,
// 17/11). The pages read it again once the stop is on the server.
test("the pages read the resume point again once the stop of a cast is reported", async () => {
  let settle: (reported: boolean) => void = () => {};
  mockReport.mockImplementation(
    () => new Promise<boolean>((resolve) => (settle = resolve)),
  );
  await render(<JellyfinCastStopReporter />);
  await act(async () => {});

  await act(async () => {
    emitCastSessionEvent(mockCast, "ended");
  });
  expect(mockReport).toHaveBeenCalledTimes(1);
  expect(mockRefreshProgress).not.toHaveBeenCalled();

  await act(async () => settle(true));
  expect(mockRefreshProgress).toHaveBeenCalledTimes(1);
});

test("a stop report that fails still has the pages read the resume point again", async () => {
  mockReport.mockImplementation(async () => {
    throw new Error("offline");
  });
  await render(<JellyfinCastStopReporter />);
  await act(async () => {});

  await act(async () => {
    emitCastSessionEvent(mockCast, "ended", "NETWORK_ERROR (7)");
  });

  expect(mockRefreshProgress).toHaveBeenCalledTimes(1);
});

test("a session that cast no item has nothing to read again", async () => {
  mockCast.mediaStatus = null;
  await render(<JellyfinCastStopReporter />);
  await act(async () => {});

  await act(async () => {
    emitCastSessionEvent(mockCast, "ended");
  });

  expect(mockReport).not.toHaveBeenCalled();
  expect(mockRefreshProgress).not.toHaveBeenCalled();
});

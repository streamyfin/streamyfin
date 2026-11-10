import { act, render } from "@testing-library/react-native";
import {
  type CastDoubleState,
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
  mockReport.mockClear();
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

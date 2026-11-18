import { act, render } from "@testing-library/react-native";
import { JellyfinCastStopReporter } from "./JellyfinCastStopReporter";

type EndedHandler = (session: unknown, error?: string) => void;

// The session listeners the reporter registered, fired by the tests.
const mockSessionHandlers = {
  starting: new Set<() => void>(),
  ended: new Set<EndedHandler>(),
};
let mockMediaStatus: unknown = null;
const mockCastDevice = {
  friendlyName: "Living Room TV",
  deviceId: "4f0c2b9d8e7a6b5c4d3e2f1a0b9c8d7e",
};
jest.mock("react-native-google-cast", () => {
  const listen =
    <T,>(handlers: Set<T>) =>
    (handler: T) => {
      handlers.add(handler);
      return { remove: () => handlers.delete(handler) };
    };
  return {
    __esModule: true,
    default: {
      getSessionManager: () => ({
        onSessionStarting: listen(mockSessionHandlers.starting),
        onSessionEnded: listen(mockSessionHandlers.ended),
      }),
    },
    useCastDevice: () => mockCastDevice,
    useMediaStatus: () => mockMediaStatus,
  };
});
jest.mock("@/providers/JellyfinProvider", () =>
  jest
    .requireActual("@/test-utils/jellyfinProvider")
    .makeJellyfinAtomsModule(
      { basePath: "https://jellyfin.example.com", accessToken: "SECRET_TOKEN" },
      { Id: "user-1" },
    ),
);
const mockReport = jest.fn(async (_input: unknown) => true);
jest.mock("@/utils/cast/reportOrphanedReceiverStop", () => ({
  reportOrphanedReceiverStop: (input: unknown) => mockReport(input),
}));
// The refresh itself is covered by its own spec; here only when it runs.
const mockRefreshProgress = jest.fn(async () => {});
jest.mock("@/hooks/useRevalidatePlaybackProgressCache", () => ({
  useInvalidatePlaybackProgressCache: () => mockRefreshProgress,
}));

const endSession = (error?: string) => {
  for (const handler of mockSessionHandlers.ended) handler({}, error);
};

beforeEach(() => {
  mockSessionHandlers.starting.clear();
  mockSessionHandlers.ended.clear();
  mockMediaStatus = {
    mediaInfo: { customData: { itemId: "item-1", playSessionId: "ps-1" } },
  };
  mockReport.mockReset();
  mockReport.mockImplementation(async (_input: unknown) => true);
});

// Cast from a film's page, stopped from the Cast dialog, Play on the same page: the page still held the resume point
// it had before the cast and sent it, and the receiver's next report wrote it over the server's position (Android
// emulator, 17/11). The pages read it again once the stop is on the server.
test("the pages read the resume point again once the stop of a cast is reported", async () => {
  let settle: (reported: boolean) => void = () => {};
  mockReport.mockImplementation(
    () => new Promise<boolean>((resolve) => (settle = resolve)),
  );
  await render(<JellyfinCastStopReporter />);
  await act(async () => {});

  await act(async () => {
    endSession();
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
    endSession("NETWORK_ERROR (7)");
  });

  expect(mockRefreshProgress).toHaveBeenCalledTimes(1);
});

test("a session that cast no item has nothing to read again", async () => {
  mockMediaStatus = null;
  await render(<JellyfinCastStopReporter />);
  await act(async () => {});

  await act(async () => {
    endSession();
  });

  expect(mockReport).not.toHaveBeenCalled();
  expect(mockRefreshProgress).not.toHaveBeenCalled();
});

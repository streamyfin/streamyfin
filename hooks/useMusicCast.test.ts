import { stubReactNative } from "@/test-utils/reactNative";

// Stub react-native at the module boundary: the track player device profile
// reads Platform when it loads.
stubReactNative();

// What reaches Sentry is under test: the SDK is replaced by a recorder that
// plays the scope back, and the local log writes into the MMKV double.
type Captured = { exception: unknown; fingerprint?: string[] };
const mockCaptured: Captured[] = [];
jest.mock("@sentry/react-native", () => ({
  addBreadcrumb: () => {},
  withScope: (run: (scope: unknown) => void) => {
    const event: Captured = { exception: undefined };
    mockCaptured.push(event);
    run({
      setContext: () => {},
      setExtra: () => {},
      setFingerprint: (fingerprint: string[]) => {
        event.fingerprint = fingerprint;
      },
    });
    if (event.exception === undefined) mockCaptured.pop();
  },
  captureException: (exception: unknown) => {
    mockCaptured[mockCaptured.length - 1].exception = exception;
  },
}));
jest.mock(
  "react-native-mmkv",
  () => jest.requireActual("@/test-utils/mmkv").mmkvModule,
);
jest.mock("expo", () => ({
  // codecSupport probes the native MPV module, which no test environment has.
  requireOptionalNativeModule: () => null,
}));
const mockLoadMedia = jest.fn(async (_request: unknown) => {});
jest.mock("react-native-google-cast", () => ({
  __esModule: true,
  default: {
    getPlayServicesState: async () => undefined,
    showPlayServicesErrorDialog: () => {},
    showExpandedControls: () => {},
  },
  CastState: { CONNECTED: "connected" },
  MediaStreamType: { BUFFERED: "buffered" },
  PlayServicesState: { SUCCESS: 0 },
  useCastState: () => "connected",
  useRemoteMediaClient: () => ({ loadMedia: mockLoadMedia, stop: () => {} }),
}));

import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { renderHook } from "@testing-library/react-native";
import { isAxiosError } from "axios";
import { makeApi } from "@/test-utils/jellyfinApi";
import { clearMmkv } from "@/test-utils/mmkv";
import { readFromLog } from "@/utils/log";
import { useMusicCast } from "./useMusicCast";

const queue: BaseItemDto[] = [
  {
    Id: "0a1b2c3d4e5f60718293a4b5c6d7e8f9",
    Name: "First Track",
    RunTimeTicks: 1_800_000_000,
  },
  {
    Id: "f9e8d7c6b5a4938271605f4e3d2c1b0a",
    Name: "Second Track",
    RunTimeTicks: 2_400_000_000,
  },
];

const castWith = async (api: ReturnType<typeof makeApi>) => {
  const { result } = await renderHook(() =>
    useMusicCast({ api, userId: "user-1" }),
  );
  return result.current.castQueue({ queue, startIndex: 1 });
};

beforeEach(() => {
  mockCaptured.length = 0;
  mockLoadMedia.mockClear();
  clearMmkv();
});

describe("useMusicCast castQueue", () => {
  test("casts the queue the server streams, from the track asked for", async () => {
    const api = makeApi({
      PlaySessionId: "session-1",
      MediaSources: [{ Id: "source-1", Container: "flac" }],
    });
    expect(await castWith(api)).toBe(true);
    const [request] = mockLoadMedia.mock.calls[0] as [
      { queueData: { items: unknown[]; startIndex: number } },
    ];
    expect(request.queueData.items).toHaveLength(2);
    expect(request.queueData.startIndex).toBe(1);
  });

  // The app back from the background asks before the network is back: no
  // answer, which is the user's environment and stays in the local log. It
  // was sent as "Failed to get stream URL for track: <name>", the request's
  // own error dropped on the way (Sentry REACT-NATIVE-NR).
  test("keeps a server out of reach out of Sentry", async () => {
    const api = makeApi();
    api.mock.onPost(/\/PlaybackInfo$/).networkError();
    expect(await castWith(api)).toBe(false);
    expect(mockLoadMedia).not.toHaveBeenCalled();
    expect(mockCaptured).toEqual([]);
    expect(readFromLog().map((entry) => entry.message)).toContain(
      "Casting music queue failed",
    );
  });

  // Tracks the server does not find: in the other events, every PlaybackInfo
  // of the queue answered 404. Reported as what it is, a refused request on
  // that route, and without the name of the user's track.
  test("reports a refused track by its request, not by its name", async () => {
    const api = makeApi();
    api.mock.onPost(/\/PlaybackInfo$/).reply(404);
    expect(await castWith(api)).toBe(false);
    expect(mockCaptured).toHaveLength(1);
    const [{ exception, fingerprint }] = mockCaptured;
    expect(isAxiosError(exception) && exception.response?.status).toBe(404);
    expect(fingerprint).toEqual([
      "Casting music queue failed",
      "POST",
      "/Items/:id/PlaybackInfo",
      "404",
    ]);
    expect(JSON.stringify(fingerprint)).not.toContain("First Track");
  });
});

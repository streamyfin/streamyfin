import { act, renderHook } from "@testing-library/react-native";
import { AppState } from "react-native";
import { clearMmkv } from "@/test-utils/mmkv";
import {
  getOfflineProgress,
  markOfflineProgress,
} from "@/utils/offlineProgressQueue";
import { useOfflineProgressSync } from "./useOfflineProgressSync";
import type { PlaybackSyncResult } from "./useTwoWaySync";

jest.mock(
  "react-native-mmkv",
  () => jest.requireActual("@/test-utils/mmkv").mmkvModule,
);

let mockServerConnected: boolean | null = false;
let mockReachable = true;
let mockUserId: string | undefined = "alice";
let mockDownloaded = new Set<string>();
const mockSync = jest.fn<Promise<PlaybackSyncResult>, [string]>(
  async () => "pushed",
);
const mockInvalidate = jest.fn(async () => {});

jest.mock("@/providers/NetworkStatusProvider", () => ({
  useNetworkStatus: () => ({ serverConnected: mockServerConnected }),
  checkApiReachable: async () => mockReachable,
}));
jest.mock("@/providers/DownloadProvider", () => ({
  useDownload: () => ({
    getDownloadedItemById: (id: string) =>
      mockDownloaded.has(id) ? { item: { Id: id } } : undefined,
  }),
}));
jest.mock("./useTwoWaySync", () => ({
  useTwoWaySync: () => ({ syncPlaybackStateDetailed: mockSync }),
}));
jest.mock("@/hooks/useNetworkAwareQueryClient", () => ({
  useNetworkAwareQueryClient: () => ({ invalidateQueries: mockInvalidate }),
}));
jest.mock("@/utils/log", () => ({ writeToLog: jest.fn() }));
// The atoms stand in as tags; useAtomValue answers by tag.
jest.mock("@/utils/atoms/api", () => ({ apiAtom: "api", userAtom: "user" }));
jest.mock("jotai", () => ({
  ...jest.requireActual("jotai"),
  useAtomValue: (atom: unknown) =>
    atom === "user"
      ? mockUserId && { Id: mockUserId }
      : { basePath: "http://jellyfin.local" },
}));

const flush = () => act(async () => {});

beforeEach(() => {
  clearMmkv();
  mockServerConnected = false;
  mockReachable = true;
  mockUserId = "alice";
  mockDownloaded = new Set(["episode-1", "episode-2"]);
  mockSync.mockReset();
  mockSync.mockImplementation(async () => "pushed");
  mockInvalidate.mockClear();
});

describe("useOfflineProgressSync", () => {
  // The reported bug: progress made offline stayed on the phone after the
  // connection came back, until the user pulled to refresh on Home.
  test("pushes queued progress when the server answers again", async () => {
    markOfflineProgress("alice", "episode-1");
    const { rerender } = await renderHook(() => useOfflineProgressSync());
    await flush();
    expect(mockSync).not.toHaveBeenCalled();

    mockServerConnected = true;
    await rerender({});
    await flush();

    expect(mockSync).toHaveBeenCalledTimes(1);
    expect(mockSync).toHaveBeenCalledWith("episode-1");
    expect(getOfflineProgress("alice")).toEqual([]);
    expect(mockInvalidate).toHaveBeenCalled();
  });

  test("sends nothing on a launch with nothing queued", async () => {
    mockServerConnected = true;
    await renderHook(() => useOfflineProgressSync());
    await flush();
    expect(mockSync).not.toHaveBeenCalled();
  });

  // Downloads carry no owner: bob signing in must not receive alice's
  // offline progress.
  test("only sends the signed-in user's own queue", async () => {
    markOfflineProgress("alice", "episode-1");
    mockUserId = "bob";
    mockServerConnected = true;
    await renderHook(() => useOfflineProgressSync());
    await flush();

    expect(mockSync).not.toHaveBeenCalled();
    expect(getOfflineProgress("alice")).toEqual(["episode-1"]);
  });

  test("keeps a failed item queued and retries it on the next foreground", async () => {
    markOfflineProgress("alice", "episode-1");
    mockSync.mockResolvedValueOnce("failed");
    mockServerConnected = true;
    await renderHook(() => useOfflineProgressSync());
    await flush();
    expect(getOfflineProgress("alice")).toEqual(["episode-1"]);
    expect(mockInvalidate).not.toHaveBeenCalled();

    const listener = (AppState.addEventListener as jest.Mock).mock.calls.at(
      -1,
    )?.[1];
    await act(async () => listener?.("active"));
    await flush();

    expect(mockSync).toHaveBeenCalledTimes(2);
    expect(getOfflineProgress("alice")).toEqual([]);
  });

  test("takes the server's newer state without refetching", async () => {
    markOfflineProgress("alice", "episode-1");
    mockSync.mockResolvedValueOnce("pulled");
    mockServerConnected = true;
    await renderHook(() => useOfflineProgressSync());
    await flush();

    expect(getOfflineProgress("alice")).toEqual([]);
    expect(mockInvalidate).not.toHaveBeenCalled();
  });

  // serverConnected defaults to true before the first probe: an offline cold
  // start must not fire a failing request per queued item.
  test("sends nothing while the server does not answer", async () => {
    markOfflineProgress("alice", "episode-1");
    mockReachable = false;
    mockServerConnected = true;
    await renderHook(() => useOfflineProgressSync());
    await flush();

    expect(mockSync).not.toHaveBeenCalled();
    expect(getOfflineProgress("alice")).toEqual(["episode-1"]);
  });

  test("drops a queued item whose download was deleted", async () => {
    markOfflineProgress("alice", "deleted-episode");
    mockServerConnected = true;
    await renderHook(() => useOfflineProgressSync());
    await flush();

    expect(mockSync).not.toHaveBeenCalled();
    expect(getOfflineProgress("alice")).toEqual([]);
  });
});

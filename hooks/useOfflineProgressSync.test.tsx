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
const T1 = "2026-11-05T10:00:00.000Z";
const T2 = "2026-11-05T11:00:00.000Z";
// The downloads on the device, with the LastPlayedDate of their local progress.
let mockDownloaded = new Map<string, string>();
let mockBasePath = "http://jellyfin.local";
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
      mockDownloaded.has(id)
        ? {
            item: {
              Id: id,
              UserData: { LastPlayedDate: mockDownloaded.get(id) },
            },
          }
        : undefined,
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
      : { basePath: mockBasePath },
}));

const flush = () => act(async () => {});

beforeEach(() => {
  clearMmkv();
  mockServerConnected = false;
  mockReachable = true;
  mockUserId = "alice";
  mockDownloaded = new Map([
    ["episode-1", T1],
    ["episode-2", T1],
  ]);
  mockBasePath = "http://jellyfin.local";
  mockSync.mockReset();
  mockSync.mockImplementation(async () => "pushed");
  mockInvalidate.mockClear();
});

describe("useOfflineProgressSync", () => {
  // The reported bug: progress made offline stayed on the phone after the
  // connection came back, until the user pulled to refresh on Home.
  test("pushes queued progress when the server answers again", async () => {
    markOfflineProgress("alice", "episode-1", T1);
    const { rerender } = await renderHook(() => useOfflineProgressSync());
    await flush();
    expect(mockSync).not.toHaveBeenCalled();

    mockServerConnected = true;
    await rerender({});
    await flush();

    expect(mockSync).toHaveBeenCalledTimes(1);
    expect(mockSync).toHaveBeenCalledWith("episode-1");
    expect(getOfflineProgress("alice")).toEqual({});
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
    markOfflineProgress("alice", "episode-1", T1);
    mockUserId = "bob";
    mockServerConnected = true;
    await renderHook(() => useOfflineProgressSync());
    await flush();

    expect(mockSync).not.toHaveBeenCalled();
    expect(getOfflineProgress("alice")).toEqual({ "episode-1": T1 });
  });

  test("keeps a failed item queued and retries it on the next foreground", async () => {
    markOfflineProgress("alice", "episode-1", T1);
    mockSync.mockResolvedValueOnce("failed");
    mockServerConnected = true;
    await renderHook(() => useOfflineProgressSync());
    await flush();
    expect(getOfflineProgress("alice")).toEqual({ "episode-1": T1 });
    expect(mockInvalidate).not.toHaveBeenCalled();

    const listener = (AppState.addEventListener as jest.Mock).mock.calls.at(
      -1,
    )?.[1];
    await act(async () => listener?.("active"));
    await flush();

    expect(mockSync).toHaveBeenCalledTimes(2);
    expect(getOfflineProgress("alice")).toEqual({});
  });

  // A pull rewrote the downloaded record: cached pages must refetch it.
  test("takes the server's newer state and refreshes the pages", async () => {
    markOfflineProgress("alice", "episode-1", T1);
    mockSync.mockResolvedValueOnce("pulled");
    mockServerConnected = true;
    await renderHook(() => useOfflineProgressSync());
    await flush();

    expect(getOfflineProgress("alice")).toEqual({});
    expect(mockInvalidate).toHaveBeenCalled();
  });

  test("leaves the pages alone when nothing changed", async () => {
    markOfflineProgress("alice", "episode-1", T1);
    mockSync.mockResolvedValueOnce("unchanged");
    mockServerConnected = true;
    await renderHook(() => useOfflineProgressSync());
    await flush();

    expect(getOfflineProgress("alice")).toEqual({});
    expect(mockInvalidate).not.toHaveBeenCalled();
  });

  test("drops an item deleted on the server", async () => {
    markOfflineProgress("alice", "episode-1", T1);
    mockSync.mockResolvedValueOnce("missing");
    mockServerConnected = true;
    await renderHook(() => useOfflineProgressSync());
    await flush();

    expect(getOfflineProgress("alice")).toEqual({});
  });

  // Downloads carry no owner: bob played alice's queued download since, so
  // the local progress is bob's and must not reach alice's account.
  test("never pushes progress another account saved since", async () => {
    markOfflineProgress("alice", "episode-1", T1);
    mockDownloaded.set("episode-1", T2);
    mockServerConnected = true;
    await renderHook(() => useOfflineProgressSync());
    await flush();

    expect(mockSync).not.toHaveBeenCalled();
    expect(getOfflineProgress("alice")).toEqual({});
  });

  test("keeps progress saved again during the sync", async () => {
    markOfflineProgress("alice", "episode-1", T1);
    mockSync.mockImplementationOnce(async () => {
      markOfflineProgress("alice", "episode-1", T2);
      return "pushed";
    });
    mockServerConnected = true;
    await renderHook(() => useOfflineProgressSync());
    await flush();

    expect(getOfflineProgress("alice")).toEqual({ "episode-1": T2 });
  });

  // Nothing re-probes the server on its own when the app comes back.
  test("probes on foreground even after the server was unreachable", async () => {
    markOfflineProgress("alice", "episode-1", T1);
    mockServerConnected = false;
    await renderHook(() => useOfflineProgressSync());
    await flush();
    expect(mockSync).not.toHaveBeenCalled();

    const listener = (AppState.addEventListener as jest.Mock).mock.calls.at(
      -1,
    )?.[1];
    await act(async () => listener?.("active"));
    await flush();

    expect(mockSync).toHaveBeenCalledWith("episode-1");
    expect(getOfflineProgress("alice")).toEqual({});
  });

  test("syncs when the server is set again", async () => {
    mockServerConnected = true;
    const { rerender } = await renderHook(() => useOfflineProgressSync());
    await flush();
    markOfflineProgress("alice", "episode-1", T1);

    mockBasePath = "http://jellyfin.other";
    await rerender({});
    await flush();

    expect(mockSync).toHaveBeenCalledWith("episode-1");
  });

  // serverConnected defaults to true before the first probe: an offline cold
  // start must not fire a failing request per queued item.
  test("sends nothing while the server does not answer", async () => {
    markOfflineProgress("alice", "episode-1", T1);
    mockReachable = false;
    mockServerConnected = true;
    await renderHook(() => useOfflineProgressSync());
    await flush();

    expect(mockSync).not.toHaveBeenCalled();
    expect(getOfflineProgress("alice")).toEqual({ "episode-1": T1 });
  });

  test("drops a queued item whose download was deleted", async () => {
    markOfflineProgress("alice", "deleted-episode", T1);
    mockServerConnected = true;
    await renderHook(() => useOfflineProgressSync());
    await flush();

    expect(mockSync).not.toHaveBeenCalled();
    expect(getOfflineProgress("alice")).toEqual({});
  });
});

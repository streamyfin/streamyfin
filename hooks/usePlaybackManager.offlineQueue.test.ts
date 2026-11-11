import { renderHook } from "@testing-library/react-native";
import { clearMmkv } from "@/test-utils/mmkv";
import { getOfflineProgress } from "@/utils/offlineProgressQueue";
import { usePlaybackManager } from "./usePlaybackManager";

jest.mock(
  "react-native-mmkv",
  () => jest.requireActual("@/test-utils/mmkv").mmkvModule,
);

const RUNTIME = 1_000_000_000;
let mockIsConnected = true;
let mockUserId = "alice";
let mockServerConnected: boolean | null = true;
// The download record of "episode-1", as the downloads database holds it.
let mockRecord: { item: Record<string, unknown> } | undefined;
const mockReport = jest.fn(async () => ({}));
const mockMarkPlayed = jest.fn(async () => ({}));
const mockMarkUnplayed = jest.fn(async () => ({}));

jest.mock("@/providers/DownloadProvider", () => ({
  useDownload: () => ({
    getDownloadedItemById: (id: string) =>
      id === "episode-1" ? mockRecord : undefined,
    updateDownloadedItem: (
      _id: string,
      next: { item: Record<string, unknown> },
    ) => {
      mockRecord = next;
    },
    getDownloadedItems: () => [],
  }),
}));
jest.mock("./useNetworkStatus", () => ({
  useNetworkStatus: () => ({
    isConnected: mockIsConnected,
    serverConnected: mockServerConnected,
  }),
}));
jest.mock("@jellyfin/sdk/lib/utils/api", () => ({
  getSessionApi: () => ({ reportPlaybackProgress: mockReport }),
  getUserDataApi: () => ({
    markPlayedItem: mockMarkPlayed,
    markUnplayedItem: mockMarkUnplayed,
  }),
  getShowApi: () => ({}),
}));
jest.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: null }),
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));
// The atoms stand in as tags; useAtomValue answers by tag.
jest.mock("@/providers/JellyfinProvider", () => ({
  apiAtom: "api",
  userAtom: "user",
}));
jest.mock("@/utils/atoms/shuffleQueue", () => ({
  shuffleQueueAtom: "shuffle",
}));
jest.mock("jotai", () => ({
  ...jest.requireActual("jotai"),
  useAtomValue: (atom: unknown) =>
    atom === "user"
      ? { Id: mockUserId }
      : atom === "api"
        ? { basePath: "http://jellyfin.local" }
        : null,
}));

const downloaded = (userData: Record<string, unknown> = {}) => ({
  item: {
    Id: "episode-1",
    RunTimeTicks: RUNTIME,
    UserData: { Played: false, PlaybackPositionTicks: 0, ...userData },
  },
});

const progressAt = (fraction: number) => ({
  ItemId: "episode-1",
  PositionTicks: RUNTIME * fraction,
});

// RNTL 14 renders asynchronously.
const manager = async () =>
  (await renderHook(() => usePlaybackManager())).result.current;

beforeEach(() => {
  clearMmkv();
  mockUserId = "alice";
  mockIsConnected = true;
  mockServerConnected = true;
  mockRecord = downloaded();
  mockReport.mockReset();
  mockReport.mockImplementation(async () => ({}));
  mockMarkPlayed.mockReset();
  mockMarkPlayed.mockImplementation(async () => ({}));
  mockMarkUnplayed.mockReset();
  mockMarkUnplayed.mockImplementation(async () => ({}));
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  (console.error as jest.Mock).mockRestore();
});

describe("usePlaybackManager and the offline progress queue", () => {
  it("queues the progress it saves while the server cannot be reached", async () => {
    mockServerConnected = false;

    await (await manager()).reportPlaybackProgress(progressAt(0.4));

    expect(getOfflineProgress("alice")).toEqual({
      "episode-1": (mockRecord!.item.UserData as { LastPlayedDate: string })
        .LastPlayedDate,
    });
  });

  it("queues the progress whose report the server refused", async () => {
    mockReport.mockRejectedValue(new Error("502"));

    await (await manager()).reportPlaybackProgress(progressAt(0.4));

    expect(Object.keys(getOfflineProgress("alice"))).toEqual(["episode-1"]);
  });

  it("queues nothing when the server took the report", async () => {
    await (await manager()).reportPlaybackProgress(progressAt(0.4));

    expect(getOfflineProgress("alice")).toEqual({});
  });

  it("queues a download marked played or unplayed while offline", async () => {
    mockIsConnected = false;

    await (await manager()).markItemPlayed("episode-1");
    const playedStamp = (
      mockRecord!.item.UserData as { LastPlayedDate: string }
    ).LastPlayedDate;
    expect(getOfflineProgress("alice")).toEqual({ "episode-1": playedStamp });
    expect(mockMarkPlayed).not.toHaveBeenCalled();

    await (await manager()).markItemUnplayed("episode-1");
    expect(getOfflineProgress("alice")).toEqual({
      "episode-1": (mockRecord!.item.UserData as { LastPlayedDate: string })
        .LastPlayedDate,
    });
  });

  it("queues a mark the server failed to take, and still reports the failure", async () => {
    mockMarkPlayed.mockRejectedValue(new Error("503"));

    await expect((await manager()).markItemPlayed("episode-1")).rejects.toThrow(
      "503",
    );

    expect(Object.keys(getOfflineProgress("alice"))).toEqual(["episode-1"]);
  });

  it("leaves a watched download watched when it is only re-opened for a moment", async () => {
    mockServerConnected = false;
    mockRecord = downloaded({
      Played: true,
      LastPlayedDate: "2026-11-01T10:00:00.000Z",
    });

    await (await manager()).reportPlaybackProgress(progressAt(0.02));

    expect(mockRecord!.item.UserData).toMatchObject({
      Played: true,
      LastPlayedDate: "2026-11-01T10:00:00.000Z",
    });
    expect(getOfflineProgress("alice")).toEqual({});
  });

  // Downloads carry no owner: a failed report after a save that wrote nothing
  // must not queue the record's stamp, which may be another account's.
  it("queues no stamp it did not write when a report fails", async () => {
    // A user with no save of their own yet in this process.
    mockUserId = "carol";
    mockRecord = downloaded({
      Played: true,
      LastPlayedDate: "2026-11-01T10:00:00.000Z",
    });
    mockReport.mockRejectedValue(new Error("502"));

    await (await manager()).reportPlaybackProgress(progressAt(0.02));

    expect(getOfflineProgress("carol")).toEqual({});
  });
});

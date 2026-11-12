import { renderHook } from "@testing-library/react-native";
import { AxiosError, type AxiosResponse } from "axios";
import { useTwoWaySync } from "./useTwoWaySync";

const mockGetItem = jest.fn();
const mockUpdateUserData = jest.fn(async () => ({}));
type Record = { item: { Id: string; UserData: { LastPlayedDate?: string } } };
// The download record as the downloads database holds it now.
let mockRecord: Record = { item: { Id: "episode-1", UserData: {} } };
const mockUpdateDownloaded = jest.fn((_id: string, next: Record) => {
  mockRecord = next;
});

jest.mock("@jellyfin/sdk/lib/utils/api", () => ({
  getLibraryApi: () => ({ getItem: mockGetItem }),
  getUserDataApi: () => ({ updateItemUserData: mockUpdateUserData }),
}));
jest.mock("@/providers/DownloadProvider", () => ({
  useDownload: () => ({
    getDownloadedItemById: () => mockRecord,
    updateDownloadedItem: mockUpdateDownloaded,
  }),
}));
jest.mock("./useNetworkStatus", () => ({
  useNetworkStatus: () => ({ isConnected: true }),
}));
jest.mock("@/utils/log", () => ({ logAndCaptureError: jest.fn() }));
// The atoms stand in as tags; useAtomValue answers by tag.
jest.mock("../providers/JellyfinProvider", () => ({
  apiAtom: "api",
  userAtom: "user",
}));
jest.mock("jotai", () => ({
  ...jest.requireActual("jotai"),
  useAtomValue: (atom: unknown) => (atom === "user" ? { Id: "alice" } : {}),
}));

const failWith = (status: number) =>
  new AxiosError("request failed", undefined, undefined, undefined, {
    status,
  } as AxiosResponse);

const sync = async (options?: { stamp?: string }) => {
  const { result } = await renderHook(() => useTwoWaySync());
  return result.current.syncPlaybackStateDetailed("episode-1", options);
};

const T1 = "2026-11-05T10:00:00.000Z";
const T2 = "2026-11-05T11:00:00.000Z";
const T3 = "2026-11-05T12:00:00.000Z";
const withLastPlayed = (stamp: string): Record => ({
  item: { Id: "episode-1", UserData: { LastPlayedDate: stamp } },
});

beforeEach(() => {
  mockRecord = { item: { Id: "episode-1", UserData: {} } };
  mockGetItem.mockReset();
  mockUpdateUserData.mockClear();
  mockUpdateDownloaded.mockClear();
});

describe("useTwoWaySync", () => {
  // Kept as failed, a server-deleted item would be fetched on every sync.
  test("reports an item deleted on the server as missing", async () => {
    mockGetItem.mockRejectedValueOnce(failWith(404));
    expect(await sync()).toBe("missing");
  });

  test("reports any other fetch error as failed", async () => {
    mockGetItem.mockRejectedValueOnce(failWith(500));
    expect(await sync()).toBe("failed");
  });

  // The local progress is shared by every account on the device: a caller that
  // does not know who queued it only takes the server's state.
  test("without a stamp, a newer local state stays on the device", async () => {
    mockRecord = withLastPlayed(T2);
    mockGetItem.mockResolvedValueOnce({
      data: { Id: "episode-1", UserData: { LastPlayedDate: T1 } },
    });

    expect(await sync()).toBe("unchanged");
    expect(mockUpdateUserData).not.toHaveBeenCalled();
    expect(mockUpdateDownloaded).not.toHaveBeenCalled();
  });

  test("without a stamp, takes a newer server state", async () => {
    mockRecord = withLastPlayed(T1);
    mockGetItem.mockResolvedValueOnce({
      data: { Id: "episode-1", UserData: { LastPlayedDate: T2 } },
    });

    expect(await sync()).toBe("pulled");
    expect(mockRecord.item.UserData.LastPlayedDate).toBe(T2);
  });

  // The record is read again once the server answers: a save that landed
  // during the fetch is no longer the one this user queued, whether another
  // account switched in or this one played on, and is neither sent nor
  // written over.
  test("does not push a record saved since the queued stamp", async () => {
    mockRecord = withLastPlayed(T1);
    mockGetItem.mockImplementationOnce(async () => {
      mockRecord = withLastPlayed(T3);
      return { data: { Id: "episode-1", UserData: { LastPlayedDate: T2 } } };
    });

    expect(await sync({ stamp: T1 })).toBe("unchanged");
    expect(mockUpdateUserData).not.toHaveBeenCalled();
    expect(mockUpdateDownloaded).not.toHaveBeenCalled();
  });

  test("does not pull over a record saved since the queued stamp", async () => {
    mockRecord = withLastPlayed(T1);
    mockGetItem.mockImplementationOnce(async () => {
      mockRecord = withLastPlayed(T2);
      return { data: { Id: "episode-1", UserData: { LastPlayedDate: T3 } } };
    });

    expect(await sync({ stamp: T1 })).toBe("unchanged");
    expect(mockRecord.item.UserData.LastPlayedDate).toBe(T2);
    expect(mockUpdateDownloaded).not.toHaveBeenCalled();
  });

  test("pushes the record while it is still the queued save", async () => {
    mockRecord = withLastPlayed(T3);
    mockGetItem.mockResolvedValueOnce({
      data: { Id: "episode-1", UserData: { LastPlayedDate: T2 } },
    });

    expect(await sync({ stamp: T3 })).toBe("pushed");
    expect(mockUpdateUserData).toHaveBeenCalledWith(
      expect.objectContaining({
        updateUserItemDataDto: expect.objectContaining({ LastPlayedDate: T3 }),
      }),
    );
  });

  test("takes a newer server state over the queued save", async () => {
    mockRecord = withLastPlayed(T1);
    mockGetItem.mockResolvedValueOnce({
      data: { Id: "episode-1", UserData: { LastPlayedDate: T2 } },
    });

    expect(await sync({ stamp: T1 })).toBe("pulled");
  });
});

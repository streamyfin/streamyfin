import { renderHook } from "@testing-library/react-native";
import { AxiosError, type AxiosResponse } from "axios";
import { useTwoWaySync } from "./useTwoWaySync";

const mockGetItem = jest.fn();

jest.mock("@jellyfin/sdk/lib/utils/api", () => ({
  getLibraryApi: () => ({ getItem: mockGetItem }),
  getUserDataApi: () => ({}),
}));
jest.mock("@/providers/DownloadProvider", () => ({
  useDownload: () => ({
    getDownloadedItemById: () => ({ item: { Id: "episode-1", UserData: {} } }),
    updateDownloadedItem: jest.fn(),
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

const sync = async () => {
  const { result } = await renderHook(() => useTwoWaySync());
  return result.current.syncPlaybackStateDetailed("episode-1");
};

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
});

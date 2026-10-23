import { act, renderHook } from "@testing-library/react-native";
import { useExternalPlayer } from "./useExternalPlayer";

const mockStartActivity = jest.fn();
const mockSaveLocal = jest.fn();
const mockMarkPlayed = jest.fn();
const mockReportStopped = jest.fn();
let mockUri: string | null = "content://provider/movie.mkv";
let mockConnected = true;
const mockApi = { basePath: "https://jf.example", accessToken: "token" };

jest.mock("expo-intent-launcher", () => ({
  startActivityAsync: (...args: unknown[]) => mockStartActivity(...args),
}));
jest.mock("jotai", () => ({
  ...jest.requireActual("jotai"),
  useAtomValue: () => mockApi,
}));
jest.mock("@/utils/atoms/api", () => ({ apiAtom: {} }));
jest.mock("@/hooks/useNetworkStatus", () => ({
  useNetworkStatus: () => ({ isConnected: mockConnected }),
}));
jest.mock("@/hooks/usePlaybackManager", () => ({
  usePlaybackManager: () => ({
    saveLocalPlaybackProgress: mockSaveLocal,
    markItemPlayed: mockMarkPlayed,
  }),
}));
jest.mock("@jellyfin/sdk/lib/utils/api", () => ({
  getPlaystateApi: () => ({ reportPlaybackStopped: mockReportStopped }),
}));
jest.mock("@/utils/externalPlayer", () => ({
  ...jest.requireActual("@/utils/externalPlayer"),
  getExternalPlayerUri: () => mockUri,
}));
jest.mock("@/utils/log", () => ({ writeErrorLog: jest.fn() }));
jest.mock(
  "react-native-mmkv",
  () => jest.requireActual("@/test-utils/mmkv").mmkvModule,
);

const req = { itemId: "movie-1", offline: true, mediaSourceId: "source-1" };

const playReturning = async (extra?: object) => {
  mockStartActivity.mockResolvedValue({ resultCode: -1, extra });
  const { result } = await renderHook(() => useExternalPlayer());
  let opened: boolean | undefined;
  await act(async () => {
    opened = await result.current(req, { Id: "movie-1", Name: "A Movie" });
  });
  return opened;
};

describe("useExternalPlayer", () => {
  beforeEach(() => {
    mockStartActivity.mockReset();
    mockSaveLocal.mockReset();
    mockMarkPlayed.mockReset().mockResolvedValue(undefined);
    mockReportStopped.mockReset().mockResolvedValue(undefined);
    mockUri = "content://provider/movie.mkv";
    mockConnected = true;
  });

  test("on Android, lets the user pick the app in the Open with dialog", async () => {
    await playReturning();

    expect(mockStartActivity).toHaveBeenCalledWith(
      "android.intent.action.VIEW",
      expect.objectContaining({
        data: "content://provider/movie.mkv",
        type: "video/*",
        flags: 1,
      }),
    );
  });

  test("reports where the other app stopped, locally and to the server", async () => {
    expect(await playReturning({ extra_position: 90_000 })).toBe(true);

    expect(mockSaveLocal).toHaveBeenCalledWith({
      ItemId: "movie-1",
      PositionTicks: 900_000_000,
    });
    expect(mockReportStopped).toHaveBeenCalledWith({
      playbackStopInfo: {
        ItemId: "movie-1",
        MediaSourceId: "source-1",
        PositionTicks: 900_000_000,
      },
    });
  });

  test("keeps the position on the device while the server is out of reach", async () => {
    mockConnected = false;

    await playReturning({ position: 90_000 });

    expect(mockSaveLocal).toHaveBeenCalled();
    expect(mockReportStopped).not.toHaveBeenCalled();
  });

  test("marks a video that ran to its end as played", async () => {
    await playReturning({ end_by: "playback_completion" });

    expect(mockMarkPlayed).toHaveBeenCalledWith("movie-1");
    expect(mockSaveLocal).not.toHaveBeenCalled();
  });

  // A player that sends nothing we know must leave the resume point alone.
  test("reports nothing when the other app sends no position it knows", async () => {
    expect(await playReturning({ some_player_time: 90_000 })).toBe(true);

    expect(mockSaveLocal).not.toHaveBeenCalled();
    expect(mockReportStopped).not.toHaveBeenCalled();
    expect(mockMarkPlayed).not.toHaveBeenCalled();
  });

  test("says it could not open anything when no app takes the video", async () => {
    mockStartActivity.mockRejectedValue(new Error("No Activity found"));
    const { result } = await renderHook(() => useExternalPlayer());
    let opened: boolean | undefined;
    await act(async () => {
      opened = await result.current(req);
    });

    expect(opened).toBe(false);
  });

  test("says it could not open anything when there is no file to hand over", async () => {
    mockUri = null;

    expect(await playReturning()).toBe(false);
    expect(mockStartActivity).not.toHaveBeenCalled();
  });

  test("still counts as played in the other app when the report fails", async () => {
    mockReportStopped.mockRejectedValue(new Error("offline"));

    expect(await playReturning({ position: 90_000 })).toBe(true);
  });
});

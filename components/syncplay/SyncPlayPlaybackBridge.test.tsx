import { act, render } from "@testing-library/react-native";
import type { SyncPlayLauncher } from "@/utils/syncplay/types";
import { SyncPlayPlaybackBridge } from "./SyncPlayPlaybackBridge";

const mockRouter = { push: jest.fn(), back: jest.fn() };
let mockPathname = "/syncplay";
let mockLauncher: SyncPlayLauncher | null = null;
let mockAvailable = true;
const mockPresent = jest.fn(async () => true);
const mockRegisterLauncher = jest.fn((launcher: SyncPlayLauncher) => {
  mockLauncher = launcher;
  return () => {
    mockLauncher = null;
  };
});

jest.mock("expo-router", () => ({
  get router() {
    return mockRouter;
  },
  usePathname: () => mockPathname,
}));
jest.mock("@/providers/SyncPlayProvider", () => ({
  useSyncPlay: () => ({ registerLauncher: mockRegisterLauncher }),
}));
jest.mock("@/utils/syncplay/availability", () => ({
  isSyncPlayAvailable: () => mockAvailable,
}));
jest.mock("@/providers/NativePlayerProvider", () => ({
  useNativePlayer: () => ({ presentFromRequest: mockPresent }),
}));

const request = (itemId = "movie-1", isCurrent = () => true) => ({
  itemId,
  playlistItemId: `playlist-${itemId}`,
  startPositionTicks: 100_000_000,
  isCurrent,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockPathname = "/syncplay";
  mockLauncher = null;
  mockAvailable = true;
});

test("a group launch presents the native player, never a JS route", async () => {
  await render(<SyncPlayPlaybackBridge />);
  await act(async () => {
    await mockLauncher?.(request());
  });
  expect(mockPresent).toHaveBeenCalledWith(
    { itemId: "movie-1", playbackPositionTicks: 100_000_000, offline: false },
    { isCurrent: expect.any(Function) },
  );
  expect(mockRouter.push).not.toHaveBeenCalled();
  expect(mockRouter.back).not.toHaveBeenCalled();
});

test("no launcher is registered where the native player cannot run", async () => {
  mockAvailable = false;
  await render(<SyncPlayPlaybackBridge />);
  expect(mockRegisterLauncher).not.toHaveBeenCalled();
});

test("an obsolete launch does not open a player", async () => {
  await render(<SyncPlayPlaybackBridge />);
  await act(async () => {
    await mockLauncher?.(request("movie-1", () => false));
  });
  expect(mockPresent).not.toHaveBeenCalled();
});

test("a launch the player refuses fails, so the group is not left waiting", async () => {
  mockPresent.mockResolvedValueOnce(false);
  await render(<SyncPlayPlaybackBridge />);
  await expect(mockLauncher?.(request())).rejects.toThrow(
    "could not be presented",
  );
});

test("a launch invalidated while the player prepares is not a failure", async () => {
  let completePresent!: () => void;
  mockPresent.mockImplementationOnce(
    () =>
      new Promise<boolean>((resolve) => {
        completePresent = () => resolve(false);
      }),
  );
  await render(<SyncPlayPlaybackBridge />);
  let current = true;
  const launching = mockLauncher?.(request("movie-1", () => current));
  expect(mockPresent).toHaveBeenCalledTimes(1);
  current = false;
  await act(async () => {
    completePresent();
    await launching;
  });
});

test("an open JS player is closed before the native one is presented", async () => {
  mockPathname = "/player/direct-player";
  await render(<SyncPlayPlaybackBridge />);
  await act(async () => {
    await mockLauncher?.(request());
  });
  expect(mockRouter.back).toHaveBeenCalledTimes(1);
  expect(mockRouter.back.mock.invocationCallOrder[0]).toBeLessThan(
    mockPresent.mock.invocationCallOrder[0],
  );
});

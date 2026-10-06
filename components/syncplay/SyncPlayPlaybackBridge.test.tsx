import { act, render, screen } from "@testing-library/react-native";
import { NavigationContext } from "expo-router/react-navigation";
import type { SyncPlayLauncher } from "@/utils/syncplay/types";
import { SyncPlayPlaybackBridge } from "./SyncPlayPlaybackBridge";

const mockRouter = { push: jest.fn(), setParams: jest.fn(), back: jest.fn() };
let mockPathname = "/syncplay";
let mockLauncher: SyncPlayLauncher | null = null;
let mockNativeAvailable = false;
const mockPresent = jest.fn(async () => true);
const mockRegisterLauncher = jest.fn((launcher: SyncPlayLauncher) => {
  mockLauncher = launcher;
  return () => {
    mockLauncher = null;
  };
});
// A parent navigator remains focused while its child player opens and closes.
// It emits no new focus event to reset a screen-specific push guard.
const mockRootNavigation = {
  isFocused: () => true,
  addListener: jest.fn(() => () => {}),
};

jest.mock("expo-router", () => ({
  useRouter: () => mockRouter,
  usePathname: () => mockPathname,
}));
jest.mock("expo-router/react-navigation", () => ({
  NavigationContext: jest.requireActual("react").createContext(undefined),
}));
jest.mock("@/providers/OfflineModeProvider", () => ({
  useOfflineMode: () => false,
}));
jest.mock("@/providers/SyncPlayProvider", () => ({
  useSyncPlay: () => ({ registerLauncher: mockRegisterLauncher }),
}));
jest.mock("@/modules/mpv-player", () => ({
  isNativePlayerSyncPlayAvailable: () => mockNativeAvailable,
}));
jest.mock("@/providers/NativePlayerProvider", () => ({
  useNativePlayer: () => ({ presentFromRequest: mockPresent }),
}));

const bridge = () => (
  <NavigationContext.Provider value={mockRootNavigation as never}>
    <SyncPlayPlaybackBridge />
  </NavigationContext.Provider>
);
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
  mockNativeAvailable = false;
});

test("the global launcher opens again after its first player closes", async () => {
  await render(bridge());
  await act(async () => {
    await mockLauncher?.(request());
  });
  expect(mockRouter.push).toHaveBeenCalledTimes(1);
  mockPathname = "/player/direct-player";
  await screen.rerender(bridge());
  mockPathname = "/syncplay";
  await screen.rerender(bridge());
  await act(async () => {
    await mockLauncher?.(request("movie-2"));
  });
  expect(mockRouter.push).toHaveBeenCalledTimes(2);
  expect(mockRouter.push.mock.calls[1][0]).toContain("itemId=movie-2");
});

test("a shared queue switch updates the active player route", async () => {
  mockPathname = "/player/direct-player";
  await render(bridge());
  await act(async () => {
    await mockLauncher?.(request("movie-2"));
  });
  expect(mockRouter.push).not.toHaveBeenCalled();
  expect(mockRouter.setParams).toHaveBeenCalledWith(
    expect.objectContaining({
      itemId: "movie-2",
      playbackPosition: "100000000",
      offline: "false",
      mediaSourceId: "",
    }),
  );
});

test("an obsolete launch does not open a player", async () => {
  mockNativeAvailable = true;
  await render(bridge());
  await act(async () => {
    await mockLauncher?.(request("movie-1", () => false));
  });
  expect(mockPresent).not.toHaveBeenCalled();
  expect(mockRouter.push).not.toHaveBeenCalled();
});

test("native SyncPlay always presents the native player without a JS route", async () => {
  mockNativeAvailable = true;
  await render(bridge());
  await act(async () => {
    await mockLauncher?.(request());
  });
  expect(mockPresent).toHaveBeenCalledWith(
    { itemId: "movie-1", playbackPositionTicks: 100_000_000, offline: false },
    { isCurrent: expect.any(Function) },
  );
  expect(mockRouter.push).not.toHaveBeenCalled();
  expect(mockRouter.setParams).not.toHaveBeenCalled();
});

test("a native launch invalidated during preparation does not fall back", async () => {
  mockNativeAvailable = true;
  let completePresent!: () => void;
  mockPresent.mockImplementationOnce(
    () =>
      new Promise<boolean>((resolve) => {
        completePresent = () => resolve(false);
      }),
  );
  await render(bridge());
  let current = true;
  const launching = mockLauncher?.(request("movie-1", () => current));
  expect(mockPresent).toHaveBeenCalledTimes(1);
  current = false;
  await act(async () => {
    completePresent();
    await launching;
  });
  expect(mockRouter.push).not.toHaveBeenCalled();
  expect(mockRouter.setParams).not.toHaveBeenCalled();
});

test("a native group launch closes the deprecated player first", async () => {
  mockNativeAvailable = true;
  mockPathname = "/player/direct-player";
  await render(bridge());
  await act(async () => {
    await mockLauncher?.(request());
  });
  expect(mockRouter.back).toHaveBeenCalledTimes(1);
  expect(mockRouter.back.mock.invocationCallOrder[0]).toBeLessThan(
    mockPresent.mock.invocationCallOrder[0],
  );
  expect(mockRouter.push).not.toHaveBeenCalled();
});

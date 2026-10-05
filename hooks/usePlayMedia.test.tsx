import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { act, renderHook } from "@testing-library/react-native";
import { Alert } from "react-native";
import { usePlayMedia } from "./usePlayMedia";

const mockPush = jest.fn();
const mockPresentFromRequest = jest.fn();
let mockNativeChromeActive = false;
const mockUpdateSettings = jest.fn();
const mockResetStillWatchingSession = jest.fn();

jest.mock("@/hooks/useAppRouter", () => ({
  __esModule: true,
  default: () => ({ push: mockPush }),
}));
jest.mock("@/modules/mpv-player", () => ({
  isNativePlayerPresented: () => false,
}));
jest.mock("@/providers/NativePlayerProvider", () => ({
  useNativePlayer: () => ({ presentFromRequest: mockPresentFromRequest }),
}));
jest.mock("@/utils/atoms/settings", () => ({
  isNativeChromeActive: () => mockNativeChromeActive,
  useSettings: () => ({
    settings: { stillWatchingPreset: "default" },
    updateSettings: mockUpdateSettings,
  }),
}));
jest.mock("@/utils/stillWatching", () => ({
  resetStillWatchingSession: () => mockResetStillWatchingSession(),
}));
jest.mock("@/utils/log", () => ({ writeErrorLog: jest.fn() }));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const play = async (item: BaseItemDto) => {
  const { result } = await renderHook(() => usePlayMedia());
  await act(async () => {
    await result.current({ itemId: item.Id!, offline: false }, { item });
  });
};

describe("usePlayMedia", () => {
  let alert: jest.SpyInstance;

  beforeEach(() => {
    mockPush.mockClear();
    mockPresentFromRequest.mockReset().mockResolvedValue(false);
    mockNativeChromeActive = false;
    mockUpdateSettings.mockClear();
    mockResetStillWatchingSession.mockClear();
    alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  });

  afterEach(() => {
    alert.mockRestore();
  });

  test("opens the player for a movie", async () => {
    await play({ Id: "movie-1", Type: "Movie" });

    expect(mockPush).toHaveBeenCalledWith(
      expect.stringContaining("/player/direct-player?itemId=movie-1"),
    );
    expect(alert).not.toHaveBeenCalled();
  });

  // jellyfin-web 12 starts a new "Still watching?" session whenever the
  // viewer starts playback themselves.
  test("starts a new still watching session on a play", async () => {
    await play({ Id: "episode-1", Type: "Episode" });

    expect(mockResetStillWatchingSession).toHaveBeenCalledTimes(1);
    expect(mockUpdateSettings).toHaveBeenCalledWith({
      autoPlayEpisodeCount: 0,
    });
  });

  // A top shelf play link asks for an item and nothing else. Opening the
  // route at position 0 started a half watched episode from the beginning,
  // and leaving it cleared the resume point on the server.
  test("opens the player without a position for a request that has none", async () => {
    await play({ Id: "episode-1", Type: "Episode" });

    const query = mockPush.mock.calls[0][0].split("?")[1];
    expect(new URLSearchParams(query).get("playbackPosition")).toBe("");
  });

  // REACT-NATIVE-54 / REACT-NATIVE-5H: a Book reached the player from its
  // item page and left the user on a broken player screen.
  test("tells the user a book can't be played instead of opening the player", async () => {
    await play({ Id: "book-1", Type: "Book" });

    expect(mockPush).not.toHaveBeenCalled();
    expect(alert).toHaveBeenCalledWith(
      "player.error",
      "player.unsupported_item_type",
    );
  });

  // The native player is tried first when it is on; an unplayable item must
  // not get that far either (it was the second Sentry event per tap).
  test("does not hand an unplayable item to the native player", async () => {
    mockNativeChromeActive = true;

    await play({ Id: "season-1", Type: "Season" });

    expect(mockPresentFromRequest).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });
});

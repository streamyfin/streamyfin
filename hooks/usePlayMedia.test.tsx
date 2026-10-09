import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { act, renderHook } from "@testing-library/react-native";
import { Alert } from "react-native";
import { usePlayMedia } from "./usePlayMedia";

const mockPush = jest.fn();
const mockPresentFromRequest = jest.fn();
let mockNativeChromeActive = false;
const mockResetStillWatchingSession = jest.fn();
let mockSyncPlayEnabled = false;
const mockSyncPlayItems = jest.fn();
const mockSyncPlaylistItem = jest.fn();
let mockSyncPlaylist: { ItemId: string; PlaylistItemId: string }[] = [];

jest.mock("@/providers/SyncPlayProvider", () => ({
  useSyncPlay: () => ({
    enabled: mockSyncPlayEnabled,
    playlist: mockSyncPlaylist,
    playItems: mockSyncPlayItems,
    requestPlaylistItem: mockSyncPlaylistItem,
  }),
}));

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
    settings: {},
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
    mockResetStillWatchingSession.mockClear();
    mockSyncPlayEnabled = false;
    mockSyncPlayItems.mockReset().mockResolvedValue(undefined);
    mockSyncPlaylistItem.mockReset().mockResolvedValue(undefined);
    mockSyncPlaylist = [];
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
  });

  test("starts the group's queue instead of presenting a solo player", async () => {
    mockSyncPlayEnabled = true;
    mockNativeChromeActive = true;
    await play({ Id: "movie-1", Type: "Movie" });
    expect(mockSyncPlayItems).toHaveBeenCalledWith(["movie-1"], 0, 0);
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockPresentFromRequest).not.toHaveBeenCalled();
  });

  test("a video already in the group's queue starts there, and the queue stays", async () => {
    mockSyncPlayEnabled = true;
    mockSyncPlaylist = [
      { ItemId: "movie-0", PlaylistItemId: "entry-0" },
      { ItemId: "movie-1", PlaylistItemId: "entry-1" },
    ];
    await play({ Id: "movie-1", Type: "Movie" });
    expect(mockSyncPlaylistItem).toHaveBeenCalledWith("entry-1");
    expect(mockSyncPlayItems).not.toHaveBeenCalled();
  });

  test("keeps live television out of a synchronized video group", async () => {
    mockSyncPlayEnabled = true;
    await play({ Id: "channel-1", Type: "TvChannel" });
    expect(mockSyncPlayItems).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
    expect(alert).toHaveBeenCalledWith(
      "syncplay.title",
      "syncplay.online_video_only",
    );
  });

  test("shares the complete queue and selected resume point with the group", async () => {
    mockSyncPlayEnabled = true;
    const { result } = await renderHook(() => usePlayMedia());
    await act(async () => {
      await result.current(
        {
          itemId: "episode-2",
          offline: false,
          playbackPositionTicks: 120_000_000,
        },
        {
          item: { Id: "episode-2", Type: "Episode" },
          preserveShuffleQueue: true,
          queueItemIds: ["episode-3", "episode-2", "episode-1"],
        },
      );
    });

    expect(mockSyncPlayItems).toHaveBeenCalledWith(
      ["episode-3", "episode-2", "episode-1"],
      1,
      120_000_000,
    );
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockPresentFromRequest).not.toHaveBeenCalled();
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

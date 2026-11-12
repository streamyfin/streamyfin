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

  // Live TV used to skip the native player and open the JS route. The native
  // player closes the live stream it opens on every way out, as the route did.
  test("plays live television in the native player when it is on", async () => {
    mockNativeChromeActive = true;
    mockPresentFromRequest.mockResolvedValue(true);

    await play({ Id: "channel-1", Type: "TvChannel" });
    await play({ Id: "program-1", Type: "Program" });

    expect(mockPresentFromRequest).toHaveBeenCalledWith(
      { itemId: "channel-1", offline: false },
      { isCurrent: expect.any(Function) },
    );
    expect(mockPresentFromRequest).toHaveBeenCalledWith(
      { itemId: "program-1", offline: false },
      { isCurrent: expect.any(Function) },
    );
    expect(mockPush).not.toHaveBeenCalled();
  });

  test("a native decline still opens the JS route", async () => {
    mockNativeChromeActive = true;

    await play({ Id: "movie-1", Type: "Movie" });

    expect(mockPush).toHaveBeenCalledWith(
      expect.stringContaining("/player/direct-player?itemId=movie-1"),
    );
  });

  // A live channel takes seconds to open, long enough to press it again. The
  // second press replaces the first, whose present then resolves false: that
  // is not a decline, and opening the JS route for it put a second player and
  // a second live stream under the native one.
  test("a play replaced by a newer one does not open the JS route", async () => {
    mockNativeChromeActive = true;
    let settleFirst: (presented: boolean) => void = () => {};
    mockPresentFromRequest
      .mockImplementationOnce(
        () =>
          new Promise<boolean>((resolve) => {
            settleFirst = resolve;
          }),
      )
      .mockResolvedValueOnce(true);
    const channel = { Id: "channel-1", Type: "TvChannel" } as BaseItemDto;
    const { result } = await renderHook(() => usePlayMedia());

    await act(async () => {
      const first = result.current(
        { itemId: "channel-1", offline: false },
        { item: channel },
      );
      await result.current(
        { itemId: "channel-1", offline: false },
        { item: channel },
      );
      settleFirst(false);
      await first;
    });

    expect(mockPresentFromRequest).toHaveBeenCalledTimes(2);
    expect(mockPush).not.toHaveBeenCalled();
  });

  // The provider drops a request whose isCurrent() turns false while it
  // negotiates, and closes the live stream it opened.
  const presentAfterLeaving = async (item: BaseItemDto) => {
    mockNativeChromeActive = true;
    let settle: () => void = () => {};
    mockPresentFromRequest.mockImplementationOnce(
      (_req: unknown, options?: { isCurrent?: () => boolean }) =>
        new Promise<boolean>((resolve) => {
          settle = () => resolve(options?.isCurrent?.() !== false);
        }),
    );
    const { result, unmount } = await renderHook(() => usePlayMedia());
    let playing: Promise<void> = Promise.resolve();
    await act(async () => {
      playing = result.current({ itemId: item.Id!, offline: false }, { item });
    });
    await unmount();
    await act(async () => {
      settle();
      await playing;
    });
    return mockPresentFromRequest.mock.results[0].value as Promise<boolean>;
  };

  // A tuner takes seconds to open a channel. A viewer who went back meanwhile
  // got the player over the screen they went to, seconds later.
  test("a live play the viewer left before it opened is dropped", async () => {
    await expect(
      presentAfterLeaving({ Id: "channel-1", Type: "TvChannel" }),
    ).resolves.toBe(false);
    expect(mockPush).not.toHaveBeenCalled();
  });

  // The top shelf route replaces itself with Home before it plays.
  test("a video still opens after the screen that asked for it left", async () => {
    await expect(
      presentAfterLeaving({ Id: "episode-1", Type: "Episode" }),
    ).resolves.toBe(true);
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

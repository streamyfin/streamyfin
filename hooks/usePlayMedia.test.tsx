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
let mockExternalPlayerSupported = true;
let mockExternalPlayerMode = "off";
const mockPlayExternally = jest.fn();
const mockGetUserItemData = jest.fn();

jest.mock("@/hooks/useExternalPlayer", () => ({
  useExternalPlayer: () => mockPlayExternally,
}));
jest.mock("@/utils/atoms/api", () => {
  const { atom } = jest.requireActual("jotai");
  return { apiAtom: atom({}), userAtom: atom({ Id: "user-1" }) };
});
jest.mock("@/utils/jellyfin/user-library/getUserItemData", () => ({
  getUserItemData: (...args: unknown[]) => mockGetUserItemData(...args),
}));

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
  get isExternalPlayerSupported() {
    return mockExternalPlayerSupported;
  },
  isNativeChromeActive: () => mockNativeChromeActive,
  useSettings: () => ({
    settings: { externalPlayerMode: mockExternalPlayerMode },
  }),
}));
jest.mock("@/utils/stillWatching", () => ({
  resetStillWatchingSession: () => mockResetStillWatchingSession(),
}));
jest.mock("@/utils/log", () => ({ writeErrorLog: jest.fn() }));
jest.mock(
  "react-native-mmkv",
  () => jest.requireActual("@/test-utils/mmkv").mmkvModule,
);
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const play = async (
  item: BaseItemDto,
  offline = false,
  options?: { chooseApp?: boolean; externalPlayer?: boolean },
) => {
  const { result } = await renderHook(() => usePlayMedia());
  await act(async () => {
    await result.current({ itemId: item.Id!, offline }, { item, ...options });
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
    mockExternalPlayerSupported = true;
    mockExternalPlayerMode = "off";
    mockPlayExternally.mockReset().mockResolvedValue(true);
    mockGetUserItemData.mockReset();
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

  describe("external player", () => {
    const movie: BaseItemDto = { Id: "movie-1", Type: "Movie" };

    test("plays every tap in the other app, downloaded or streamed", async () => {
      mockExternalPlayerMode = "external";
      mockNativeChromeActive = true;

      await play(movie, true);
      await play(movie, false);

      expect(mockPlayExternally).toHaveBeenNthCalledWith(
        1,
        { itemId: "movie-1", offline: true },
        movie,
        expect.not.objectContaining({ chooseApp: true }),
      );
      expect(mockPlayExternally).toHaveBeenNthCalledWith(
        2,
        { itemId: "movie-1", offline: false },
        movie,
        expect.anything(),
      );
      expect(mockPresentFromRequest).not.toHaveBeenCalled();
      expect(mockPush).not.toHaveBeenCalled();
      expect(mockGetUserItemData).not.toHaveBeenCalled();
    });

    describe("a request with only an id", () => {
      // A top shelf or Android TV home screen tile whose item lookup timed out.
      const playId = async () => {
        const { result } = await renderHook(() => usePlayMedia());
        await act(async () => {
          await result.current(
            { itemId: "movie-1", offline: false },
            { item: null },
          );
        });
      };

      // The other app got no title and started a half watched movie at 0.
      test("fetches the item, so the other app gets its title and position", async () => {
        mockExternalPlayerMode = "external";
        const fetched: BaseItemDto = {
          Id: "movie-1",
          Type: "Movie",
          Name: "Movie",
          UserData: { PlaybackPositionTicks: 600_000_000 },
        };
        mockGetUserItemData.mockResolvedValue(fetched);

        await playId();

        expect(mockGetUserItemData).toHaveBeenCalledWith(
          expect.objectContaining({ itemId: "movie-1", userId: "user-1" }),
        );
        expect(mockPlayExternally).toHaveBeenCalledWith(
          { itemId: "movie-1", offline: false },
          fetched,
          expect.anything(),
        );
        expect(mockPush).not.toHaveBeenCalled();
      });

      // Live TV goes to the JS route, which owns the live stream's lifecycle.
      test("plays Live TV on the JS route once the fetch shows it", async () => {
        mockExternalPlayerMode = "external";
        mockNativeChromeActive = true;
        mockGetUserItemData.mockResolvedValue({
          Id: "movie-1",
          Type: "TvChannel",
        });

        await playId();

        expect(mockPlayExternally).not.toHaveBeenCalled();
        expect(mockPresentFromRequest).not.toHaveBeenCalled();
        expect(mockPush).toHaveBeenCalled();
      });

      test("says so, and plays nowhere, when the fetch fails", async () => {
        mockExternalPlayerMode = "external";
        mockNativeChromeActive = true;
        mockGetUserItemData.mockRejectedValue(new Error("timeout"));

        await playId();

        expect(alert).toHaveBeenCalledWith(
          "player.error",
          "player.an_error_occurred_while_playing_the_video",
        );
        expect(mockPlayExternally).not.toHaveBeenCalled();
        expect(mockPresentFromRequest).not.toHaveBeenCalled();
        expect(mockPush).not.toHaveBeenCalled();
      });

      test("fetches nothing when it plays in the app anyway", async () => {
        await playId();

        expect(mockGetUserItemData).not.toHaveBeenCalled();
        expect(mockPush).toHaveBeenCalled();
      });
    });

    // Asking is the play button's sheet; a play without a pick stays in the app.
    test("plays in the app when the ask mode gets no pick", async () => {
      mockExternalPlayerMode = "ask";

      await play(movie);

      expect(mockPlayExternally).not.toHaveBeenCalled();
      expect(mockPush).toHaveBeenCalled();
    });

    test("plays in the other app when the user picked it", async () => {
      mockExternalPlayerMode = "ask";

      await play(movie, false, { externalPlayer: true, chooseApp: true });

      expect(mockPlayExternally).toHaveBeenCalledWith(
        { itemId: "movie-1", offline: false },
        movie,
        expect.objectContaining({ chooseApp: true }),
      );
      expect(mockPush).not.toHaveBeenCalled();
    });

    test("plays in the app when the user picked this device", async () => {
      mockExternalPlayerMode = "external";

      await play(movie, false, { externalPlayer: false });

      expect(mockPlayExternally).not.toHaveBeenCalled();
      expect(mockPush).toHaveBeenCalled();
    });

    test("plays in the app, and says so, when no other app could be opened", async () => {
      mockExternalPlayerMode = "external";
      mockPlayExternally.mockResolvedValue(false);

      await play(movie);

      expect(alert).toHaveBeenCalledWith(
        "player.error",
        "home.settings.external_player.open_failed",
      );
      expect(mockPush).toHaveBeenCalled();
    });

    // The plugin can push the setting to a platform that has no handoff.
    test("ignores the setting where media cannot be handed to another app", async () => {
      mockExternalPlayerSupported = false;
      mockExternalPlayerMode = "external";

      await play(movie);

      expect(mockPlayExternally).not.toHaveBeenCalled();
      expect(mockPush).toHaveBeenCalled();
    });

    test("leaves a SyncPlay group's playback to the group", async () => {
      mockExternalPlayerMode = "external";
      mockSyncPlayEnabled = true;

      await play(movie);

      expect(mockPlayExternally).not.toHaveBeenCalled();
      expect(mockSyncPlayItems).toHaveBeenCalled();
    });
  });
});

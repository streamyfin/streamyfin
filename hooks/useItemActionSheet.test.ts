import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { renderHook } from "@testing-library/react-native";
import { useItemActionSheet } from "./useItemActionSheet";

type SheetOptions = {
  options: string[];
  cancelButtonIndex: number;
  destructiveButtonIndex?: number;
};
type SheetCallback = (index?: number) => Promise<void> | void;

const mockShowActionSheet = jest.fn<void, [SheetOptions, SheetCallback]>();
const mockMarkAsPlayed = jest.fn(async (_played: boolean) => {});
const mockToggleFavorite = jest.fn();
const mockToggleWatchlist = jest.fn();
const mockDeleteFile = jest.fn();
const mockState = { useKefinTweaks: false, isOffline: false };

jest.mock("@expo/react-native-action-sheet", () => ({
  useActionSheet: () => ({ showActionSheetWithOptions: mockShowActionSheet }),
}));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock("@/hooks/useMarkAsPlayed", () => ({
  useMarkAsPlayed: () => mockMarkAsPlayed,
}));
jest.mock("@/hooks/useFavorite", () => ({
  useFavorite: () => ({
    isFavorite: false,
    toggleFavorite: mockToggleFavorite,
  }),
}));
jest.mock("@/hooks/useWatchlist", () => ({
  useWatchlist: () => ({
    isWatchlisted: false,
    toggleWatchlist: mockToggleWatchlist,
  }),
}));
jest.mock("@/utils/atoms/settings", () => ({
  useSettings: () => ({
    settings: { useKefinTweaks: mockState.useKefinTweaks },
  }),
}));
jest.mock("@/providers/OfflineModeProvider", () => ({
  useOfflineMode: () => mockState.isOffline,
}));
jest.mock("@/providers/DownloadProvider", () => ({
  useDownload: () => ({ deleteFile: mockDeleteFile }),
}));

const movie = { Id: "movie-1", Type: "Movie" } as BaseItemDto;

/** Presents the sheet and returns what it was shown with plus its callback. */
const present = async (item: BaseItemDto = movie) => {
  const { result } = await renderHook(() => useItemActionSheet(item));
  const closed = result.current();
  const [sheet, onSelect] = mockShowActionSheet.mock.calls[0];
  return { sheet, onSelect, closed };
};

beforeEach(() => {
  jest.clearAllMocks();
  mockState.useKefinTweaks = false;
  mockState.isOffline = false;
});

test("leaves the watchlist entry out while KefinTweaks is off", async () => {
  const { sheet } = await present();
  expect(sheet.options).not.toContain("watchlists.add_to_watchlist");
  expect(sheet.destructiveButtonIndex).toBeUndefined();
});

test("toggles the watchlist from its own entry when KefinTweaks is on", async () => {
  mockState.useKefinTweaks = true;
  const { sheet, onSelect, closed } = await present();

  const index = sheet.options.indexOf("watchlists.add_to_watchlist");
  expect(index).toBe(3);
  await onSelect(index);
  await closed;

  expect(mockToggleWatchlist).toHaveBeenCalledTimes(1);
  expect(mockDeleteFile).not.toHaveBeenCalled();
});

// With index-based handling the watchlist entry would have shifted the offline
// delete to an index whose handler toggled the watchlist instead.
test("keeps offline delete last and destructive after the watchlist entry", async () => {
  mockState.useKefinTweaks = true;
  mockState.isOffline = true;
  const { sheet, onSelect } = await present();

  expect(sheet.options).toEqual([
    "common.mark_as_played",
    "common.mark_as_not_played",
    "music.track_options.add_to_favorites",
    "watchlists.add_to_watchlist",
    "home.downloads.delete_download",
    "common.cancel",
  ]);
  expect(sheet.destructiveButtonIndex).toBe(4);
  expect(sheet.cancelButtonIndex).toBe(5);

  await onSelect(4);
  expect(mockDeleteFile).toHaveBeenCalledWith("movie-1");
  expect(mockToggleWatchlist).not.toHaveBeenCalled();
});

test("resolves without acting when the sheet is cancelled", async () => {
  const { sheet, onSelect, closed } = await present();
  await onSelect(sheet.cancelButtonIndex);
  await onSelect(undefined);
  await expect(closed).resolves.toBeUndefined();

  expect(mockMarkAsPlayed).not.toHaveBeenCalled();
  expect(mockToggleFavorite).not.toHaveBeenCalled();
});

test("presents nothing for an unsupported item type", async () => {
  const { result } = await renderHook(() =>
    useItemActionSheet({ Id: "a", Type: "MusicAlbum" } as BaseItemDto),
  );
  await expect(result.current()).resolves.toBeUndefined();
  expect(mockShowActionSheet).not.toHaveBeenCalled();
});

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
const mockUseWatchlist = jest.fn((_item: unknown, _options?: unknown) => ({
  isWatchlisted: false,
  toggleWatchlist: mockToggleWatchlist,
}));
jest.mock("@/hooks/useWatchlist", () => ({
  useWatchlist: (item: unknown, options?: unknown) =>
    mockUseWatchlist(item, options),
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

// Toggling the watchlist needs the server, so offline it is left out; the
// delete entry still has to land last and destructive with it gone.
test("leaves the watchlist entry out offline and keeps delete destructive", async () => {
  mockState.useKefinTweaks = true;
  mockState.isOffline = true;
  const { sheet, onSelect } = await present();

  expect(sheet.options).toEqual([
    "common.mark_as_played",
    "common.mark_as_not_played",
    "music.track_options.add_to_favorites",
    "home.downloads.delete_download",
    "common.cancel",
  ]);
  expect(sheet.destructiveButtonIndex).toBe(3);
  expect(sheet.cancelButtonIndex).toBe(4);

  await onSelect(3);
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

// The host unmounts the sheet once the returned promise settles; an action that
// threw used to leave it pending, and the host mounted for good.
test("reports the sheet closed even when the chosen action fails", async () => {
  mockToggleFavorite.mockImplementationOnce(() => {
    throw new Error("server said no");
  });
  const { sheet, onSelect, closed } = await present();

  // The failure itself still surfaces; only the close is under test.
  await Promise.resolve(
    onSelect(sheet.options.indexOf("music.track_options.add_to_favorites")),
  ).catch(() => {});

  await expect(closed).resolves.toBeUndefined();
});

// Every card mounts this sheet's hooks. With KefinTweaks off the watchlist
// toggle must stay passive, or each card writes shared state on mount.
test.each([
  ["KefinTweaks is off", { useKefinTweaks: false, isOffline: false }],
  ["offline", { useKefinTweaks: true, isOffline: true }],
])("keeps the watchlist toggle passive while %s", async (_label, state) => {
  Object.assign(mockState, state);
  await present();
  expect(mockUseWatchlist).toHaveBeenCalledWith(movie, { enabled: false });
});

test("enables the watchlist toggle when KefinTweaks is on and online", async () => {
  mockState.useKefinTweaks = true;
  await present();
  expect(mockUseWatchlist).toHaveBeenCalledWith(movie, { enabled: true });
});

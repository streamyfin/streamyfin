import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react-native";
import { createStore, Provider as JotaiProvider } from "jotai";
import type { DownloadedItem } from "@/providers/Downloads/types";
import { userAtom } from "@/providers/JellyfinProvider";
import { SeasonPicker, seasonIndexAtom } from "./SeasonPicker";

let mockDownloads: DownloadedItem[] = [];
let mockRefreshKey = 0;
let mockOffline = true;
let mockTrackIcon = false;
let mockIconMounts = 0;
let mockLiveIcons = 0;
/** Episode rows and loaders mounted, to tell a list kept from one rebuilt. */
const mockRowMounts: string[] = [];
let mockLoaderMounts = 0;
/** What the show API answers online: a season, and episodes held until released. */
const mockShowApi = {
  getSeasons: jest.fn(),
  getEpisodes: jest.fn(),
};

jest.mock("@jellyfin/sdk/lib/utils/api", () => ({
  getShowApi: () => mockShowApi,
}));

jest.mock("@/providers/DownloadProvider", () => ({
  useDownload: () => ({
    refreshKey: mockRefreshKey,
    getDownloadedItems: () => mockDownloads,
  }),
}));
jest.mock("@/providers/JellyfinProvider", () => {
  const { atom } = jest.requireActual("jotai");
  // The cards are built from the api's base path; nothing is requested.
  return {
    apiAtom: atom({ basePath: "http://server", accessToken: "token" }),
    userAtom: atom(null),
  };
});
jest.mock("@/providers/OfflineModeProvider", () => ({
  useOfflineMode: () => mockOffline,
}));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
// The rows and their menus are not what is under test; an episode shows up
// as its name.
jest.mock("../cards/useItemCardBehavior", () => ({
  useItemCardBehavior: ({ cards }: { cards: unknown[] }) => ({
    cards,
    handlePress: () => {},
    handleLongPress: undefined,
    actionSheet: null,
  }),
}));
jest.mock("../cards/CardListRow", () => ({
  CardListRow: ({ card }: { card: { title?: string } }) => {
    const { Text: RowText } = jest.requireActual("react-native");
    const { useEffect } = jest.requireActual("react");
    useEffect(() => {
      mockRowMounts.push(card.title ?? "");
    }, []);
    return <RowText>{card.title}</RowText>;
  },
}));
jest.mock("../Loader", () => ({
  Loader: () => {
    const { useEffect } = jest.requireActual("react");
    useEffect(() => {
      mockLoaderMounts++;
    }, []);
    return null;
  },
}));
jest.mock("../DownloadItem", () => ({
  DownloadItems: ({
    items,
    DownloadedIconComponent,
    MissingDownloadIconComponent,
  }: {
    items: BaseItemDto[];
    DownloadedIconComponent: React.ComponentType;
    MissingDownloadIconComponent: React.ComponentType;
  }) => {
    if (!mockTrackIcon) return null;
    const allDownloaded =
      items.length > 0 &&
      items.every((item) =>
        mockDownloads.some((download) => download.item.Id === item.Id),
      );
    return allDownloaded ? (
      <DownloadedIconComponent />
    ) : (
      <MissingDownloadIconComponent />
    );
  },
  DownloadSingleItem: () => null,
}));
jest.mock("@/components/common/HeaderIcon", () => ({
  HeaderIcon: ({ name }: { name: string }) => {
    const { useEffect } = jest.requireActual("react");
    useEffect(() => {
      if (name !== "downloaded") return;
      mockIconMounts++;
      mockLiveIcons++;
      return () => {
        mockLiveIcons--;
      };
    }, []);
    return null;
  },
}));
jest.mock("../PlayedStatus", () => ({ PlayedStatus: () => null }));
jest.mock("@/components/syncplay/SyncPlayQueueButton", () => ({
  SyncPlayQueueButton: () => null,
}));
jest.mock("../PlatformDropdown", () => ({
  PlatformDropdown: ({ trigger }: { trigger: React.ReactNode }) => trigger,
}));

const SERIES: BaseItemDto = { Id: "series-1", Type: "Series", Name: "Show" };

const episode = (season: number, name: string): DownloadedItem =>
  ({
    item: {
      Id: `episode-${season}-${name}`,
      Type: "Episode",
      Name: name,
      SeriesId: SERIES.Id,
      ParentIndexNumber: season,
      IndexNumber: 1,
      SeasonName: `Season ${season}`,
    },
  }) as DownloadedItem;

const renderPicker = async (store: ReturnType<typeof createStore>) => {
  // No garbage collection timer nor retry: either keeps Jest from exiting.
  const client = new QueryClient({
    defaultOptions: {
      queries: { gcTime: Number.POSITIVE_INFINITY, retry: false },
    },
  });
  const tree = () => (
    <QueryClientProvider client={client}>
      <JotaiProvider store={store}>
        <SeasonPicker item={SERIES} />
      </JotaiProvider>
    </QueryClientProvider>
  );
  return { tree, view: await render(tree()) };
};

describe("SeasonPicker offline", () => {
  // #2153: with one episode downloaded in season 1 and one in season 2,
  // deleting the season 1 episode left the page on season 1, which no longer
  // had anything to list, until the other season was picked by hand.
  test("moves to the next season when the last episode of the open one is deleted", async () => {
    mockDownloads = [episode(1, "Pilot"), episode(2, "Return")];
    const store = createStore();
    store.set(seasonIndexAtom, { [SERIES.Id!]: 1 });

    const { tree, view } = await renderPicker(store);
    await waitFor(() => expect(screen.getByText("Pilot")).toBeTruthy());

    mockDownloads = [episode(2, "Return")];
    mockRefreshKey++;
    await view.rerender(tree());

    await waitFor(() => expect(screen.getByText("Return")).toBeTruthy());
    expect(screen.queryByText("Pilot")).toBeNull();
    expect(store.get(seasonIndexAtom)[SERIES.Id!]).toBe(2);
  });

  // A delete and a finished download in one refresh leave the count the same.
  // Keyed on the count, the page kept the deleted episode and missed the new.
  test("shows a swapped episode when the download count stays the same", async () => {
    mockDownloads = [episode(1, "Pilot")];
    const store = createStore();
    store.set(seasonIndexAtom, { [SERIES.Id!]: 1 });

    const { tree, view } = await renderPicker(store);
    await waitFor(() => expect(screen.getByText("Pilot")).toBeTruthy());

    mockDownloads = [episode(1, "Second")];
    mockRefreshKey++;
    await view.rerender(tree());

    await waitFor(() => expect(screen.getByText("Second")).toBeTruthy());
    expect(screen.queryByText("Pilot")).toBeNull();
  });

  // Offline, every download refresh moves the keys, and closing the player
  // after an episode is one: the list went blank, the loader showed and the
  // rows mounted again, for a refresh that changed nothing on this series.
  test("keeps the episodes on screen through a download refresh", async () => {
    mockDownloads = [episode(1, "Pilot")];
    const store = createStore();
    store.set(seasonIndexAtom, { [SERIES.Id!]: 1 });

    const { tree, view } = await renderPicker(store);
    await waitFor(() => expect(screen.getByText("Pilot")).toBeTruthy());
    mockRowMounts.length = 0;
    mockLoaderMounts = 0;

    mockRefreshKey++;
    await view.rerender(tree());

    await waitFor(() => expect(screen.getByText("Pilot")).toBeTruthy());
    expect(mockLoaderMounts).toBe(0);
    expect(mockRowMounts).toEqual([]);
  });
});

describe("SeasonPicker online", () => {
  beforeEach(() => {
    mockTrackIcon = false;
    mockIconMounts = 0;
    mockLiveIcons = 0;
    mockOffline = false;
    mockShowApi.getSeasons.mockResolvedValue({
      data: { Items: [{ Id: "season-1", IndexNumber: 1, Name: "Season 1" }] },
    });
  });
  afterEach(() => {
    mockOffline = true;
  });

  // The season said it had no episodes while they were still on their way,
  // under the spinner, on a slow server.
  test("says nothing about an empty season while its episodes load", async () => {
    let release = () => {};
    mockShowApi.getEpisodes.mockReturnValue(
      new Promise((resolve) => {
        release = () => resolve({ data: { Items: [], TotalRecordCount: 0 } });
      }),
    );
    const store = createStore();
    store.set(userAtom, { Id: "user" });
    store.set(seasonIndexAtom, { [SERIES.Id!]: 1 });

    await renderPicker(store);
    await waitFor(() => expect(mockShowApi.getEpisodes).toHaveBeenCalled());
    expect(
      screen.queryByText("item_card.no_episodes_for_this_season"),
    ).toBeNull();

    release();
    await waitFor(() =>
      expect(
        screen.getByText("item_card.no_episodes_for_this_season"),
      ).toBeTruthy(),
    );
  });

  // Before the seasons arrive no season is picked, so the episodes are not
  // even asked for yet: that wait is no empty season either (seen on an
  // Android TV, 2026-11-03, after the episodes wait was covered).
  test("says nothing about an empty season while the seasons load", async () => {
    let release = () => {};
    mockShowApi.getSeasons.mockReturnValue(
      new Promise((resolve) => {
        release = () =>
          resolve({
            data: {
              Items: [{ Id: "season-1", IndexNumber: 1, Name: "Season 1" }],
            },
          });
      }),
    );
    mockShowApi.getEpisodes.mockResolvedValue({
      data: { Items: [], TotalRecordCount: 0 },
    });
    const store = createStore();
    store.set(userAtom, { Id: "user" });
    store.set(seasonIndexAtom, { [SERIES.Id!]: 1 });

    await renderPicker(store);
    await waitFor(() => expect(mockShowApi.getSeasons).toHaveBeenCalled());
    expect(
      screen.queryByText("item_card.no_episodes_for_this_season"),
    ).toBeNull();

    release();
    await waitFor(() =>
      expect(
        screen.getByText("item_card.no_episodes_for_this_season"),
      ).toBeTruthy(),
    );
  });

  // The episodes are only asked for once a season is picked: with no season
  // to pick, or seasons that failed, the spinner stayed for good with the
  // empty text under it.
  test("a series with no seasons says so, without a spinner", async () => {
    mockShowApi.getSeasons.mockResolvedValue({ data: { Items: [] } });
    const store = createStore();
    store.set(userAtom, { Id: "user" });

    await renderPicker(store);
    await waitFor(() =>
      expect(
        screen.getByText("item_card.no_episodes_for_this_season"),
      ).toBeTruthy(),
    );
    expect(screen.queryByTestId("season-episodes-loading")).toBeNull();
  });

  test("seasons that failed to load say so, without a spinner", async () => {
    mockShowApi.getSeasons.mockRejectedValue(new Error("503"));
    const store = createStore();
    store.set(userAtom, { Id: "user" });

    await renderPicker(store);
    await waitFor(() =>
      expect(screen.getByText("item_card.episodes_load_failed")).toBeTruthy(),
    );
    expect(screen.queryByTestId("season-episodes-loading")).toBeNull();
    expect(
      screen.queryByText("item_card.no_episodes_for_this_season"),
    ).toBeNull();
  });

  // Online, each episode that finished downloading changed the queries' keys:
  // the list went blank and was fetched again, once per episode, so a series
  // download flashed the page (seen on Android, 2026-11-05).
  test("keeps the episodes on screen as downloads finish", async () => {
    mockDownloads = [];
    mockShowApi.getEpisodes.mockResolvedValue({
      data: {
        Items: [{ Id: "episode-1", Name: "Pilot", ParentIndexNumber: 1 }],
        TotalRecordCount: 1,
      },
    });
    const store = createStore();
    store.set(userAtom, { Id: "user" });
    store.set(seasonIndexAtom, { [SERIES.Id!]: 1 });

    const { tree, view } = await renderPicker(store);
    await waitFor(() => expect(screen.getByText("Pilot")).toBeTruthy());
    mockShowApi.getSeasons.mockClear();
    mockShowApi.getEpisodes.mockClear();

    mockDownloads = [episode(1, "Pilot")];
    mockRefreshKey++;
    await view.rerender(tree());

    expect(screen.getByText("Pilot")).toBeTruthy();
    expect(mockShowApi.getSeasons).not.toHaveBeenCalled();
    expect(mockShowApi.getEpisodes).not.toHaveBeenCalled();
  });

  test("keeps the season download icon mounted as downloads finish", async () => {
    mockDownloads = [episode(1, "Pilot")];
    mockTrackIcon = true;
    mockShowApi.getEpisodes.mockResolvedValue({
      data: {
        Items: [mockDownloads[0].item],
        TotalRecordCount: 1,
      },
    });
    const store = createStore();
    store.set(userAtom, { Id: "user" });
    store.set(seasonIndexAtom, { [SERIES.Id!]: 1 });

    const { tree, view } = await renderPicker(store);
    await waitFor(() => expect(screen.getByText("Pilot")).toBeTruthy());
    const mountsBeforeDownload = mockIconMounts;
    expect(mockLiveIcons).toBe(1);

    mockDownloads = [episode(1, "Pilot"), episode(2, "Return")];
    mockRefreshKey++;
    await view.rerender(tree());

    expect(mockIconMounts).toBe(mountsBeforeDownload);
    expect(mockLiveIcons).toBe(1);
  });

  test("episodes that failed to load say so, not an empty season", async () => {
    mockShowApi.getEpisodes.mockRejectedValue(new Error("503"));
    const store = createStore();
    store.set(userAtom, { Id: "user" });
    store.set(seasonIndexAtom, { [SERIES.Id!]: 1 });

    await renderPicker(store);
    await waitFor(() =>
      expect(screen.getByText("item_card.episodes_load_failed")).toBeTruthy(),
    );
    expect(
      screen.queryByText("item_card.no_episodes_for_this_season"),
    ).toBeNull();
  });
});

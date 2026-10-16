import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react-native";
import { createStore, Provider as JotaiProvider } from "jotai";
import type { DownloadedItem } from "@/providers/Downloads/types";
import { SeasonPicker, seasonIndexAtom } from "./SeasonPicker";

let mockDownloads: DownloadedItem[] = [];

jest.mock("@/providers/DownloadProvider", () => ({
  useDownload: () => ({
    downloadedItems: mockDownloads,
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
  useOfflineMode: () => true,
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
    return <RowText>{card.title}</RowText>;
  },
}));
jest.mock("../DownloadItem", () => ({
  DownloadItems: () => null,
  DownloadSingleItem: () => null,
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
    await view.rerender(tree());

    await waitFor(() => expect(screen.getByText("Return")).toBeTruthy());
    expect(screen.queryByText("Pilot")).toBeNull();
    expect(store.get(seasonIndexAtom)[SERIES.Id!]).toBe(2);
  });
});

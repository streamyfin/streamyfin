import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import {
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { render, waitFor } from "@testing-library/react-native";
import { SeasonEpisodesCarousel } from "./SeasonEpisodesCarousel";

const mockGetEpisodes = jest.fn();
let mockRowItems: BaseItemDto[] | undefined;

jest.mock("@jellyfin/sdk/lib/utils/api", () => ({
  getTvShowsApi: () => ({ getEpisodes: mockGetEpisodes }),
}));
jest.mock("@/providers/JellyfinProvider", () => {
  const { atom } = jest.requireActual("jotai");
  return {
    apiAtom: atom({ basePath: "http://server" }),
    userAtom: atom({ Id: "user-1" }),
  };
});
jest.mock("@/providers/DownloadProvider", () => ({
  useDownload: () => ({ getDownloadedItems: () => [] }),
}));
jest.mock("@/providers/OfflineModeProvider", () => ({
  useOfflineMode: () => false,
}));
jest.mock("@/hooks/useAppRouter", () => () => ({ setParams: jest.fn() }));
jest.mock("@/hooks/useEpisodeAirLabels", () => ({
  useEpisodeAirLabels: () => ({ availabilityLabel: () => null }),
}));
// The row is not what is under test: it only records what it was handed.
jest.mock("@/components/cards/CardRow", () => ({
  CardRow: ({ items }: { items: BaseItemDto[] }) => {
    mockRowItems = items;
    return null;
  },
}));
jest.mock("@/components/cards/CardPill", () => ({ CardPill: () => null }));

const EPISODE: BaseItemDto = {
  Id: "episode-1",
  Type: "Episode",
  SeriesId: "series-1",
  SeasonId: "season-1",
};

const renderCarousel = async () => {
  const onError = jest.fn();
  // No garbage collection timer nor retry: either keeps Jest from exiting.
  const client = new QueryClient({
    queryCache: new QueryCache({ onError }),
    defaultOptions: {
      queries: { gcTime: Number.POSITIVE_INFINITY, retry: false },
    },
  });
  await render(
    <QueryClientProvider client={client}>
      <SeasonEpisodesCarousel item={EPISODE} />
    </QueryClientProvider>,
  );
  await waitFor(() => expect(mockGetEpisodes).toHaveBeenCalled());
  await waitFor(() => expect(client.isFetching()).toBe(0));
  return { onError };
};

describe("SeasonEpisodesCarousel", () => {
  beforeEach(() => {
    mockGetEpisodes.mockReset();
    mockRowItems = undefined;
  });

  it("shows the season's episodes", async () => {
    mockGetEpisodes.mockResolvedValue({ data: { Items: [EPISODE] } });

    const { onError } = await renderCarousel();

    expect(onError).not.toHaveBeenCalled();
    expect(mockRowItems).toEqual([EPISODE]);
  });

  // REACT-NATIVE-1N: an answer without an Items list made the query resolve
  // with undefined, which React Query rejects as
  // `["episodes","<season>",false] data is undefined`.
  it("shows no episodes, without an error, when the answer has no list", async () => {
    mockGetEpisodes.mockResolvedValue({ data: {} });

    const { onError } = await renderCarousel();

    expect(onError).not.toHaveBeenCalled();
    expect(mockRowItems).toEqual([]);
  });
});

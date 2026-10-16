import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import type React from "react";
import {
  type DownloadingItem,
  type MediaRequest,
  MediaRequestStatus,
  MediaStatus,
  MediaType,
} from "@/utils/seerr/types";
import { useSeerrRequestCard } from "./useSeerrRequestCard";

const mockGetRequest = jest.fn();

jest.mock("@/hooks/useSeerr", () => ({
  useSeerr: () => ({
    seerrApi: {
      getRequest: mockGetRequest,
      imageProxy: () => "",
      axios: { defaults: { baseURL: "" } },
    },
    seerrUser: { id: 1, permissions: 0 },
    getTitle: () => "",
    getYear: () => "",
  }),
}));
jest.mock("@/hooks/useSeerrCanRequest", () => ({
  useSeerrCanRequest: () => [false],
}));
jest.mock("@/hooks/useSeerrDiscoverData", () => ({
  useSeerrTitleDetails: () => ({ data: undefined }),
}));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const download = { size: 100, sizeLeft: 50 } as DownloadingItem;

// A request as the recent requests list brings it, with or without a
// download running.
const listed = (
  downloads: DownloadingItem[],
  status = MediaStatus.PROCESSING,
) =>
  ({
    id: 42,
    type: MediaType.MOVIE,
    is4k: false,
    status: MediaRequestStatus.APPROVED,
    media: {
      mediaType: MediaType.MOVIE,
      tmdbId: 603,
      status,
      downloadStatus: downloads,
    },
  }) as unknown as MediaRequest;

const newClient = () =>
  // No garbage collection timer nor retry: either keeps Jest from exiting.
  new QueryClient({
    defaultOptions: {
      queries: { gcTime: Number.POSITIVE_INFINITY, retry: false },
    },
  });

const renderCard = (request: MediaRequest, client = newClient()) => {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(() => useSeerrRequestCard(request), { wrapper });
};

beforeEach(() => mockGetRequest.mockReset());

// The recent requests are asked again on each visit: a card asks Seerr for
// its request again only to follow a download, which the list does not.
describe("useSeerrRequestCard", () => {
  test("asks Seerr nothing for a request without a download", async () => {
    await renderCard(listed([]));
    await act(async () => {});
    expect(mockGetRequest).not.toHaveBeenCalled();
  });

  test("follows a running download with Seerr's answer", async () => {
    const answer = listed([], MediaStatus.AVAILABLE);
    mockGetRequest.mockResolvedValue(answer);
    const { result } = await renderCard(listed([download]));
    await waitFor(() => expect(result.current.current).toBe(answer));
    expect(mockGetRequest).toHaveBeenCalledWith(42);
  });

  // The cache is kept on the device for a day, and a query switched off still
  // answers from it: a download followed yesterday is no badge for today.
  test("shows the list's request over an old answer left in the cache", async () => {
    const client = newClient();
    client.setQueryData(
      ["seerr", "requests", MediaType.MOVIE, 42],
      listed([download]),
    );
    const request = listed([], MediaStatus.AVAILABLE);
    const { result } = await renderCard(request, client);
    expect(result.current.current).toBe(request);
  });
});

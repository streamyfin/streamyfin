import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import {
  dehydrate,
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { act, render, waitFor } from "@testing-library/react-native";
import { getDefaultStore } from "jotai";
import { apiAtom } from "@/providers/JellyfinProvider";
import type { makeApi } from "@/test-utils/jellyfinApi";
import {
  describeHttpError,
  describeHttpResponse,
  isEnvironmentError,
} from "@/utils/errors";
import { queryDehydrateOptions } from "@/utils/queryPersistence";
import { SeasonEpisodesCarousel } from "./SeasonEpisodesCarousel";

let mockRow: { items: BaseItemDto[]; loading?: boolean } | undefined;

// The SDK and axios are real, only the server is stubbed.
jest.mock("@/providers/JellyfinProvider", () => {
  const { atom } = jest.requireActual("jotai");
  const { makeApi: make } = jest.requireActual("@/test-utils/jellyfinApi");
  return { apiAtom: atom(make()), userAtom: atom({ Id: "user-1" }) };
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
  CardRow: ({
    items,
    loading,
  }: {
    items: BaseItemDto[];
    loading?: boolean;
  }) => {
    mockRow = { items, loading };
    return null;
  },
}));
jest.mock("@/components/cards/CardPill", () => ({ CardPill: () => null }));

const api = getDefaultStore().get(apiAtom) as ReturnType<typeof makeApi>;
const EPISODES_ROUTE = /\/Shows\/[^/]+\/Episodes/;

const EPISODE: BaseItemDto = {
  Id: "6d0f1c2b3a4e5f60718293a4b5c6d7e8",
  Type: "Episode",
  SeriesId: "a1b2c3d4e5f60718293a4b5c6d7e8f90",
  SeasonId: "0f9e8d7c6b5a49382716f5e4d3c2b1a0",
};
const SEASON = { Items: [EPISODE], TotalRecordCount: 1 };
const JSON_TYPE = { "content-type": "application/json; charset=utf-8" };

// What can answer the request with a 200 in place of Jellyfin, which always
// sends Items: a captive portal or a proxy's sign-in page (axios hands a page
// over as a string), an empty body, JSON of another shape, JSON null. Each
// with the shape the app's reporting gives it, and whether it is the user's
// network rather than something to report.
const NOT_A_LIST: [
  name: string,
  body: unknown,
  headers: Record<string, string>,
  bodyKind: string,
  environment: boolean,
][] = [
  [
    "a proxy's sign-in page",
    "<!DOCTYPE html><html><head><title>Sign in</title></head></html>",
    { "content-type": "text/html; charset=utf-8" },
    "html",
    true,
  ],
  ["an empty body", "", {}, "empty", false],
  ["JSON without Items", { TotalRecordCount: 0 }, JSON_TYPE, "json", false],
  ["JSON null", "null", JSON_TYPE, "empty", false],
];

/** Lets the fetch in flight settle, and the row draw what it left. */
const settle = async (client: QueryClient) => {
  await waitFor(() => expect(client.isFetching()).toBe(0));
  // React Query hands its state updates to a timer.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
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
  await waitFor(() => expect(api.mock.history.get).toHaveLength(1));
  await settle(client);
  return { client, onError };
};

describe("SeasonEpisodesCarousel", () => {
  beforeEach(() => {
    api.mock.reset();
    mockRow = undefined;
  });

  it("shows the season's episodes", async () => {
    api.mock.onGet(EPISODES_ROUTE).reply(200, SEASON, JSON_TYPE);

    const { onError } = await renderCarousel();

    expect(onError).not.toHaveBeenCalled();
    expect(mockRow).toEqual({ items: [EPISODE], loading: false });
  });

  // REACT-NATIVE-1N: such an answer resolved the query with undefined, which
  // React Query rejects as `["episodes","<season>",false] data is undefined`.
  it.each(NOT_A_LIST)(
    "shows no episodes when the first answer is %s",
    async (_name, body, headers) => {
      api.mock.onGet(EPISODES_ROUTE).reply(200, body, headers);

      const { onError } = await renderCarousel();

      // Not a skeleton that never ends either.
      expect(mockRow).toEqual({ items: [], loading: false });
      expect(onError).toHaveBeenCalledTimes(1);
    },
  );

  // The refetch a LibraryChanged message or a played state change sets off,
  // here from a screen in another tab. Resolving it with an empty list wiped
  // the episodes on screen and wrote the empty list to disk: #1007's symptom,
  // which #1031 fixed by keeping the last list while a refetch runs.
  it.each(NOT_A_LIST)(
    "keeps the episodes on screen when a refetch answers with %s",
    async (_name, body, headers, bodyKind, environment) => {
      api.mock
        .onGet(EPISODES_ROUTE)
        .replyOnce(200, SEASON, JSON_TYPE)
        .onGet(EPISODES_ROUTE)
        .replyOnce(200, body, headers);
      const { client, onError } = await renderCarousel();
      expect(mockRow?.items).toEqual([EPISODE]);

      await act(async () => {
        await client.invalidateQueries({ queryKey: ["episodes"] });
      });
      await settle(client);

      expect(api.mock.history.get).toHaveLength(2);
      expect(mockRow).toEqual({ items: [EPISODE], loading: false });
      // What the app writes to disk: never an empty list for the episodes.
      const written = dehydrate(client, queryDehydrateOptions).queries;
      expect(written.map((query) => query.state.data)).not.toContainEqual([]);
      // The query fails with the answer itself, for the app's reporting to
      // describe by its route and body, or leave out as the user's network.
      expect(onError).toHaveBeenCalledTimes(1);
      const [error] = onError.mock.calls[0];
      expect(describeHttpError(error)).toEqual({
        method: "GET",
        path: "/Shows/:id/Episodes",
        status: 200,
      });
      expect(describeHttpResponse(error)?.bodyKind).toBe(bodyKind);
      expect(isEnvironmentError(error)).toBe(environment);
    },
  );
});

import type {
  BaseItemDto,
  BaseItemKind,
  UserDto,
} from "@jellyfin/sdk/lib/generated-client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react-native";
import { createStore, Provider as JotaiProvider } from "jotai";
import { SIMILAR_ITEMS_LIMIT } from "@/constants/Recommendations";
import type { makeApi } from "@/test-utils/jellyfinApi";
import { useSimilarItems } from "./useSimilarItems";

let mockUser: UserDto | null = null;

jest.mock("@/providers/JellyfinProvider", () => {
  const { atom } = jest.requireActual("jotai");
  const { makeApi: make } = jest.requireActual("@/test-utils/jellyfinApi");
  const mockApi = make();
  return { apiAtom: atom(mockApi), userAtom: atom(() => mockUser), mockApi };
});

const api: ReturnType<typeof makeApi> = jest.requireMock(
  "@/providers/JellyfinProvider",
).mockApi;

// The SDK writes the query into the URL it requests, so a stub matches on the
// path and a spec reads the query back from the URL.
const similarPath = (itemId: string) =>
  new RegExp(`/Items/${itemId}/Similar(\\?|$)`);

const similarQueries = () =>
  api.mock.history.get
    .map((request) => new URL(request.url ?? ""))
    .filter((url) => url.pathname.endsWith("/Similar"))
    .map((url) => Object.fromEntries(url.searchParams));

const serverAnswers = (itemId: string, body: unknown) =>
  api.mock.onGet(similarPath(itemId)).reply(200, body);

type Source = Pick<BaseItemDto, "Id" | "Type">;

const series: Source = { Id: "series-1", Type: "Series" };
const movie: Source = { Id: "movie-1", Type: "Movie" };

const renderSimilarItems = (item: Source | null | undefined) => {
  // No garbage collection timer nor retry: either keeps Jest from exiting.
  const client = new QueryClient({
    defaultOptions: {
      queries: { gcTime: Number.POSITIVE_INFINITY, retry: false },
    },
  });
  // A store per render: the user atom is read once per store.
  const store = createStore();
  return renderHook(() => useSimilarItems(item), {
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>
        <JotaiProvider store={store}>{children}</JotaiProvider>
      </QueryClientProvider>
    ),
  });
};

beforeEach(() => {
  mockUser = { Id: "user-1" };
  api.mock.reset();
});

describe("useSimilarItems", () => {
  test("asks for the item's similar items as the signed-in user, up to the shared limit", async () => {
    serverAnswers("series-1", { Items: [] });

    const { result } = await renderSimilarItems(series);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(similarQueries()).toEqual([
      { userId: "user-1", limit: String(SIMILAR_ITEMS_LIMIT) },
    ]);
  });

  // The row once kept movies only, whatever the page: a series had nothing
  // to show, although the server answers a series with series.
  test("gives a series the similar series the server answers with, in its order", async () => {
    const similar: BaseItemDto[] = [
      { Id: "series-3", Name: "Ozark", Type: "Series" },
      { Id: "series-2", Name: "Better Call Saul", Type: "Series" },
    ];
    serverAnswers("series-1", { Items: similar });

    const { result } = await renderSimilarItems(series);

    await waitFor(() => expect(result.current.data).toEqual(similar));
  });

  // A server older than Jellyfin 12 mixes trailers and live TV programmes into
  // a movie's list (EnableExternalContentInSuggestions, on by default).
  test("keeps a movie's list to movies", async () => {
    serverAnswers("movie-1", {
      Items: [
        { Id: "movie-2", Type: "Movie" },
        { Id: "trailer-1", Type: "Trailer" },
        { Id: "program-1", Type: "Program" },
        { Id: "movie-3", Type: "Movie" },
      ],
    });

    const { result } = await renderSimilarItems(movie);

    await waitFor(() =>
      expect(result.current.data?.map((item) => item.Id)).toEqual([
        "movie-2",
        "movie-3",
      ]),
    );
  });

  test("answers an empty list when the server sends no items", async () => {
    serverAnswers("movie-1", { TotalRecordCount: 0, StartIndex: 0 });

    const { result } = await renderSimilarItems(movie);

    await waitFor(() => expect(result.current.data).toEqual([]));
  });

  test("reports the failure when the server refuses", async () => {
    api.mock.onGet(similarPath("series-1")).reply(404);

    const { result } = await renderSimilarItems(series);

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });

  // The server has nothing for an episode, and what it has for a season or a
  // collection is not worth a row: none of them costs a request.
  test.each<BaseItemKind>(["Episode", "Season", "BoxSet", "Program"])(
    "asks nothing for a %s",
    async (type) => {
      const { result } = await renderSimilarItems({ Id: "item-1", Type: type });

      expect(result.current.fetchStatus).toBe("idle");
      expect(similarQueries()).toHaveLength(0);
    },
  );

  test.each<[string, Source | null | undefined, UserDto | null]>([
    ["no item", undefined, { Id: "user-1" }],
    ["an item that is still loading", null, { Id: "user-1" }],
    ["an item without an id", { Type: "Movie" }, { Id: "user-1" }],
    ["no signed-in user", series, null],
  ])("asks nothing with %s", async (_case, item, user) => {
    mockUser = user;

    const { result } = await renderSimilarItems(item);

    expect(result.current.fetchStatus).toBe("idle");
    expect(similarQueries()).toHaveLength(0);
  });
});

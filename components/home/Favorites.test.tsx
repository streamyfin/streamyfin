import type { Api } from "@jellyfin/sdk";
import type { UserDto } from "@jellyfin/sdk/lib/generated-client/models";
import {
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { act, render, waitFor } from "@testing-library/react-native";
import { createStore, Provider as JotaiProvider } from "jotai";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { Favorites as PhoneFavorites } from "./Favorites";
import { Favorites as TVFavorites } from "./Favorites.tv";

const mockGetItems = jest.fn();

jest.mock("@jellyfin/sdk/lib/utils/api", () => {
  const actual = jest.requireActual("@jellyfin/sdk/lib/utils/api");
  return {
    ...actual,
    // The real getItemsApi throws on a missing api, as it does in the app
    // once the session is gone: that throw is what this spec pins.
    getItemsApi: (api: unknown) =>
      api ? { getItems: mockGetItems } : actual.getItemsApi(api),
  };
});
jest.mock("@/providers/JellyfinProvider", () => {
  const { atom } = jest.requireActual("jotai");
  return { apiAtom: atom(null), userAtom: atom(null) };
});
jest.mock("i18next", () => ({ t: (key: string) => key }));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock("@/utils/atoms/settings", () => ({
  useSettings: () => ({ settings: {} }),
}));
jest.mock("@/hooks/useAppRouter", () => () => ({ push: jest.fn() }));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock("@/constants/TVTypography", () => ({
  useScaledTVTypography: () => ({ title: 32, heading: 24, body: 18 }),
}));
// The rows and the empty state are not what is under test, only the queries
// behind them.
jest.mock("@/components/cards/CardRow", () => ({ CardRow: () => null }));
jest.mock("@/components/common/ServerImage", () => ({ Image: () => null }));
// The TV row pulls in the whole focus and poster stack; it is cut down to the
// one thing it does with what Favorites hands it: run the query.
jest.mock("@/components/home/InfiniteScrollingCollectionList.tv", () => {
  const { useInfiniteQuery } = jest.requireActual("@tanstack/react-query");
  return {
    InfiniteScrollingCollectionList: ({
      queryFn,
      queryKey,
    }: {
      queryFn: (context: object) => Promise<unknown[]>;
      queryKey: unknown[];
    }) => {
      useInfiniteQuery({
        queryKey,
        queryFn: ({ pageParam = 0, ...context }: { pageParam?: number }) =>
          queryFn({ ...context, queryKey, pageParam }),
        getNextPageParam: () => undefined,
        initialPageParam: 0,
      });
      return null;
    },
  };
});

describe.each([
  ["phone", PhoneFavorites],
  ["TV", TVFavorites],
])("Favorites on %s", (_platform, Favorites) => {
  beforeEach(() => {
    mockGetItems.mockReset();
    mockGetItems.mockResolvedValue({ data: { Items: [] } });
  });

  // REACT-NATIVE-KX: signing out from the settings tab cleared the api and
  // the query cache while this tab stayed mounted. Its rows fetched again
  // with no api and threw "Cannot read property 'configuration' of null".
  it("asks nothing of the server once the session is signed out", async () => {
    const onError = jest.fn();
    // No garbage collection timer nor retry: either keeps Jest from exiting.
    const client = new QueryClient({
      queryCache: new QueryCache({ onError }),
      defaultOptions: {
        queries: { gcTime: Number.POSITIVE_INFINITY, retry: false },
      },
    });
    const store = createStore();
    store.set(apiAtom, { basePath: "http://server" } as Api);
    store.set(userAtom, { Id: "user-1" } as UserDto);

    await render(
      <QueryClientProvider client={client}>
        <JotaiProvider store={store}>
          <Favorites />
        </JotaiProvider>
      </QueryClientProvider>,
    );
    // One row per favorite type.
    await waitFor(() => expect(mockGetItems).toHaveBeenCalledTimes(6));
    await waitFor(() => expect(client.isFetching()).toBe(0));

    // What the sign-out in JellyfinProvider does (clearSessionState).
    await act(async () => {
      store.set(userAtom, null);
      store.set(apiAtom, null);
      client.clear();
    });
    await waitFor(() => expect(client.isFetching()).toBe(0));

    expect(onError).not.toHaveBeenCalled();
    expect(mockGetItems).toHaveBeenCalledTimes(6);
  });
});

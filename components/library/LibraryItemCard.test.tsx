import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import {
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react-native";
import { createStore, Provider as JotaiProvider } from "jotai";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { makeApi } from "@/test-utils/jellyfinApi";
import { LibraryItemCard } from "./LibraryItemCard";

jest.mock("@/providers/JellyfinProvider", () => {
  const { atom } = jest.requireActual("jotai");
  return {
    apiAtom: atom(null),
    userAtom: atom({ Id: "user-1" }),
  };
});
jest.mock("@/utils/atoms/settings", () => ({
  useSettings: () => ({
    settings: { libraryOptions: { display: "row", showStats: true } },
  }),
}));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
// The row layout these specs render draws no image.
jest.mock("@/components/common/ServerImage", () => ({ Image: () => null }));
// Navigation is not what is under test; the card shows up as its content.
jest.mock("../common/TouchableItemRouter", () => ({
  TouchableItemRouter: ({ children }: { children: React.ReactNode }) =>
    children,
}));

const LIBRARY: BaseItemDto = {
  Id: "library-1",
  Name: "Movies",
  CollectionType: "movies",
  ImageTags: { Primary: "tag" },
};

const countApi = () => {
  const api = makeApi();
  // The SDK writes the query into the url.
  api.mock.onGet(/\/Items\?/).reply(200, { Items: [], TotalRecordCount: 12 });
  return api;
};

const renderCard = async (api: ReturnType<typeof makeApi> | null = null) => {
  /** What the app's own query cache would have handed to Sentry. */
  const errors: Error[] = [];
  // No garbage collection timer nor retry: either keeps Jest from exiting.
  const client = new QueryClient({
    queryCache: new QueryCache({ onError: (error) => errors.push(error) }),
    defaultOptions: {
      queries: { gcTime: Number.POSITIVE_INFINITY, retry: false },
    },
  });
  const store = createStore();
  store.set(apiAtom, api);
  await render(
    <QueryClientProvider client={client}>
      <JotaiProvider store={store}>
        <LibraryItemCard library={LIBRARY} />
      </JotaiProvider>
    </QueryClientProvider>,
  );
  // Lets a query that started on mount settle.
  await act(async () => {});
  return { store, client, errors };
};

describe("LibraryItemCard", () => {
  // Sentry REACT-NATIVE-D7: the session was torn down, by a logout or an
  // expiry, while the cards were still mounted. The teardown nulls the api
  // and clears the query cache in one go, so each card started its count
  // again, on a null api, and the SDK threw "Cannot read property
  // 'configuration' of null".
  test("does not ask for the item count again when the session is torn down", async () => {
    const api = countApi();
    const { store, client, errors } = await renderCard(api);
    await waitFor(() =>
      expect(screen.getByText("12 library.item_types.movies")).toBeTruthy(),
    );

    // What clearSessionState in JellyfinProvider does.
    await act(async () => {
      store.set(userAtom, null);
      store.set(apiAtom, null);
      client.clear();
    });

    expect(errors).toEqual([]);
    expect(api.mock.history.get).toHaveLength(1);
  });

  test("does not ask for the item count without an api", async () => {
    const { errors } = await renderCard();

    expect(errors).toEqual([]);
  });

  // The query key does not carry the api, so a count that settled without one
  // would not be asked for again when it arrives.
  test("asks for the item count once the api arrives", async () => {
    const api = countApi();
    const { store, errors } = await renderCard();

    await act(async () => store.set(apiAtom, api));

    await waitFor(() =>
      expect(screen.getByText("12 library.item_types.movies")).toBeTruthy(),
    );
    expect(api.mock.history.get).toHaveLength(1);
    const query = new URL(api.mock.history.get[0].url ?? "").searchParams;
    expect(Object.fromEntries(query)).toEqual({
      userId: "user-1",
      parentId: "library-1",
      recursive: "true",
      limit: "0",
      includeItemTypes: "Movie",
    });
    expect(errors).toEqual([]);
  });
});

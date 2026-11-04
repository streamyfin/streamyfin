import type {
  BaseItemDto,
  UserDto,
} from "@jellyfin/sdk/lib/generated-client/models";
import {
  dehydrate,
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react-native";
import { createStore, Provider as JotaiProvider } from "jotai";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { makeApi } from "@/test-utils/jellyfinApi";
import { queryDehydrateOptions } from "@/utils/queryPersistence";
import { Favorites as PhoneFavorites } from "./Favorites";
import { Favorites as TVFavorites } from "./Favorites.tv";

jest.mock("@/providers/JellyfinProvider", () => {
  const { atom } = jest.requireActual("jotai");
  return { apiAtom: atom(null), userAtom: atom(null) };
});
jest.mock("i18next", () => ({ t: (key: string) => key }));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
// The TV sizes read the type scale from the settings, and its enum with it.
jest.mock("@/utils/atoms/settings", () => ({
  useSettings: () => ({ settings: {} }),
  TVTypographyScale: {
    Small: "small",
    Default: "default",
    Large: "large",
    ExtraLarge: "extraLarge",
  },
}));
jest.mock("@/hooks/useAppRouter", () => () => ({ push: jest.fn() }));
jest.mock("expo-router", () => ({ useSegments: () => [] }));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
// The TV row's sort options sit next to filter atoms stored in MMKV.
jest.mock(
  "react-native-mmkv",
  () => jest.requireActual("@/test-utils/mmkv").mmkvModule,
);
jest.mock("@/hooks/useTVItemActionModal", () => ({
  useTVItemActionModal: () => ({ showItemActions: jest.fn() }),
}));
// The route helper sits in a module that also draws the mobile action sheet,
// which reaches the providers and their storage: only the helper is wanted.
jest.mock("@/hooks/useItemActionSheet", () => ({
  useItemActionSheet: () => ({}),
}));
jest.mock("@/components/common/ServerImage", () => ({ Image: () => null }));
// The cards are not under test: each row draws the names of the items it was
// handed, and the rows themselves are the real ones, queries included.
jest.mock("@/components/cards/CardRow", () => {
  const { Text } = jest.requireActual("react-native");
  return {
    CardRow: ({ items = [] }: { items?: BaseItemDto[] }) =>
      items.map((item) => <Text key={item.Id}>{item.Name}</Text>),
  };
});
jest.mock("@/components/tv/TVPosterCard", () => {
  const { Text } = jest.requireActual("react-native");
  return {
    TVPosterCard: ({ item }: { item: BaseItemDto }) => <Text>{item.Name}</Text>,
  };
});

const USER: UserDto = { Id: "user-1" };
const ALIEN: BaseItemDto = { Id: "movie-1", Name: "Alien", Type: "Movie" };
const ARRIVAL: BaseItemDto = { Id: "movie-2", Name: "Arrival", Type: "Movie" };

/**
 * A server whose one favorite is `movie`. The other five rows get nothing:
 * with six empty answers the TV screen puts its empty state in place of the
 * rows, and a sign out would then find no row left to test.
 */
const serverWithFavorite = (movie: BaseItemDto) => {
  const api = makeApi();
  // The SDK writes the query into the url.
  api.mock.onGet(/\/Items\?/).reply((config) => {
    const query = new URL(config.url ?? "").searchParams;
    const isMovieRow = query.get("includeItemTypes") === "Movie";
    return [200, { Items: isMovieRow ? [movie] : [] }];
  });
  return api;
};

/**
 * React Query hands its updates to the rows on a zero timeout. Run inside
 * act, so none of them lands after the test body, outside it.
 */
const flushQueryUpdates = () =>
  act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));

/** Renders the tab signed in, its rows loaded with ALIEN. */
const renderSignedIn = async (Favorites: React.FC) => {
  const api = serverWithFavorite(ALIEN);
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
  store.set(userAtom, USER);

  await render(
    <QueryClientProvider client={client}>
      <JotaiProvider store={store}>
        <Favorites />
      </JotaiProvider>
    </QueryClientProvider>,
  );
  // One request per row, one row per favorite type.
  await waitFor(() => expect(api.mock.history.get).toHaveLength(6));
  await screen.findByText("Alien");
  await flushQueryUpdates();

  /** What clearSessionState in JellyfinProvider does on sign out. */
  const signOut = async () => {
    await act(async () => {
      store.set(userAtom, null);
      store.set(apiAtom, null);
      client.clear();
    });
    await waitFor(() => expect(client.isFetching()).toBe(0));
    await flushQueryUpdates();
  };

  /** The login form and Quick Connect set a new session, cache untouched. */
  const signIn = (nextApi: ReturnType<typeof makeApi>) =>
    act(async () => {
      store.set(userAtom, USER);
      store.set(apiAtom, nextApi);
    });

  return { api, client, errors, signOut, signIn };
};

describe.each([
  ["phone", PhoneFavorites],
  ["TV", TVFavorites],
])("Favorites on %s", (_platform, Favorites) => {
  // REACT-NATIVE-KX: signing out from the settings tab cleared the api and
  // the query cache while this tab stayed mounted. Its rows fetched again
  // with no api and threw "Cannot read property 'configuration' of null".
  it("asks nothing of the server once the session is signed out", async () => {
    const { api, client, errors, signOut } = await renderSignedIn(Favorites);

    await signOut();

    expect(errors).toEqual([]);
    expect(api.mock.history.get).toHaveLength(6);
    // Nor any answer the app would write to MMKV for its next launch.
    expect(dehydrate(client, queryDehydrateOptions).queries).toEqual([]);
  });

  // Answering the signed out rows with no items cached an empty page that
  // stayed fresh for the rows' minute of staleTime: signing back in within
  // it showed a blank tab, with neither rows nor the empty state.
  it("asks for the favorites again once the next session starts", async () => {
    const { errors, signOut, signIn } = await renderSignedIn(Favorites);
    await signOut();

    // Another favorite this time: the tab can only show it by asking.
    const nextApi = serverWithFavorite(ARRIVAL);
    await signIn(nextApi);

    await waitFor(() => expect(nextApi.mock.history.get).toHaveLength(6));
    expect(await screen.findByText("Arrival")).toBeTruthy();
    await flushQueryUpdates();
    expect(errors).toEqual([]);
  });
});

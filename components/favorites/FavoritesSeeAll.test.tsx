import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { getDefaultStore } from "jotai";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { makeApi } from "@/test-utils/jellyfinApi";
import FavoritesSeeAll from "./FavoritesSeeAll";

jest.mock("@/providers/JellyfinProvider", () => {
  const { atom } = jest.requireActual("jotai");
  return { apiAtom: atom(null), userAtom: atom(null) };
});
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("expo-router", () => ({
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({
    type: "Movie",
    title: "Movies",
    filter: "Likes",
  }),
}));
jest.mock("@/components/Loader", () => ({ Loader: () => null }));
// The screen imports `t` from i18next directly; QueryErrorState uses the hook.
jest.mock("i18next", () => ({ t: (key: string) => key }));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock("@/hooks/useHaptic", () => ({ useHaptic: () => () => {} }));
// The cards are not what is under test; an item shows up as its name.
jest.mock("@/components/cards/useCardGrid", () => {
  const { Text } = jest.requireActual("react-native");
  return {
    useCardGrid: ({ items }: { items: BaseItemDto[] }) => ({
      data: items,
      renderItem: ({ item }: { item: BaseItemDto }) => <Text>{item.Name}</Text>,
      keyExtractor: (item: BaseItemDto) => item.Id,
      rowGap: 0,
      actionSheet: null,
    }),
  };
});
const mockList: { onEndReached?: () => void } = {};
jest.mock("@shopify/flash-list", () => {
  const { View } = jest.requireActual("react-native");
  const { Fragment } = jest.requireActual("react");
  return {
    FlashList: ({
      data,
      renderItem,
      onEndReached,
      ListFooterComponent,
    }: {
      data: unknown[];
      renderItem: (info: { item: unknown; index: number }) => React.ReactNode;
      onEndReached?: () => void;
      ListFooterComponent?: React.ReactNode;
    }) => {
      mockList.onEndReached = onEndReached;
      return (
        <View>
          {data.map((item, index) => (
            <Fragment key={index}>{renderItem({ item, index })}</Fragment>
          ))}
          {ListFooterComponent}
        </View>
      );
    },
  };
});

const store = getDefaultStore();

/** Signs in as `userId`; that account's /Items request answers with `items`, or never. */
const signInAs = (userId: string, items?: BaseItemDto[]) => {
  const api = makeApi();
  api.mock
    .onGet(/\/Items/)
    .reply(() => (items ? [200, { Items: items }] : new Promise(() => {})));
  store.set(apiAtom, api as never);
  store.set(userAtom, { Id: userId } as never);
};

const renderScreen = (client: QueryClient) =>
  render(
    <QueryClientProvider client={client}>
      <FavoritesSeeAll />
    </QueryClientProvider>,
  );

// The cache outlives a user switch; a grid keyed only by type and filter would
// open on the previous account's list until the new request came back.
test("never shows the previous account's items to the next one", async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { gcTime: Infinity, retry: false } },
  });

  signInAs("first", [{ Id: "m1", Name: "First account's movie" }]);
  const first = await renderScreen(client);
  expect(await screen.findByText("First account's movie")).toBeTruthy();
  await first.unmount();

  signInAs("second");
  await renderScreen(client);

  expect(screen.queryByText("First account's movie")).toBeNull();
});

// A failed request is not an empty list: saying "no items" would tell the user
// their watchlist or favorites were gone.
test("shows a retryable error, not the empty state, when loading fails", async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { gcTime: Infinity, retry: false } },
  });
  signInAs("first");
  const api = store.get(apiAtom) as unknown as ReturnType<typeof makeApi>;
  api.mock.reset();
  api.mock.onGet(/\/Items/).replyOnce(500);
  api.mock
    .onGet(/\/Items/)
    .replyOnce(200, { Items: [{ Id: "m1", Name: "Back again" }] });

  await renderScreen(client);

  expect(await screen.findByText("common.something_went_wrong")).toBeTruthy();
  expect(screen.queryByText("home.no_items")).toBeNull();

  await fireEvent.press(screen.getByText("home.retry"));

  expect(await screen.findByText("Back again")).toBeTruthy();
});

// FlashList fires onEndReached again while the next page is still on its way;
// each call that gets through cancels that request and starts it over.
test("asks for the next page once while it is loading", async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { gcTime: Infinity, retry: false } },
  });
  const firstPage = Array.from({ length: 50 }, (_, i) => ({
    Id: `m${i}`,
    Name: `Movie ${i}`,
  }));
  signInAs("first");
  const api = store.get(apiAtom) as unknown as ReturnType<typeof makeApi>;
  api.mock.reset();
  api.mock.onGet(/\/Items/).replyOnce(200, { Items: firstPage });
  // The second page never answers, so it stays in flight.
  api.mock.onGet(/\/Items/).reply(() => new Promise(() => {}));

  await renderScreen(client);
  expect(await screen.findByText("Movie 0")).toBeTruthy();

  await act(async () => mockList.onEndReached?.());
  await act(async () => mockList.onEndReached?.());
  await act(async () => mockList.onEndReached?.());

  expect(api.mock.history.get).toHaveLength(2);
});

// A later page failing left the grid looking complete, with no way to fetch
// the rest: FlashList only fires onEndReached again on a fresh scroll past
// the end, and the user is already there.
test("offers a retry when a later page fails, keeping the pages it has", async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { gcTime: Infinity, retry: false } },
  });
  const firstPage = Array.from({ length: 50 }, (_, i) => ({
    Id: `m${i}`,
    Name: `Movie ${i}`,
  }));
  signInAs("first");
  const api = store.get(apiAtom) as unknown as ReturnType<typeof makeApi>;
  api.mock.reset();
  api.mock.onGet(/\/Items/).replyOnce(200, { Items: firstPage });
  api.mock.onGet(/\/Items/).replyOnce(500);
  api.mock
    .onGet(/\/Items/)
    .replyOnce(200, { Items: [{ Id: "m50", Name: "Movie 50" }] });

  await renderScreen(client);
  expect(await screen.findByText("Movie 0")).toBeTruthy();

  await act(async () => mockList.onEndReached?.());

  expect(await screen.findByText("common.load_more_failed")).toBeTruthy();
  expect(screen.getByText("Movie 49")).toBeTruthy();

  await fireEvent.press(screen.getByText("home.retry"));

  expect(await screen.findByText("Movie 50")).toBeTruthy();
  expect(screen.queryByText("common.load_more_failed")).toBeNull();
  expect(screen.getByText("Movie 0")).toBeTruthy();
});

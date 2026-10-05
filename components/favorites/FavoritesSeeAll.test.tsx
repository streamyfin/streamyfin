import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react-native";
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
jest.mock("@shopify/flash-list", () => {
  const { View } = jest.requireActual("react-native");
  return {
    FlashList: ({
      data,
      renderItem,
    }: {
      data: unknown[];
      renderItem: (info: { item: unknown; index: number }) => React.ReactNode;
    }) => <View>{data.map((item, index) => renderItem({ item, index }))}</View>,
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

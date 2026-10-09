import type { QueryKey } from "@tanstack/react-query";
import { render } from "@testing-library/react-native";
import { getDefaultStore } from "jotai";
import type { ComponentType } from "react";
import { userAtom } from "@/providers/JellyfinProvider";
import { Favorites } from "./Favorites";
import { Favorites as TVFavorites } from "./Favorites.tv";

const mockKeys: QueryKey[] = [];
const mockRow = ({ queryKey }: { queryKey: QueryKey }) => {
  mockKeys.push(queryKey);
  return null;
};

jest.mock("@/providers/JellyfinProvider", () => {
  const { atom } = jest.requireActual("jotai");
  return { apiAtom: atom({}), userAtom: atom(null) };
});
// The rows are not what is under test, only the cache each one is given.
jest.mock("./InfiniteScrollingCollectionList", () => ({
  InfiniteScrollingCollectionList: (props: { queryKey: QueryKey }) =>
    mockRow(props),
}));
jest.mock("@/components/home/InfiniteScrollingCollectionList.tv", () => ({
  InfiniteScrollingCollectionList: (props: { queryKey: QueryKey }) =>
    mockRow(props),
}));
jest.mock("@/components/common/ServerImage", () => ({ Image: () => null }));
jest.mock("@/hooks/useAppRouter", () => ({
  __esModule: true,
  default: () => ({ push: jest.fn() }),
}));
jest.mock("@/constants/TVTypography", () => ({
  useScaledTVTypography: () => ({ heading: 32, callout: 26 }),
}));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const store = getDefaultStore();

/** The query keys a component hands its rows while `userId` is signed in. */
const keysFor = async (Component: ComponentType, userId: string) => {
  mockKeys.length = 0;
  store.set(userAtom, { Id: userId } as never);
  const view = await render(<Component />);
  await view.unmount();
  return mockKeys.map((key) => JSON.stringify(key));
};

// The cache outlives a user switch, and develop persists it to disk: rows
// keyed without the account open on the previous account's favorites or
// watchlist until the new request comes back.
describe.each([
  ["mobile", Favorites as ComponentType],
  ["TV", TVFavorites as ComponentType],
])("%s favorites rows", (_platform, Component) => {
  test("never share a cache entry between accounts", async () => {
    const first = await keysFor(Component, "first");
    const second = await keysFor(Component, "second");

    expect(first.length).toBeGreaterThan(0);
    expect(second.filter((key) => first.includes(key))).toEqual([]);
  });
});

import {
  QueryClient,
  QueryClientProvider,
  type QueryKey,
} from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { getDefaultStore } from "jotai";
import { type ComponentType, useEffect } from "react";
import { userAtom } from "@/providers/JellyfinProvider";
import { Favorites } from "./Favorites";
import { Favorites as TVFavorites } from "./Favorites.tv";

interface RowProps {
  queryKey: QueryKey;
  onEmptyStateChange?: (isEmpty: boolean | null) => void;
  onErrorChange?: (isError: boolean) => void;
}

const mockKeys: QueryKey[] = [];
/** How every row's request ends: with items, with none, or failing. */
const mockRows = { outcome: "items" as "items" | "empty" | "error" };
const mockRow = ({ queryKey, onEmptyStateChange, onErrorChange }: RowProps) => {
  mockKeys.push(queryKey);
  // Report the outcome the way the real rows do once their query settles.
  useEffect(() => {
    const failed = mockRows.outcome === "error";
    onErrorChange?.(failed);
    onEmptyStateChange?.(failed ? null : mockRows.outcome === "empty");
  }, [onEmptyStateChange, onErrorChange]);
  return null;
};

jest.mock("@/providers/JellyfinProvider", () => {
  const { atom } = jest.requireActual("jotai");
  return { apiAtom: atom({}), userAtom: atom(null) };
});
// The rows are not what is under test, only the cache each one is given.
jest.mock("./InfiniteScrollingCollectionList", () => ({
  InfiniteScrollingCollectionList: (props: RowProps) => mockRow(props),
}));
jest.mock("@/components/home/InfiniteScrollingCollectionList.tv", () => ({
  InfiniteScrollingCollectionList: (props: RowProps) => mockRow(props),
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
jest.mock("@/hooks/useHaptic", () => ({ useHaptic: () => () => {} }));
jest.mock("@/providers/InactivityProvider", () => ({
  useInactivity: () => ({ resetInactivityTimer: () => {} }),
}));
// Mobile Favorites imports `t` from i18next directly, the TV one the hook.
jest.mock("i18next", () => ({ t: (key: string) => key }));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const store = getDefaultStore();

let client: QueryClient;
const renderWithClient = (Component: ComponentType) =>
  render(
    <QueryClientProvider client={client}>
      <Component />
    </QueryClientProvider>,
  );

beforeEach(() => {
  client = new QueryClient();
  mockRows.outcome = "items";
});

/** The query keys a component hands its rows while `userId` is signed in. */
const keysFor = async (Component: ComponentType, userId: string) => {
  mockKeys.length = 0;
  store.set(userAtom, { Id: userId } as never);
  const view = await renderWithClient(Component);
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
  // With every row failing, each one hides itself and the screen was blank:
  // no rows, no empty message, nothing to retry.
  test("shows a retryable error when every row fails", async () => {
    mockRows.outcome = "error";
    store.set(userAtom, { Id: "first" } as never);
    const refetch = jest.spyOn(client, "refetchQueries");
    await renderWithClient(Component);

    expect(screen.getByText("common.something_went_wrong")).toBeTruthy();
    expect(screen.queryByText("favorites.noDataTitle")).toBeNull();

    await fireEvent.press(screen.getByText("home.retry"));
    expect(refetch).toHaveBeenCalledWith({
      queryKey: ["home", "favorites", "first"],
    });
  });

  test("shows the empty state, not an error, when every row is empty", async () => {
    mockRows.outcome = "empty";
    await renderWithClient(Component);

    expect(screen.getByText("favorites.noDataTitle")).toBeTruthy();
    expect(screen.queryByText("common.something_went_wrong")).toBeNull();
  });

  test("never share a cache entry between accounts", async () => {
    const first = await keysFor(Component, "first");
    const second = await keysFor(Component, "second");

    expect(first.length).toBeGreaterThan(0);
    expect(second.filter((key) => first.includes(key))).toEqual([]);
  });
});

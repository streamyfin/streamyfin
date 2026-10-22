import { fireEvent, render, screen } from "@testing-library/react-native";
import type { StreamystatsWatchlist } from "@/utils/streamystats/types";
import { StreamystatsWatchlists } from "./StreamystatsWatchlists";

const mockRefetch = jest.fn();
const mockQuery: {
  data?: StreamystatsWatchlist[];
  isLoading: boolean;
  isError: boolean;
} = { isLoading: false, isError: false };

jest.mock("@/providers/JellyfinProvider", () => {
  const { atom } = jest.requireActual("jotai");
  return { userAtom: atom({ Id: "me" }) };
});
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("@/hooks/useWatchlists", () => ({
  useStreamystatsEnabled: () => true,
  useWatchlistsQuery: () => ({ ...mockQuery, refetch: mockRefetch }),
}));
jest.mock("@/hooks/useAppRouter", () => ({
  __esModule: true,
  default: () => ({ push: jest.fn() }),
}));
// Renders every row at once: no layout to measure here.
jest.mock("@shopify/flash-list", () => ({
  FlashList: ({
    data,
    renderItem,
  }: {
    data: unknown[];
    renderItem: (info: { item: unknown; index: number }) => unknown;
  }) => data.map((item, index) => renderItem({ item, index })),
}));
jest.mock("@/hooks/useHaptic", () => ({ useHaptic: () => () => {} }));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { count?: number }) =>
      options?.count === undefined ? key : `${key}:${options.count}`,
  }),
}));

beforeEach(() => {
  mockRefetch.mockClear();
  mockQuery.data = undefined;
  mockQuery.isLoading = false;
  mockQuery.isError = false;
});

test("shows the empty state for a successful empty result", async () => {
  mockQuery.data = [];
  await render(<StreamystatsWatchlists />);
  expect(screen.getByText("watchlists.empty_title")).toBeTruthy();
});

// A failed request is not an empty list: the empty state would tell the user
// they have no watchlists.
test("shows a retryable error, not the empty state, when loading fails", async () => {
  mockQuery.isError = true;
  await render(<StreamystatsWatchlists />);

  expect(screen.getByText("common.something_went_wrong")).toBeTruthy();
  expect(screen.queryByText("watchlists.empty_title")).toBeNull();

  await fireEvent.press(screen.getByText("home.retry"));
  expect(mockRefetch).toHaveBeenCalledTimes(1);
});

// The count and its noun used to be two strings put side by side, which a
// translation cannot reorder (#2171). Choosing the key with count === 1 was
// English's rule (French reads 0 as singular, Russian 21), so one key goes to
// i18next, which picks the plural form.
test("counts each watchlist's items as one plural phrase", async () => {
  const watchlist = {
    serverId: 1,
    userId: "me",
    isPublic: false,
    isPromoted: false,
    createdAt: "",
    updatedAt: "",
  };
  mockQuery.data = [
    { ...watchlist, id: 1, name: "One", itemCount: 1 },
    { ...watchlist, id: 2, name: "Three", itemCount: 3 },
  ];
  await render(<StreamystatsWatchlists />);

  expect(screen.getByText("watchlists.item_count:1")).toBeTruthy();
  expect(screen.getByText("watchlists.item_count:3")).toBeTruthy();
});

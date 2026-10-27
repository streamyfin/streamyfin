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
// Only the empty and error states are under test; neither renders the list.
jest.mock("@shopify/flash-list", () => ({ FlashList: () => null }));
jest.mock("@/hooks/useHaptic", () => ({ useHaptic: () => () => {} }));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
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

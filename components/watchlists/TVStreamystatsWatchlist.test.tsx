import { fireEvent, render, screen } from "@testing-library/react-native";
import type { StreamystatsWatchlist } from "@/utils/streamystats/types";
import { TVStreamystatsWatchlists } from "./TVStreamystatsWatchlist";

const mockPush = jest.fn();
const mockRefetch = jest.fn();
const mockQuery: {
  data?: StreamystatsWatchlist[];
  isLoading: boolean;
  isError: boolean;
  isFetching: boolean;
  refetch: () => void;
} = {
  isLoading: false,
  isError: false,
  isFetching: false,
  refetch: mockRefetch,
};

jest.mock("@/providers/JellyfinProvider", () => {
  const { atom } = jest.requireActual("jotai");
  return { userAtom: atom({ Id: "me" }) };
});
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("@/hooks/useWatchlists", () => ({
  useWatchlistsQuery: () => mockQuery,
}));
jest.mock("@/hooks/useAppRouter", () => ({
  __esModule: true,
  default: () => ({ push: mockPush }),
}));
jest.mock("@/constants/TVTypography", () => ({
  useScaledTVTypography: () => ({ heading: 32, callout: 26 }),
}));
jest.mock("@/components/tv/hooks/useTVFocusAnimation", () => ({
  useTVFocusAnimation: () => ({
    focused: false,
    handleFocus: () => {},
    handleBlur: () => {},
    animatedStyle: {},
  }),
}));
jest.mock("@/providers/InactivityProvider", () => ({
  useInactivity: () => ({ resetInactivityTimer: () => {} }),
}));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const watchlist = (
  id: number,
  name: string,
  userId: string,
): StreamystatsWatchlist =>
  ({ id, name, userId, isPublic: true, itemCount: 2 }) as StreamystatsWatchlist;

/** The focusable element wrapping a card or button, found through its text. */
const focusableFor = (name: string) => {
  let node = screen.getByText(name).parent;
  while (node && node.props.hasTVPreferredFocus === undefined) {
    node = node.parent;
  }
  if (!node) throw new Error(`no focusable element for ${name}`);
  return node;
};

beforeEach(() => {
  mockPush.mockClear();
  mockRefetch.mockClear();
  mockQuery.isLoading = false;
  mockQuery.isError = false;
  mockQuery.data = [
    watchlist(1, "Their list", "someone-else"),
    watchlist(2, "My list", "me"),
    watchlist(3, "My other list", "me"),
  ];
});

test("lists my watchlists before public ones", async () => {
  await render(<TVStreamystatsWatchlists />);
  const texts = screen
    .getAllByText(/(watchlists\.(my|public)_watchlists|list)$/i)
    .map((node) => node.props.children);
  expect(texts).toEqual([
    "watchlists.my_watchlists",
    "My list",
    "My other list",
    "watchlists.public_watchlists",
    "Their list",
  ]);
});

test("gives initial focus to the first card only", async () => {
  await render(<TVStreamystatsWatchlists />);
  expect(focusableFor("My list").props.hasTVPreferredFocus).toBe(true);
  expect(focusableFor("My other list").props.hasTVPreferredFocus).toBe(false);
  expect(focusableFor("Their list").props.hasTVPreferredFocus).toBe(false);
});

// The watchlists tab puts its source toggle above this list and gives the toggle
// initial focus; a second preferred-focus target makes TV focus flicker.
test("takes no initial focus when it is not the first section", async () => {
  await render(<TVStreamystatsWatchlists isFirstSection={false} />);
  expect(focusableFor("My list").props.hasTVPreferredFocus).toBe(false);
});

test("opens the watchlist's detail page", async () => {
  await render(<TVStreamystatsWatchlists />);
  fireEvent.press(screen.getByText("Their list"));
  expect(mockPush).toHaveBeenCalledWith("/(auth)/(tabs)/(watchlists)/1");
});

test("shows the empty state when there are no watchlists", async () => {
  mockQuery.data = [];
  await render(<TVStreamystatsWatchlists />);
  expect(screen.getByText("watchlists.empty_title")).toBeTruthy();
});

// A failed request is not an empty list: the empty state would tell the user
// they have no watchlists.
test("shows a retryable error, not the empty state, when loading fails", async () => {
  mockQuery.data = undefined;
  mockQuery.isError = true;
  await render(<TVStreamystatsWatchlists />);

  expect(screen.getByText("common.something_went_wrong")).toBeTruthy();
  expect(screen.queryByText("watchlists.empty_title")).toBeNull();

  await fireEvent.press(screen.getByText("home.retry"));
  expect(mockRefetch).toHaveBeenCalledTimes(1);
});

// With no cards on screen the retry button is the only thing to focus, unless
// the source toggle above already owns the initial focus.
test("gives the retry button initial focus only as the first section", async () => {
  mockQuery.data = undefined;
  mockQuery.isError = true;

  const first = await render(<TVStreamystatsWatchlists />);
  expect(focusableFor("home.retry").props.hasTVPreferredFocus).toBe(true);
  await first.unmount();

  await render(<TVStreamystatsWatchlists isFirstSection={false} />);
  expect(focusableFor("home.retry").props.hasTVPreferredFocus).toBe(false);
});

import { fireEvent, render, screen } from "@testing-library/react-native";
import type { StreamystatsWatchlist } from "@/utils/streamystats/types";
import { TVStreamystatsWatchlists } from "./TVStreamystatsWatchlist";

const mockPush = jest.fn();
const mockQuery: { data?: StreamystatsWatchlist[]; isLoading: boolean } = {
  isLoading: false,
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
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const watchlist = (
  id: number,
  name: string,
  userId: string,
): StreamystatsWatchlist =>
  ({ id, name, userId, isPublic: true, itemCount: 2 }) as StreamystatsWatchlist;

/** The Pressable wrapping a card, found through the card's name. */
const cardFor = (name: string) => {
  let node = screen.getByText(name).parent;
  while (node && node.props.hasTVPreferredFocus === undefined) {
    node = node.parent;
  }
  if (!node) throw new Error(`no focusable card for ${name}`);
  return node;
};

beforeEach(() => {
  mockPush.mockClear();
  mockQuery.isLoading = false;
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
  expect(cardFor("My list").props.hasTVPreferredFocus).toBe(true);
  expect(cardFor("My other list").props.hasTVPreferredFocus).toBe(false);
  expect(cardFor("Their list").props.hasTVPreferredFocus).toBe(false);
});

// The watchlists tab puts its source toggle above this list and gives the toggle
// initial focus; a second preferred-focus target makes TV focus flicker.
test("takes no initial focus when it is not the first section", async () => {
  await render(<TVStreamystatsWatchlists isFirstSection={false} />);
  expect(cardFor("My list").props.hasTVPreferredFocus).toBe(false);
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

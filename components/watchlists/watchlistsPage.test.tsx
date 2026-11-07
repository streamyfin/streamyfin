import { fireEvent, render, screen } from "@testing-library/react-native";
import { Platform, StyleSheet } from "react-native";
import WatchlistsPage from "@/app/(auth)/(tabs)/(watchlists)/index";

/** What the watchlists query answers, set by each test. */
let mockQuery: {
  data: unknown[] | undefined;
  isLoading: boolean;
  isError?: boolean;
  isFetching?: boolean;
  errorUpdateCount?: number;
  refetch: () => Promise<unknown>;
};

jest.mock("@/hooks/useWatchlists", () => ({
  useStreamystatsEnabled: () => true,
  useWatchlistsQuery: () => mockQuery,
}));
jest.mock("@/providers/JellyfinProvider", () => ({
  userAtom: jest.requireActual("jotai").atom({ Id: "user" }),
}));
jest.mock("@/constants/TVTypography", () => ({
  useScaledTVTypography: () => ({
    title: 50,
    heading: 42,
    body: 24,
    callout: 20,
  }),
}));
// Its own imports reach the app's settings and device modules; a press is enough here.
jest.mock("@/components/Button", () => {
  const React = jest.requireActual("react");
  const { Pressable } = jest.requireActual("react-native");
  return {
    Button: ({
      children,
      onPress,
      color = "purple",
    }: {
      children: React.ReactNode;
      onPress?: () => void;
      color?: string;
    }) =>
      React.createElement(
        Pressable,
        { onPress, testID: `button-${color}` },
        children,
      ),
  };
});

// The tab stayed blank while the lists were on their way, for as long as the
// Streamystats server took to answer (seen on an Android TV, 2026-11-03).
test("shows that the watchlists are loading instead of a blank page", async () => {
  mockQuery = { data: undefined, isLoading: true, refetch: async () => {} };

  await render(<WatchlistsPage />);

  expect(screen.getByTestId("watchlists-loading")).toBeTruthy();
  expect(screen.queryByText("watchlists.empty_title")).toBeNull();
});

test("says there is no watchlist once none came back", async () => {
  mockQuery = { data: [], isLoading: false, refetch: async () => {} };

  await render(<WatchlistsPage />);

  expect(screen.getByText("watchlists.empty_title")).toBeTruthy();
  expect(screen.queryByTestId("watchlists-loading")).toBeNull();
});

// With the Streamystats server out of reach, the tab said there was no
// watchlist once the query gave up (seen on an Android TV, 2026-11-03).
test("says the watchlists could not be loaded, and asks for them again on Retry", async () => {
  const refetch = jest.fn(async () => undefined);
  mockQuery = {
    data: undefined,
    isLoading: false,
    isError: true,
    errorUpdateCount: 1,
    refetch,
  };

  await render(<WatchlistsPage />);

  expect(screen.getByText("watchlists.load_failed_title")).toBeTruthy();
  expect(screen.queryByText("watchlists.empty_title")).toBeNull();
  fireEvent.press(screen.getByText("home.retry"));
  expect(refetch).toHaveBeenCalledTimes(1);
});

// Retry asks again, and query-core puts a query with no data back to pending
// while it does (episodeRowState.test.ts shows it on a real query): the page
// swapped the failure for the loader, which on a TV unmounted the Retry that
// had the focus, and the failure came back with nothing focused.
test("keeps the failure and its Retry on screen while it is retried", async () => {
  mockQuery = {
    data: undefined,
    isLoading: true,
    isFetching: true,
    isError: false,
    errorUpdateCount: 1,
    refetch: async () => {},
  };

  await render(<WatchlistsPage />);

  expect(screen.getByText("watchlists.load_failed_title")).toBeTruthy();
  expect(screen.getByTestId("button-purple")).toBeTruthy();
  expect(screen.queryByTestId("watchlists-loading")).toBeNull();
});

// docs/conventions/tv.md: no purple accent on TV, and TV text follows the TV
// type scale.
test("on TV the failure has a black Retry and TV-sized text", async () => {
  jest.spyOn(Platform, "isTV", "get").mockReturnValue(true);
  mockQuery = {
    data: undefined,
    isLoading: false,
    isError: true,
    errorUpdateCount: 1,
    refetch: async () => {},
  };

  await render(<WatchlistsPage />);

  expect(screen.getByTestId("button-black")).toBeTruthy();
  expect(
    StyleSheet.flatten(
      screen.getByText("watchlists.load_failed_title").props.style,
    ).fontSize,
  ).toBe(50);
  expect(
    StyleSheet.flatten(
      screen.getByText("watchlists.load_failed_description").props.style,
    ).fontSize,
  ).toBe(24);
});

import { fireEvent, render, screen } from "@testing-library/react-native";
import WatchlistsPage from "@/app/(auth)/(tabs)/(watchlists)/index";

/** What the watchlists query answers, set by each test. */
let mockQuery: {
  data: unknown[] | undefined;
  isLoading: boolean;
  isError?: boolean;
  refetch: () => Promise<unknown>;
};

jest.mock(
  "react-native-mmkv",
  () => jest.requireActual("@/test-utils/mmkv").mmkvModule,
);
jest.mock("@gorhom/bottom-sheet", () =>
  jest.requireActual("@gorhom/bottom-sheet/mock"),
);
jest.mock("@/hooks/useWatchlists", () => ({
  useStreamystatsEnabled: () => true,
  useWatchlistsQuery: () => mockQuery,
}));
jest.mock("@/hooks/useAppRouter", () => ({
  __esModule: true,
  default: () => ({ push: jest.fn() }),
}));
jest.mock("@/providers/JellyfinProvider", () => ({
  userAtom: jest.requireActual("jotai").atom({ Id: "user" }),
}));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock("@expo/vector-icons", () => ({ Ionicons: () => null }));
// Its own imports reach the app's settings and device modules; a press is enough here.
jest.mock("@/components/Button", () => {
  const React = jest.requireActual("react");
  const { Pressable } = jest.requireActual("react-native");
  return {
    Button: ({
      children,
      onPress,
    }: {
      children: React.ReactNode;
      onPress?: () => void;
    }) => React.createElement(Pressable, { onPress }, children),
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
  mockQuery = { data: undefined, isLoading: false, isError: true, refetch };

  await render(<WatchlistsPage />);

  expect(screen.getByText("watchlists.load_failed_title")).toBeTruthy();
  expect(screen.queryByText("watchlists.empty_title")).toBeNull();
  fireEvent.press(screen.getByText("home.retry"));
  expect(refetch).toHaveBeenCalledTimes(1);
});

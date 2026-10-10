import { render, screen } from "@testing-library/react-native";
import { TVWatchlistButton } from "./TVWatchlistButton";

const mockState = { isOffline: false, isPending: false };

jest.mock("@/hooks/useWatchlist", () => ({
  useWatchlist: () => ({
    isWatchlisted: false,
    toggleWatchlist: () => {},
    isPending: mockState.isPending,
  }),
}));
jest.mock("@/providers/OfflineModeProvider", () => ({
  useOfflineMode: () => mockState.isOffline,
}));
jest.mock("@/providers/InactivityProvider", () => ({
  useInactivity: () => ({ resetInactivityTimer: () => {} }),
}));

beforeEach(() => {
  mockState.isOffline = false;
  mockState.isPending = false;
});

test("shows the toggle while online", async () => {
  await render(<TVWatchlistButton item={{ Id: "1" }} />);
  expect(screen.toJSON()).not.toBeNull();
});

// The toggle writes Jellyfin's Likes rating, which cannot reach the server
// from a downloaded item's page.
test("renders nothing offline", async () => {
  mockState.isOffline = true;
  await render(<TVWatchlistButton item={{ Id: "1" }} />);
  expect(screen.toJSON()).toBeNull();
});

// A disabled TVButton gives up the focus, so disabling the button the user just
// pressed sent the focus elsewhere until the request came back. The hook
// already ignores presses while one is in flight.
test("keeps the focus while its request is in flight", async () => {
  mockState.isPending = true;
  await render(<TVWatchlistButton item={{ Id: "1" }} />);

  const tree = screen.toJSON();
  if (!tree || Array.isArray(tree)) throw new Error("expected one host view");
  expect(tree.props.focusable).not.toBe(false);
});

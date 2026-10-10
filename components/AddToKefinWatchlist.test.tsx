import { render, screen } from "@testing-library/react-native";
import { AddToKefinWatchlist } from "./AddToKefinWatchlist";

const mockState = { isOffline: false };

jest.mock("@/hooks/useWatchlist", () => ({
  useWatchlist: () => ({
    isWatchlisted: false,
    toggleWatchlist: () => {},
    isPending: false,
  }),
}));
jest.mock("@/providers/OfflineModeProvider", () => ({
  useOfflineMode: () => mockState.isOffline,
}));
jest.mock("@/hooks/useHaptic", () => ({ useHaptic: () => () => {} }));

beforeEach(() => {
  mockState.isOffline = false;
});

test("shows the toggle while online", async () => {
  await render(<AddToKefinWatchlist item={{ Id: "1" }} />);
  expect(screen.toJSON()).not.toBeNull();
});

// The toggle writes Jellyfin's Likes rating, which cannot reach the server
// from a downloaded item's page.
test("renders nothing offline", async () => {
  mockState.isOffline = true;
  await render(<AddToKefinWatchlist item={{ Id: "1" }} />);
  expect(screen.toJSON()).toBeNull();
});

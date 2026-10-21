import { render, screen } from "@testing-library/react-native";
import { AddToKefinWatchlist } from "./AddToKefinWatchlist";

const mockState = { isOffline: false, isWatchlisted: false };

jest.mock("@/hooks/useWatchlist", () => ({
  useWatchlist: () => ({
    isWatchlisted: mockState.isWatchlisted,
    toggleWatchlist: () => {},
    isPending: false,
  }),
}));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock("@/providers/OfflineModeProvider", () => ({
  useOfflineMode: () => mockState.isOffline,
}));
jest.mock("@/hooks/useHaptic", () => ({ useHaptic: () => () => {} }));

beforeEach(() => {
  mockState.isOffline = false;
  mockState.isWatchlisted = false;
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

// With Streamystats on as well, the header shows two identical bookmarks: a
// screen reader has only the name to tell them apart (#2171).
test("names the toggle after its watchlist and what a press does", async () => {
  await render(<AddToKefinWatchlist item={{ Id: "1" }} />);
  expect(screen.getByLabelText("kefintweaksWatchlist.add_button")).toBeTruthy();

  mockState.isWatchlisted = true;
  await render(<AddToKefinWatchlist item={{ Id: "1" }} />);
  expect(
    screen.getByLabelText("kefintweaksWatchlist.remove_button"),
  ).toBeTruthy();
});

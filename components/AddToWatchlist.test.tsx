import { render, screen } from "@testing-library/react-native";
import { AddToWatchlist } from "./AddToWatchlist";

jest.mock("@/hooks/useWatchlists", () => ({
  useItemInWatchlists: () => ({ data: [] }),
  useStreamystatsEnabled: () => true,
}));
jest.mock("@/components/watchlists/WatchlistSheet", () => ({
  WatchlistSheet: () => null,
}));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock("@/hooks/useHaptic", () => ({ useHaptic: () => () => {} }));

// With KefinTweaks on as well, the header shows two identical bookmarks: a
// screen reader has only the name to tell them apart (#2171).
test("names the button after the Streamystats watchlists", async () => {
  await render(<AddToWatchlist item={{ Id: "1" }} />);

  expect(screen.getByLabelText("watchlists.streamystats_button")).toBeTruthy();
});

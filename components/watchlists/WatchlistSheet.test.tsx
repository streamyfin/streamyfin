import { act, render, screen } from "@testing-library/react-native";
import { createRef } from "react";
import {
  WatchlistRow,
  WatchlistSheet,
  type WatchlistSheetRef,
} from "@/components/watchlists/WatchlistSheet";
import type { StreamystatsWatchlist } from "@/utils/streamystats/types";

let mockWatchlists: StreamystatsWatchlist[] = [];
jest.mock("@/hooks/useWatchlists", () => ({
  useItemInWatchlists: () => ({ data: [] }),
  useMyWatchlistsQuery: () => ({ data: mockWatchlists, isLoading: false }),
}));
jest.mock("@/hooks/useWatchlistMutations", () => ({
  useAddToWatchlist: () => ({ mutateAsync: jest.fn() }),
  useRemoveFromWatchlist: () => ({ mutateAsync: jest.fn() }),
}));
// The key, and its values when there are some, stand for the translation.
jest.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: object) =>
      values ? `${key} ${JSON.stringify(values)}` : key,
  }),
}));

const WATCHLIST = {
  id: 1,
  name: "Sunday films",
  description:
    "Films for Sunday evenings with the family and friends, in their original language when there is one.",
  allowedItemType: "Movie",
  itemCount: 2,
} as StreamystatsWatchlist;

const renderRow = () =>
  render(
    <WatchlistRow
      watchlist={WATCHLIST}
      isInWatchlist={false}
      isCompatible
      onToggle={jest.fn()}
      isLoading={false}
    />,
  );

describe("WatchlistRow", () => {
  // The count was "{n} items" in English, whatever the app's language.
  test("counts the items in the app's language", async () => {
    await renderRow();
    expect(screen.getByText('watchlists.item_count {"count":2}')).toBeTruthy();
  });

  test("names the content the watchlist takes in the app's language", async () => {
    await renderRow();
    expect(screen.getByText("watchlists.movies_only")).toBeTruthy();
  });

  // One line cut most descriptions short: two read as a sentence.
  test("shows two lines of the description", async () => {
    await renderRow();
    expect(screen.getByText(WATCHLIST.description!).props.numberOfLines).toBe(
      2,
    );
  });
});

describe("WatchlistSheet", () => {
  // Two lines of description make each row taller, and the sheet stops at a
  // fixed height: a list that outgrows it has to scroll to its last rows.
  test("scrolls its rows when they outgrow the sheet", async () => {
    mockWatchlists = [WATCHLIST];
    const ref = createRef<WatchlistSheetRef>();
    await render(<WatchlistSheet ref={ref} />);

    await act(async () => {
      ref.current?.open({ Id: "movie", Type: "Movie" });
    });

    type HostNode = { type: unknown; parent: HostNode | null };
    let node: HostNode | null = screen.getByText(
      WATCHLIST.name,
    ) as unknown as HostNode;
    while (node && node.type !== "RCTScrollView") node = node.parent;
    expect(node).not.toBeNull();
  });
});

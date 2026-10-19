import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";
import { measureRenders } from "reassure";
import { makeItems } from "@/test-utils/baseItems";
import { reachListEnd } from "@/test-utils/lists";
import { JotaiQueryWrapper } from "@/test-utils/queryWrapper";
import { stubReactNative } from "@/test-utils/reactNative";

jest.mock(
  "@/providers/NetworkStatusProvider",
  () => jest.requireActual("@/test-utils/appProviders").networkStatusModule,
);

stubReactNative({ isTV: true });

const {
  InfiniteScrollingCollectionList,
} = require("./InfiniteScrollingCollectionList.tv");

const PAGE_SIZE = 30;
const FOCUS_MOVES = 10;
const allItems = makeItems(PAGE_SIZE * 2);

let pagesFetched = 0;

const resetQuery = () => {
  pagesFetched = 0;
};

const queryFn = async ({ pageParam = 0 }: { pageParam?: number }) => {
  pagesFetched += 1;
  return allItems.slice(pageParam, pageParam + PAGE_SIZE);
};

const Row = () => (
  <InfiniteScrollingCollectionList
    title='Test Collection'
    queryKey={["test-collection"]}
    queryFn={queryFn}
    pageSize={PAGE_SIZE}
  />
);

describe("TV Poster Row Performance", () => {
  test("focus moving along a poster row, then the next page arriving", async () => {
    await measureRenders(<Row />, {
      wrapper: JotaiQueryWrapper,
      beforeEach: resetQuery,
      scenario: async () => {
        await screen.findByText("Movie 0");

        // The posters' pressables. FlatList only renders the first few
        // without layout, so focus walks back and forth across those, as the
        // remote does: the next card takes focus, the previous one loses it.
        const pressables = screen.container.queryAll(
          (node) =>
            node.props.accessible === true &&
            typeof node.props.onFocus === "function",
        );
        const path = [
          ...pressables.keys(),
          ...[...pressables.keys()].reverse().slice(1, -1),
        ];
        for (let move = 0; move < FOCUS_MOVES; move++) {
          const next = pressables[path[move % path.length]];
          const previous =
            pressables[path[(move - 1 + path.length) % path.length]];
          if (move > 0) await fireEvent(previous, "blur");
          await fireEvent(next, "focus");
        }

        await reachListEnd();
        await waitFor(() => expect(pagesFetched).toBe(2));
        await act(async () => {
          await jest.advanceTimersByTimeAsync(0);
        });
      },
    });
  });
});

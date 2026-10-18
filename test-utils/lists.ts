import { act, screen } from "@testing-library/react-native";

/**
 * Calls the `prop` handler of the first component on screen that has one,
 * the way a list does when the user scrolls or pulls it. Jest has no layout
 * or touches, so what would trigger it never happens. Testing Library only
 * exposes host elements, so this walks up their fibers to the component that
 * holds the prop.
 */
const callListHandler = async (prop: "onEndReached" | "onRefresh") => {
  let handler: (() => void) | undefined;
  for (const node of screen.container.queryAll(() => true)) {
    let fiber = (node as any).unstable_fiber;
    while (fiber && !handler) {
      if (typeof fiber.memoizedProps?.[prop] === "function") {
        handler = fiber.memoizedProps[prop];
      }
      fiber = fiber.return;
    }
    if (handler) break;
  }
  if (!handler) throw new Error(`No list with ${prop} on screen`);
  await act(async () => handler?.());
};

/** The scroll near the end of the first list on screen, which loads its next page. */
export const reachListEnd = () => callListHandler("onEndReached");

/** The pull down on the first refreshable list on screen. */
export const pullToRefresh = () => callListHandler("onRefresh");

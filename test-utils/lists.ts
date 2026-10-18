import { act, screen } from "@testing-library/react-native";

/**
 * Calls the `onEndReached` of the first list on screen, the way a list does
 * when it is scrolled near its end. Jest has no layout, so the scroll that
 * would trigger it never happens. Testing Library only exposes host elements,
 * so this walks up their fibers to the list component that holds the prop.
 */
export const reachListEnd = async () => {
  let onEndReached: (() => void) | undefined;
  for (const node of screen.container.queryAll(() => true)) {
    let fiber = (node as any).unstable_fiber;
    while (fiber && !onEndReached) {
      if (typeof fiber.memoizedProps?.onEndReached === "function") {
        onEndReached = fiber.memoizedProps.onEndReached;
      }
      fiber = fiber.return;
    }
    if (onEndReached) break;
  }
  if (!onEndReached) throw new Error("No list with onEndReached on screen");
  await act(async () => onEndReached?.());
};

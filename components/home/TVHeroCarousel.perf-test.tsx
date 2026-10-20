import { act, fireEvent, screen } from "@testing-library/react-native";
import { Provider as JotaiProvider } from "jotai";
import type { ReactNode } from "react";
import { measureRenders } from "reassure";
import { makeItems } from "@/test-utils/baseItems";
import { stubReactNative } from "@/test-utils/reactNative";

stubReactNative({ isTV: true });

const { TVHeroCarousel } = require("./TVHeroCarousel");

const items = makeItems(10, "Movie");

const Wrapper = ({ children }: { children: ReactNode }) => (
  <JotaiProvider>{children}</JotaiProvider>
);

describe("TVHeroCarousel Performance", () => {
  test("focus moving across hero items updates active item and crossfades layers", async () => {
    await measureRenders(<TVHeroCarousel items={items} />, {
      wrapper: Wrapper,
      scenario: async () => {
        // Wait for first item to mount
        await screen.findByText("Movie 0");

        // Find all focusable card pressables in the hero carousel
        const pressables = screen.container.queryAll(
          (node) =>
            node.props.accessible === true &&
            typeof node.props.onFocus === "function",
        );

        // Move focus across all items as the remote would, blurring the card it
        // leaves, then advance past the 300ms debounce + 50ms crossfade
        for (let i = 0; i < pressables.length; i++) {
          if (i > 0) await fireEvent(pressables[i - 1], "blur");
          await fireEvent(pressables[i], "focus");
          await act(async () => {
            jest.advanceTimersByTime(400);
          });
        }
      },
    });
  });
});

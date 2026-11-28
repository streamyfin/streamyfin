import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Provider as JotaiProvider } from "jotai";
import type { ReactNode } from "react";
import { Animated } from "react-native";
import { TV_BACKDROP_DEBOUNCE_MS } from "@/constants/TVSizes";
import { stubReactNative } from "@/test-utils/reactNative";

stubReactNative({ isTV: true });

jest.mock(
  "@/providers/JellyfinProvider",
  () =>
    jest.requireActual("@/test-utils/jellyfinProvider").jellyfinProviderModule,
);
jest.mock("@/hooks/useAppRouter", () => () => ({ push: () => {} }));
// Navigation is not under test; the real module pulls in the downloads.
jest.mock("@/components/common/TouchableItemRouter", () => ({
  getItemNavigation: () => "/items/page",
}));

const { TVHeroCarousel } = require("./TVHeroCarousel");

const FADE_MS = 500;

// The card draws the Thumb, so a Backdrop on screen is the hero's.
const WITH_BACKDROP: BaseItemDto = {
  Id: "with-backdrop",
  Name: "With Backdrop",
  Type: "Movie",
  ImageTags: { Thumb: "thumb" },
  BackdropImageTags: ["backdrop"],
};
const WITHOUT_IMAGE: BaseItemDto = {
  Id: "without-image",
  Name: "Without Image",
  Type: "Movie",
};

const Wrapper = ({ children }: { children: ReactNode }) => (
  <JotaiProvider>{children}</JotaiProvider>
);

const heroBackdrops = () => screen.queryAllByTestId(/\/Images\/Backdrop/);

const advance = async (ms: number) => {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
};

describe("TVHeroCarousel", () => {
  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ["performance"] });
    // The native driver runs the fade off the JS thread, and in Jest it would
    // end at once. End it after its duration instead, as on a device.
    jest.spyOn(Animated, "parallel").mockImplementation(
      () =>
        ({
          start: (done?: (result: { finished: boolean }) => void) => {
            setTimeout(() => done?.({ finished: true }), FADE_MS);
          },
          stop: () => {},
          reset: () => {},
        }) as Animated.CompositeAnimation,
    );
  });
  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  // getItemImageUrl answers null for an item with no image, where the old
  // helper built an untagged URL; the crossfade returned early on that null
  // and the previous item's backdrop stayed behind the new item's title.
  it("takes the backdrop away when the focused item has no image", async () => {
    await render(<TVHeroCarousel items={[WITH_BACKDROP, WITHOUT_IMAGE]} />, {
      wrapper: Wrapper,
    });
    await advance(60 + FADE_MS);
    expect(heroBackdrops()).toHaveLength(1);

    const cards = screen.container.queryAll(
      (node) =>
        node.props.accessible === true &&
        typeof node.props.onFocus === "function",
    );
    await fireEvent(cards[1], "focus");
    await advance(TV_BACKDROP_DEBOUNCE_MS);
    await advance(FADE_MS);

    expect(heroBackdrops()).toHaveLength(0);
  });
});

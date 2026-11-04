import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { act, render, screen } from "@testing-library/react-native";
import { createRef } from "react";
import { Animated } from "react-native";
import { prefetchServerImage } from "@/components/common/ServerImage";
import {
  TV_BACKDROP_CROSSFADE_MS,
  TV_BACKDROP_DEBOUNCE_MS,
} from "@/constants/TVSizes";
import { TVHomeBackdrop, type TVHomeBackdropRef } from "./TVHomeBackdrop";

jest.mock(
  "@/components/common/ServerImage",
  () => jest.requireActual("@/test-utils/serverImage").serverImageModule,
);
jest.mock(
  "@/providers/JellyfinProvider",
  () =>
    jest.requireActual("@/test-utils/jellyfinProvider").jellyfinProviderModule,
);
jest.mock("expo-linear-gradient", () => ({ LinearGradient: () => null }));
// TVSizes reads the typography scale from the settings, which pull in the
// whole settings UI; the backdrop only needs its timings.
jest.mock("@/utils/atoms/settings", () => ({
  TVTypographyScale: {
    Small: "small",
    Default: "default",
    Large: "large",
    ExtraLarge: "extraLarge",
  },
  useSettings: () => ({ settings: {} }),
}));

const item = (id: string): BaseItemDto => ({
  Id: id,
  Type: "Movie",
  BackdropImageTags: [`tag-${id}`],
});

/** Which item's backdrop each layer holds, in drawing order. */
const layers = () => {
  const root = screen.toJSON() as { children?: { children?: unknown[] }[] };
  return (root.children ?? []).slice(0, 2).map((layer) => {
    const image = layer.children?.[0] as { props?: { testID?: string } };
    return image?.props?.testID?.match(/\/Items\/([^/]+)\//)?.[1] ?? null;
  });
};

describe("TVHomeBackdrop", () => {
  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ["performance"] });
    // The native driver runs the fade off the JS thread, and in Jest it would
    // end at once. End it after its duration instead, as on a device.
    jest.spyOn(Animated, "parallel").mockImplementation(
      () =>
        ({
          start: (done?: Animated.EndCallback) => {
            setTimeout(
              () => done?.({ finished: true }),
              TV_BACKDROP_CROSSFADE_MS,
            );
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

  const focus = async (
    ref: React.RefObject<TVHomeBackdropRef | null>,
    id: string,
  ) => {
    await act(async () => {
      ref.current?.handleItemFocus(item(id));
    });
    // Past the debounce, then the prefetch and the short wait before the fade.
    await act(async () => {
      jest.advanceTimersByTime(TV_BACKDROP_DEBOUNCE_MS);
    });
    await act(async () => {
      jest.advanceTimersByTime(60);
    });
  };

  // An image that arrived while the previous one was still fading in used to
  // be put on that same layer: the half-faded image was cut away at once.
  it("fades a backdrop that arrives mid-fade over the other layer", async () => {
    const ref = createRef<TVHomeBackdropRef>();
    await render(<TVHomeBackdrop ref={ref} />);

    await focus(ref, "a");
    expect(layers()).toEqual([null, "a"]);

    // Focus moves on before a's fade has finished.
    await act(async () => {
      jest.advanceTimersByTime(TV_BACKDROP_CROSSFADE_MS / 4);
    });
    await focus(ref, "b");

    expect(layers()).toEqual(["b", "a"]);
  });

  // The layer used to flip when the image was given to it, 50 ms before the
  // fade. With a slow prefetch, an image arriving in between went onto the
  // layer on screen and replaced it at once.
  it("puts a backdrop that arrives before the fade starts on the hidden layer", async () => {
    const PREFETCH_MS = 300;
    jest
      .mocked(prefetchServerImage)
      .mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(() => resolve(true), PREFETCH_MS),
          ),
      );
    const ref = createRef<TVHomeBackdropRef>();
    await render(<TVHomeBackdrop ref={ref} />);
    const advance = async (ms: number) => {
      await act(async () => {
        jest.advanceTimersByTime(ms);
      });
    };

    // x is on screen, on layer 1.
    await act(async () => {
      ref.current?.handleItemFocus(item("x"));
    });
    await advance(TV_BACKDROP_DEBOUNCE_MS);
    await advance(PREFETCH_MS);
    await advance(60 + TV_BACKDROP_CROSSFADE_MS);
    expect(layers()).toEqual([null, "x"]);

    // a starts loading; b arrives once a is loaded but before its fade.
    await act(async () => {
      ref.current?.handleItemFocus(item("a"));
    });
    await advance(TV_BACKDROP_DEBOUNCE_MS + 10);
    await act(async () => {
      ref.current?.handleItemFocus(item("b"));
    });
    await advance(TV_BACKDROP_DEBOUNCE_MS);
    await advance(PREFETCH_MS + 60);

    expect(layers()).toEqual(["b", "x"]);
  });
});

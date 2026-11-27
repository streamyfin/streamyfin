import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { getDefaultStore } from "jotai";
import { Animated } from "react-native";
import { apiAtom } from "@/providers/JellyfinProvider";
import type { makeApi } from "@/test-utils/jellyfinApi";
import { QueryWrapper } from "@/test-utils/queryWrapper";
import { TVActorPage } from "./TVActorPage";

jest.mock(
  "@/providers/JellyfinProvider",
  () =>
    jest.requireActual("@/test-utils/jellyfinProvider").jellyfinProviderModule,
);
jest.mock("expo-router", () => ({ useSegments: () => [] }));
jest.mock("expo-linear-gradient", () => ({ LinearGradient: () => null }));
jest.mock("@/hooks/useAppRouter", () => () => ({ push: () => {} }));
jest.mock(
  "@/hooks/useTVItemActionModal",
  () =>
    jest.requireActual("@/test-utils/tvItemActionModal")
      .tvItemActionModalModule,
);
// Navigation is not under test; the real module pulls in the downloads.
jest.mock("@/components/common/TouchableItemRouter", () => ({
  getItemNavigation: () => "/items/page",
}));
jest.mock("@/utils/jellyfin/user-library/getUserItemData", () => ({
  getUserItemData: async () => ({
    Id: "person-1",
    Name: "Jane Doe",
    Type: "Person",
  }),
}));
// A card stands in as what the remote focuses.
jest.mock("@/components/tv/TVPosterCard", () => {
  const { Pressable } = jest.requireActual("react-native");
  return {
    TVPosterCard: ({
      item,
      onFocus,
    }: {
      item: BaseItemDto;
      onFocus: () => void;
    }) => <Pressable testID={`poster ${item.Id}`} onFocus={onFocus} />,
  };
});

const FADE_MS = 500;

const WITH_BACKDROP: BaseItemDto = {
  Id: "with-backdrop",
  Name: "With Backdrop",
  Type: "Movie",
  BackdropImageTags: ["backdrop"],
};
const WITHOUT_IMAGE: BaseItemDto = {
  Id: "without-image",
  Name: "Without Image",
  Type: "Movie",
};

const api = getDefaultStore().get(apiAtom) as ReturnType<typeof makeApi>;

const backdrops = () => screen.queryAllByTestId(/\/Images\/Backdrop/);

const advance = async (ms: number) => {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
};

describe("TVActorPage", () => {
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
    api.mock.reset();
    // The SDK writes the query into the URL.
    api.mock.onGet(/\/Items\?/).reply((config) => [
      200,
      {
        Items:
          new URL(config.url ?? "").searchParams.get("includeItemTypes") ===
          "Movie"
            ? [WITH_BACKDROP, WITHOUT_IMAGE]
            : [],
      },
    ]);
  });
  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  // getItemImageUrl answers null for an item with no image, where the old
  // helper built an untagged URL; the crossfade returned early on that null
  // and the previous film's backdrop stayed on screen.
  it("takes the backdrop away when the focused film has no image", async () => {
    await render(<TVActorPage personId='person-1' />, {
      wrapper: QueryWrapper,
    });
    await screen.findByTestId("poster without-image");
    await advance(60 + FADE_MS);
    expect(backdrops()).toHaveLength(1);

    await fireEvent(screen.getByTestId("poster without-image"), "focus");
    await advance(FADE_MS);

    expect(backdrops()).toHaveLength(0);
  });
});

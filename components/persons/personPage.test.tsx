// Spec for app/(auth)/(tabs)/(home,libraries,search,more,tv-favorites,tv-watchlists)/persons/[personId].tsx.
// It lives here rather than next to the page because Expo Router turns every
// file under app/ into a route. The page's own decisions are under test: the
// header, the title and the collection around them are stubbed.
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { render, screen } from "@testing-library/react-native";
import { JotaiQueryWrapper } from "@/test-utils/queryWrapper";

const mockItem: { current: BaseItemDto } = { current: {} };

jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ personId: "person-1" }),
}));
jest.mock(
  "@/providers/JellyfinProvider",
  () =>
    jest.requireActual("@/test-utils/jellyfinProvider").jellyfinProviderModule,
);
jest.mock("@/utils/jellyfin/user-library/getUserItemData", () => ({
  getUserItemData: async () => mockItem.current,
}));
jest.mock("@/components/ParallaxPage", () => {
  const { View: MockView } = jest.requireActual("react-native");
  return {
    PARALLAX_HEADER_HEIGHT: 400,
    ParallaxScrollView: ({
      headerImage,
      children,
    }: {
      headerImage: React.ReactNode;
      children: React.ReactNode;
    }) => (
      <MockView>
        <MockView testID='header'>{headerImage}</MockView>
        {children}
      </MockView>
    ),
  };
});
jest.mock("@/components/movies/MoviesTitleHeader", () => {
  const { Text: MockText } = jest.requireActual("react-native");
  return {
    MoviesTitleHeader: ({ item }: { item: BaseItemDto }) => (
      <MockText>{item.Name}</MockText>
    ),
  };
});
// The phone page is under test; the TV page pulls in the download provider.
jest.mock("@/components/persons/TVActorPage", () => ({
  TVActorPage: () => null,
}));
jest.mock("@/components/home/InfiniteScrollingCollectionList", () => ({
  InfiniteScrollingCollectionList: () => null,
}));

const renderPage = async (item: BaseItemDto) => {
  mockItem.current = item;
  const Page =
    require("@/app/(auth)/(tabs)/(home,libraries,search,more,tv-favorites,tv-watchlists)/persons/[personId]").default;
  await render(<Page />, { wrapper: JotaiQueryWrapper });
};

describe("person page", () => {
  // getItemImageUrl answers null for a person without a photo, where the old
  // helper built an untagged URL; the page hid itself on that null.
  test("shows a person who has no image", async () => {
    await renderPage({ Id: "person-1", Name: "Jane Doe", Type: "Person" });

    expect(await screen.findByText("Jane Doe")).toBeTruthy();
    expect(screen.getByTestId("header")).toBeTruthy();
  });

  test("draws a person's photo in the header", async () => {
    await renderPage({
      Id: "person-1",
      Name: "Jane Doe",
      Type: "Person",
      ImageTags: { Primary: "photo" },
    });

    await screen.findByText("Jane Doe");
    expect(
      screen.getByTestId(/\/Items\/person-1\/Images\/Primary\?.*tag=photo/),
    ).toBeTruthy();
  });
});

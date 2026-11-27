// Spec for app/(auth)/(tabs)/(home,libraries,search,more,tv-favorites,tv-watchlists)/series/[id].tsx.
// It lives here rather than next to the page because Expo Router turns every
// file under app/ into a route. Whether the page draws is under test: the
// sections it holds are stubbed, and useSeriesQueries has its own spec.
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { render, screen } from "@testing-library/react-native";
import { JotaiQueryWrapper } from "@/test-utils/queryWrapper";

const mockItem: { current: BaseItemDto | null } = { current: null };

jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ id: "series-1" }),
  useNavigation: () => ({ setOptions: () => {} }),
}));
jest.mock(
  "@/providers/JellyfinProvider",
  () =>
    jest.requireActual("@/test-utils/jellyfinProvider").jellyfinProviderModule,
);
jest.mock("@/components/series/useSeriesQueries", () => ({
  useSeriesQueries: () => ({
    item: mockItem.current,
    allEpisodes: [],
    isLoading: false,
  }),
}));
jest.mock("@/hooks/useLeaveWhenGone", () => ({ useLeaveWhenGone: () => {} }));
jest.mock("@/hooks/useShuffleQueue", () => ({
  playableQueueItems: () => [],
  useShuffleQueue: () => ({ startShuffle: () => {} }),
}));
jest.mock(
  "@/components/common/ServerImage",
  () => jest.requireActual("@/test-utils/serverImage").serverImageModule,
);
jest.mock("@/components/ParallaxPage", () => {
  const { View: MockView } = jest.requireActual("react-native");
  return {
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
jest.mock("@/components/series/SeriesHeader", () => {
  const { Text: MockText } = jest.requireActual("react-native");
  return {
    SeriesHeader: ({ item }: { item: BaseItemDto }) => (
      <MockText>{item.Name}</MockText>
    ),
  };
});
jest.mock("@/components/series/NextUp", () => ({ NextUp: () => null }));
jest.mock("@/components/series/SeasonPicker", () => ({
  SeasonPicker: () => null,
  seasonIndexAtom: jest.requireActual("jotai").atom({}),
}));
jest.mock("@/components/SimilarItems", () => ({ SimilarItems: () => null }));
jest.mock("@/components/series/TVSeriesPage", () => ({
  TVSeriesPage: () => null,
}));
jest.mock("@/components/AddToFavorites", () => ({
  AddToFavorites: () => null,
}));
jest.mock("@/components/DownloadItem", () => ({ DownloadItems: () => null }));
jest.mock("@/components/syncplay/SyncPlayButton", () => ({
  SyncPlayButton: () => null,
}));

const renderPage = async (item: BaseItemDto) => {
  mockItem.current = item;
  const Page =
    require("@/app/(auth)/(tabs)/(home,libraries,search,more,tv-favorites,tv-watchlists)/series/[id]").default;
  await render(<Page />, { wrapper: JotaiQueryWrapper });
};

describe("series page", () => {
  // getItemImageUrl answers null for a series without artwork, where the old
  // helper built an untagged URL; the page hid itself, episodes included.
  test("shows a series that has no artwork", async () => {
    await renderPage({ Id: "series-1", Name: "A Show", Type: "Series" });

    expect(await screen.findByText("A Show")).toBeTruthy();
    expect(screen.getByTestId("header")).toBeTruthy();
  });

  test("draws a series' backdrop in the header", async () => {
    await renderPage({
      Id: "series-1",
      Name: "A Show",
      Type: "Series",
      BackdropImageTags: ["backdrop"],
    });

    await screen.findByText("A Show");
    expect(
      screen.getByTestId(/\/Items\/series-1\/Images\/Backdrop\?.*tag=backdrop/),
    ).toBeTruthy();
  });
});

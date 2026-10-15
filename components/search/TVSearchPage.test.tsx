import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { fireEvent, render, screen } from "@testing-library/react-native";
import { TVSearchPage } from "./TVSearchPage";

jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock("@/providers/JellyfinProvider", () => {
  const { atom } = jest.requireActual("jotai");
  return { apiAtom: atom({ basePath: "http://server" }) };
});
// The real module drags the whole settings UI in; the TV sizes only read this.
jest.mock("@/utils/atoms/settings", () => ({
  TVTypographyScale: {
    Small: "small",
    Default: "default",
    Large: "large",
    ExtraLarge: "extraLarge",
  },
  useSettings: () => ({ settings: { tvTypographyScale: "default" } }),
}));
// A poster is its name and its two presses here; its artwork, its glass and
// its focus animation need the native side.
jest.mock("@/components/tv/TVPosterCard", () => {
  const { Pressable, Text } = jest.requireActual("react-native");
  return {
    TVPosterCard: ({ item, onPress, onLongPress }: any) => (
      <Pressable onPress={onPress} onLongPress={onLongPress}>
        <Text>{item.Name}</Text>
      </Pressable>
    ),
  };
});
jest.mock("@/components/common/ServerImage", () => ({ Image: () => null }));
// The native search field and the Discover rows are not what is under test.
jest.mock("@/modules/tv-search", () => ({ TvSearchView: () => null }));
jest.mock("@/components/seerr/discover/TVDiscover", () => ({
  TVDiscover: () => null,
}));
jest.mock("./TVSeerrSearchResults", () => ({
  TVSeerrSearchResults: () => null,
}));
jest.mock("./TVSearchTabBadges", () => ({ TVSearchTabBadges: () => null }));

const studio: BaseItemDto = { Id: "studio-1", Type: "Studio", Name: "Pixar" };
const actor: BaseItemDto = { Id: "person-1", Type: "Person", Name: "Tom" };

const renderPage = async (
  results: { studios?: BaseItemDto[]; actors?: BaseItemDto[] },
  onItemPress = jest.fn(),
  onItemLongPress = jest.fn(),
) => {
  await render(
    <TVSearchPage
      search='pix'
      setSearch={() => {}}
      debouncedSearch='pix'
      {...results}
      loading={false}
      noResults={false}
      onItemPress={onItemPress}
      onItemLongPress={onItemLongPress}
      searchType='Library'
      setSearchType={() => {}}
      showDiscover={false}
    />,
  );
  return { onItemPress, onItemLongPress };
};

describe("TV search studios", () => {
  test("lists the studios in a section of their own and opens one", async () => {
    const { onItemPress } = await renderPage({ studios: [studio] });

    expect(screen.getByText("search.studios")).toBeTruthy();
    await fireEvent.press(screen.getByText("Pixar"));
    expect(onItemPress).toHaveBeenCalledWith(studio);
  });

  test("shows no studios section when the search found none", async () => {
    await renderPage({ studios: [], actors: [actor] });

    expect(screen.queryByText("search.studios")).toBeNull();
    expect(screen.getByText("search.actors")).toBeTruthy();
  });

  // The long press marks an item played, which means nothing for a studio.
  test("offers the long press on a person but not on a studio", async () => {
    const { onItemLongPress } = await renderPage({
      studios: [studio],
      actors: [actor],
    });

    await fireEvent(screen.getByText("Pixar"), "longPress");
    expect(onItemLongPress).not.toHaveBeenCalled();

    await fireEvent(screen.getByText("Tom"), "longPress");
    expect(onItemLongPress).toHaveBeenCalledWith(actor);
  });
});

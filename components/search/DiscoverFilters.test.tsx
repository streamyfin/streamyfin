import { menuOrder } from "@expo/ui/swift-ui/modifiers";
import { render, screen } from "@testing-library/react-native";
import { DiscoverFilters } from "@/components/search/DiscoverFilters";
import { renderedMenuModifiers } from "@/test-utils/expoUi";

jest.mock(
  "@expo/ui/swift-ui",
  () => jest.requireActual("@/test-utils/expoUi").swiftUiModule,
);
jest.mock("@/components/filters/FilterButton", () => ({
  FilterButton: () => null,
}));
jest.mock("@/components/seerr/SeerrIndexPage", () => ({
  SeerrSearchSort: { 0: "DEFAULT", DEFAULT: 0, 1: "POPULARITY", POPULARITY: 1 },
}));

describe("DiscoverFilters on iOS", () => {
  // Same regression as PlatformDropdown: the squash of #1543 dropped the fixed
  // order these sort menus had since #1937, so they opened reversed again.
  test("keeps the items of the filter menu and its submenus in the given order", async () => {
    await render(
      <DiscoverFilters
        searchFilterId='search'
        orderFilterId='order'
        seerrOrderBy={0}
        setSeerrOrderBy={jest.fn()}
        seerrSortOrder='desc'
        setSeerrSortOrder={jest.fn()}
        t={(key) => key}
      />,
    );

    const modifiers = renderedMenuModifiers(screen);
    expect(modifiers).toHaveLength(3);
    for (const list of modifiers) {
      expect(list).toContainEqual(menuOrder("fixed"));
    }
  });
});

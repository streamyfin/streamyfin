import { menuOrder } from "@expo/ui/swift-ui/modifiers";
import { render, screen } from "@testing-library/react-native";
import { SearchSortMenu } from "@/components/search/SearchSortMenu";
import { renderedMenuModifiers } from "@/test-utils/swiftUi";

describe("SearchSortMenu on iOS", () => {
  // The sort button sits at the bottom of the screen: UIMenu lists items by
  // distance to the anchor, so without the fixed order the sorts opened reversed.
  test("keeps the items of the menu and its submenus in the given order", async () => {
    await render(
      <SearchSortMenu
        sorts={[
          { value: "name", label: "Name" },
          { value: "date", label: "Date" },
        ]}
        sort='name'
        onSort={jest.fn()}
        order='desc'
        onOrder={jest.fn()}
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

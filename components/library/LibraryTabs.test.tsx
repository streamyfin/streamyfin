import { fireEvent, render, screen } from "@testing-library/react-native";
import { LibraryTabs } from "./LibraryTabs";

jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe("LibraryTabs", () => {
  test("draws the tabs it is given and marks the active one", async () => {
    await render(
      <LibraryTabs
        tabs={["items", "collections"]}
        activeTab='collections'
        onSelect={() => {}}
      />,
    );

    expect(
      screen.getByRole("tab", { name: "library.tabs.collections" }),
    ).toBeSelected();
    expect(
      screen.getByRole("tab", { name: "library.tabs.items" }),
    ).not.toBeSelected();
    expect(screen.queryByText("library.tabs.playlists")).toBeNull();
  });

  test("reports the tab that was pressed", async () => {
    const onSelect = jest.fn();
    await render(
      <LibraryTabs
        tabs={["items", "collections", "playlists"]}
        activeTab='items'
        onSelect={onSelect}
      />,
    );

    fireEvent.press(screen.getByText("library.tabs.playlists"));

    expect(onSelect).toHaveBeenCalledWith("playlists");
  });
});

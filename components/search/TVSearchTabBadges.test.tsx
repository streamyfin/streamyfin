import { fireEvent, render, screen } from "@testing-library/react-native";
import { Pressable, Text } from "react-native";
import { TVSearchTabBadges } from "@/components/search/TVSearchTabBadges";

jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
// The real button pulls the TV focus animation in; the row only needs
// something to press that shows its label and value.
const MockFilterButton = (props: {
  label: string;
  value: string;
  onPress: () => void;
}) => (
  <Pressable onPress={props.onPress}>
    <Text>{`${props.label}|${props.value}`}</Text>
  </Pressable>
);
jest.mock("@/components/tv/TVFilterButton", () => ({
  TVFilterButton: (props: Parameters<typeof MockFilterButton>[0]) =>
    MockFilterButton(props),
}));

const onSortPress = jest.fn();
const onOrderPress = jest.fn();
const sortButtons = {
  sortValue: "Name",
  onSortPress,
  orderValue: "Ascending",
  onOrderPress,
};

describe("TVSearchTabBadges", () => {
  beforeEach(() => {
    onSortPress.mockClear();
    onOrderPress.mockClear();
  });

  // As the TV library page does: one button for the sort, one for the order,
  // each opening its sheet.
  test("shows the sort and the order beside the tabs", async () => {
    await render(
      <TVSearchTabBadges
        searchType='Library'
        setSearchType={() => {}}
        showDiscover
        sortButtons={sortButtons}
      />,
    );

    expect(screen.getByText("|search.library")).toBeTruthy();
    await fireEvent.press(screen.getByText("library.filters.sort_by|Name"));
    expect(onSortPress).toHaveBeenCalled();
    await fireEvent.press(
      screen.getByText("library.filters.sort_order|Ascending"),
    );
    expect(onOrderPress).toHaveBeenCalled();
  });

  // Without Seerr there are no tabs, but the Library results still sort.
  test("shows the sort without the tabs when there is no Discover", async () => {
    await render(
      <TVSearchTabBadges
        searchType='Library'
        setSearchType={() => {}}
        showDiscover={false}
        sortButtons={sortButtons}
      />,
    );

    expect(screen.queryByText("|search.library")).toBeNull();
    expect(screen.getByText("library.filters.sort_by|Name")).toBeTruthy();
  });

  test("leaves the order out for a sort that has none", async () => {
    await render(
      <TVSearchTabBadges
        searchType='Library'
        setSearchType={() => {}}
        showDiscover
        sortButtons={{ ...sortButtons, orderValue: undefined }}
      />,
    );

    expect(screen.getByText("library.filters.sort_by|Name")).toBeTruthy();
    expect(screen.queryByText(/library\.filters\.sort_order/)).toBeNull();
  });

  test("shows nothing without Discover and without a search", async () => {
    await render(
      <TVSearchTabBadges
        searchType='Library'
        setSearchType={() => {}}
        showDiscover={false}
      />,
    );

    expect(screen.toJSON()).toBeNull();
  });
});

import { fireEvent, render, screen } from "@testing-library/react-native";
import type {
  TVLibrarySheetGroup,
  TVLibrarySheetState,
} from "@/utils/atoms/tvLibrarySheet";
import { TVLibrarySheet } from "./TVLibrarySheet";

let mockBackPress: (() => boolean | null | undefined) | undefined;

jest.mock("@/hooks/useTVBackPress", () => ({
  useTVBackPress: (handler: () => boolean) => {
    mockBackPress = handler;
  },
}));
jest.mock("@/providers/InactivityProvider", () => ({
  useInactivity: () => ({ resetInactivityTimer: () => {} }),
}));
jest.mock("@/constants/TVTypography", () => ({
  useScaledTVTypography: () => ({ callout: 18 }),
}));
jest.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const group = (
  overrides: Partial<TVLibrarySheetGroup> & { key: string },
): TVLibrarySheetGroup => ({
  label: overrides.key,
  summary: "All",
  options: [
    // The first one is the pick: the list opens scrolled to the pick, and a
    // test renderer has no layout to draw what lies before it.
    { label: "One", value: "one", selected: true },
    { label: "Two", value: "two", selected: false },
  ],
  onSelect: jest.fn(),
  ...overrides,
});

const renderSheet = async (
  sheet: NonNullable<TVLibrarySheetState>,
  placement: "bottom" | "right" = "bottom",
) => {
  const onClose = jest.fn();
  await render(
    <TVLibrarySheet sheet={sheet} placement={placement} onClose={onClose} />,
  );
  return { onClose };
};

describe.each(["bottom", "right"] as const)(
  "TVLibrarySheet at the %s",
  (placement) => {
    beforeEach(() => {
      mockBackPress = undefined;
    });

    test("lists its groups with what each is set to", async () => {
      await renderSheet(
        {
          title: "Filters",
          groups: [
            group({ key: "Genres", summary: "Drama" }),
            group({ key: "Years" }),
          ],
        },
        placement,
      );

      expect(screen.getByText("Genres")).toBeTruthy();
      expect(screen.getByText("Drama")).toBeTruthy();
      expect(screen.getByText("Years")).toBeTruthy();
      // The options stay out of sight until a group is opened.
      expect(screen.queryByText("One")).toBeNull();
    });

    // A filter is a set being built: the options stay up for the next pick.
    test("a pick in a multi group applies and stays", async () => {
      const genres = group({ key: "Genres", multi: true });
      const { onClose } = await renderSheet(
        { title: "Filters", groups: [genres, group({ key: "Years" })] },
        placement,
      );

      await fireEvent.press(screen.getByText("Genres"));
      await fireEvent.press(screen.getByText("One"));

      expect(genres.onSelect).toHaveBeenCalledWith("one");
      expect(screen.getByText("Two")).toBeTruthy();
      expect(onClose).not.toHaveBeenCalled();
    });

    test("a pick in a single group goes back to the groups", async () => {
      const order = group({ key: "Order" });
      const { onClose } = await renderSheet(
        { title: "Sort", groups: [order, group({ key: "Field" })] },
        placement,
      );

      await fireEvent.press(screen.getByText("Order"));
      await fireEvent.press(screen.getByText("One"));

      expect(order.onSelect).toHaveBeenCalledWith("one");
      expect(screen.getByText("Field")).toBeTruthy();
      expect(screen.queryByText("One")).toBeNull();
      expect(onClose).not.toHaveBeenCalled();
    });

    // The letter jump: one group, so its options are the sheet.
    test("a sheet with one group opens on its options and closes on a pick", async () => {
      const letters = group({ key: "Letters", compact: true });
      const { onClose } = await renderSheet(
        { title: "Jump to letter", groups: [letters] },
        placement,
      );

      await fireEvent.press(screen.getByText("One"));

      expect(letters.onSelect).toHaveBeenCalledWith("one");
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    test("back leaves an open group first, then the sheet", async () => {
      const { onClose } = await renderSheet(
        {
          title: "Filters",
          groups: [group({ key: "Genres" }), group({ key: "Years" })],
        },
        placement,
      );
      await fireEvent.press(screen.getByText("Genres"));

      const { act } = require("@testing-library/react-native");
      await act(async () => {
        expect(mockBackPress?.()).toBe(true);
      });
      expect(screen.getByText("Years")).toBeTruthy();
      expect(onClose).not.toHaveBeenCalled();

      await act(async () => {
        mockBackPress?.();
      });
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    test("offers a reset only when there is something to reset", async () => {
      const onReset = jest.fn();
      const groups = [group({ key: "Genres" }), group({ key: "Years" })];
      const view = await render(
        <TVLibrarySheet
          sheet={{ title: "Filters", groups }}
          placement={placement}
          onClose={() => {}}
        />,
      );
      expect(screen.queryByText("library.filters.reset")).toBeNull();

      await view.rerender(
        <TVLibrarySheet
          sheet={{ title: "Filters", groups, onReset }}
          placement={placement}
          onClose={() => {}}
        />,
      );
      await fireEvent.press(screen.getByText("library.filters.reset"));

      expect(onReset).toHaveBeenCalledTimes(1);
    });
  },
);

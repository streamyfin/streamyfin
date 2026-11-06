import { render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import { SheetScrollView, SheetView } from "./SheetContent";

jest.mock("@gorhom/bottom-sheet", () => {
  const { ScrollView, View } = jest.requireActual("react-native");
  return { BottomSheetScrollView: ScrollView, BottomSheetView: View };
});

let mockInsets = { top: 0, right: 0, bottom: 48, left: 0 };
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => mockInsets,
}));

describe("sheet content", () => {
  beforeEach(() => {
    mockInsets = { top: 0, right: 0, bottom: 48, left: 0 };
  });

  test("keeps the last row above the navigation bar", async () => {
    await render(<SheetView testID='sheet'>{null}</SheetView>);

    expect(StyleSheet.flatten(screen.getByTestId("sheet").props.style)).toEqual(
      {
        paddingTop: 8,
        paddingLeft: 16,
        paddingRight: 16,
        paddingBottom: 64,
      },
    );
  });

  test("moves the sides in from a landscape inset", async () => {
    mockInsets = { top: 0, right: 44, bottom: 21, left: 44 };
    await render(<SheetScrollView testID='sheet'>{null}</SheetScrollView>);

    expect(
      StyleSheet.flatten(
        screen.getByTestId("sheet").props.contentContainerStyle,
      ),
    ).toEqual({
      paddingTop: 8,
      paddingLeft: 44,
      paddingRight: 44,
      paddingBottom: 37,
    });
  });

  test("lets the caller add to the padding", async () => {
    await render(
      <SheetScrollView testID='sheet' contentContainerStyle={{ gap: 12 }}>
        {null}
      </SheetScrollView>,
    );

    expect(
      StyleSheet.flatten(
        screen.getByTestId("sheet").props.contentContainerStyle,
      ),
    ).toMatchObject({ gap: 12, paddingBottom: 64 });
  });
});

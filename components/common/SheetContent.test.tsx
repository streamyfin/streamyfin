import { render, screen } from "@testing-library/react-native";
import { I18nManager, StyleSheet } from "react-native";
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

  test("gives each side its own inset", async () => {
    mockInsets = { top: 0, right: 0, bottom: 0, left: 48 };
    await render(<SheetView testID='sheet'>{null}</SheetView>);

    expect(StyleSheet.flatten(screen.getByTestId("sheet").props.style)).toEqual(
      {
        paddingTop: 8,
        paddingLeft: 48,
        paddingRight: 16,
        paddingBottom: 16,
      },
    );
  });

  // React Native swaps left and right in a right-to-left layout: the inset of
  // a bar on the right went to the left, and the content under the bar kept 16.
  test("keeps the inset on the bar's side right to left", async () => {
    const isRTL = I18nManager.isRTL;
    I18nManager.isRTL = true;
    mockInsets = { top: 0, right: 48, bottom: 0, left: 0 };
    try {
      await render(<SheetView testID='sheet'>{null}</SheetView>);
    } finally {
      I18nManager.isRTL = isRTL;
    }

    expect(
      StyleSheet.flatten(screen.getByTestId("sheet").props.style),
    ).toMatchObject({ paddingLeft: 48, paddingRight: 16 });
  });

  // The custom headers sheet pads its scroll content by the keyboard's height
  // this way; with the default padding last, its lower fields went back under
  // the keyboard.
  test("lets the caller's padding win", async () => {
    await render(
      <SheetScrollView
        testID='sheet'
        contentContainerStyle={{ paddingBottom: 364 }}
      >
        {null}
      </SheetScrollView>,
    );

    expect(
      StyleSheet.flatten(
        screen.getByTestId("sheet").props.contentContainerStyle,
      ),
    ).toMatchObject({ paddingBottom: 364 });
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

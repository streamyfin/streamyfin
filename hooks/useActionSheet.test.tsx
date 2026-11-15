import { render, renderHook } from "@testing-library/react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ActionSheetInsets, useActionSheet } from "./useActionSheet";

type Insets = { top: number; right: number; bottom: number; left: number };

const mockShowActionSheet = jest.fn();
let mockInsets: Insets = { top: 0, right: 0, bottom: 48, left: 0 };

jest.mock("@expo/react-native-action-sheet", () => ({
  useActionSheet: () => ({ showActionSheetWithOptions: mockShowActionSheet }),
}));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: jest.fn(() => mockInsets),
}));

/** Has the root layout's keeper hold these insets. */
const keepInsets = async (insets: Insets) => {
  mockInsets = insets;
  await render(<ActionSheetInsets />);
};

const openedStyle = () => mockShowActionSheet.mock.calls[0][0].containerStyle;

describe("useActionSheet", () => {
  beforeEach(() => mockShowActionSheet.mockClear());

  test("keeps the sheet above the navigation bar", async () => {
    await keepInsets({ top: 0, right: 0, bottom: 48, left: 0 });
    const { result } = await renderHook(() => useActionSheet());
    const callback = () => {};

    result.current.showActionSheetWithOptions(
      { options: ["Cancel"] },
      callback,
    );

    expect(mockShowActionSheet).toHaveBeenCalledWith(
      {
        options: ["Cancel"],
        containerStyle: { paddingBottom: 48, paddingLeft: 0, paddingRight: 0 },
      },
      callback,
    );
  });

  // Landscape with three-button navigation puts the bar on a side, with no
  // bottom inset: the rows ran under it and taps there went to the bar.
  test("keeps the rows clear of a bar on the side", async () => {
    await keepInsets({ top: 0, right: 0, bottom: 0, left: 48 });
    const { result } = await renderHook(() => useActionSheet());

    result.current.showActionSheetWithOptions(
      { options: ["Cancel"] },
      () => {},
    );

    expect(openedStyle()).toEqual({
      paddingBottom: 0,
      paddingLeft: 48,
      paddingRight: 0,
    });
  });

  test("keeps the caller's container style", async () => {
    await keepInsets({ top: 0, right: 0, bottom: 48, left: 0 });
    const { result } = await renderHook(() => useActionSheet());

    result.current.showActionSheetWithOptions(
      {
        options: ["Cancel"],
        containerStyle: { backgroundColor: "black", paddingBottom: 60 },
      },
      () => {},
    );

    expect(openedStyle()).toEqual({
      paddingBottom: 60,
      paddingLeft: 0,
      paddingRight: 0,
      backgroundColor: "black",
    });
  });

  test("opens with the insets of the moment it opens", async () => {
    await keepInsets({ top: 0, right: 0, bottom: 48, left: 0 });
    const { result } = await renderHook(() => useActionSheet());
    // The phone turns to landscape while the screen stays mounted.
    await keepInsets({ top: 0, right: 48, bottom: 0, left: 0 });

    result.current.showActionSheetWithOptions(
      { options: ["Cancel"] },
      () => {},
    );

    expect(openedStyle()).toEqual({
      paddingBottom: 0,
      paddingLeft: 0,
      paddingRight: 48,
    });
  });

  // Every poster with an item menu calls this hook. Subscribed to the insets,
  // they all rendered again each time the player hid or showed the system
  // bars.
  test("does not subscribe to the insets", async () => {
    jest.mocked(useSafeAreaInsets).mockClear();

    await renderHook(() => useActionSheet());

    expect(useSafeAreaInsets).not.toHaveBeenCalled();
  });
});

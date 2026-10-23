import { renderHook } from "@testing-library/react-native";
import { useActionSheet } from "./useActionSheet";

const mockShowActionSheet = jest.fn();

jest.mock("@expo/react-native-action-sheet", () => ({
  useActionSheet: () => ({ showActionSheetWithOptions: mockShowActionSheet }),
}));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 48, left: 0 }),
}));

describe("useActionSheet", () => {
  beforeEach(() => mockShowActionSheet.mockClear());

  test("keeps the sheet above the navigation bar", async () => {
    const { result } = await renderHook(() => useActionSheet());
    const callback = () => {};

    result.current.showActionSheetWithOptions(
      { options: ["Cancel"] },
      callback,
    );

    expect(mockShowActionSheet).toHaveBeenCalledWith(
      { options: ["Cancel"], containerStyle: { paddingBottom: 48 } },
      callback,
    );
  });

  test("keeps the caller's container style", async () => {
    const { result } = await renderHook(() => useActionSheet());

    result.current.showActionSheetWithOptions(
      { options: ["Cancel"], containerStyle: { backgroundColor: "black" } },
      () => {},
    );

    expect(mockShowActionSheet.mock.calls[0][0].containerStyle).toEqual({
      paddingBottom: 48,
      backgroundColor: "black",
    });
  });
});

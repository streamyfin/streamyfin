import { renderHook } from "@testing-library/react-native";
import { Keyboard } from "react-native";

let mockFocusCleanup: (() => void) | undefined;
jest.mock("expo-router", () => ({
  useFocusEffect: (effect: () => (() => void) | undefined) => {
    mockFocusCleanup = effect() ?? undefined;
  },
}));

import { useDismissKeyboardOnLeave } from "./useDismissKeyboardOnLeave";

describe("useDismissKeyboardOnLeave", () => {
  // Expo Router 58 removed beforeRemove; losing focus is how leaving the
  // screen shows now, whichever way it is left.
  test("dismisses the keyboard when the screen loses focus, not when it gains it", async () => {
    const dismiss = jest
      .spyOn(Keyboard, "dismiss")
      .mockImplementation(() => {});

    await renderHook(() => useDismissKeyboardOnLeave());
    expect(dismiss).not.toHaveBeenCalled();

    mockFocusCleanup?.();
    expect(dismiss).toHaveBeenCalledTimes(1);
  });
});

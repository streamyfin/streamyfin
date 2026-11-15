import { I18nManager } from "react-native";
import { sideInsetPadding } from "./sideInsetPadding";

describe("sideInsetPadding", () => {
  const isRTL = I18nManager.isRTL;
  afterEach(() => {
    I18nManager.isRTL = isRTL;
  });

  test("gives each side its own inset, the minimum at least", () => {
    I18nManager.isRTL = false;
    expect(sideInsetPadding({ left: 48, right: 0 }, 16)).toEqual({
      paddingLeft: 48,
      paddingRight: 16,
    });
  });

  // Right to left, a paddingLeft lands on the right edge: the bar on the
  // right got 16 and the content went under it.
  test("keeps the inset on the bar's side in a right-to-left layout", () => {
    I18nManager.isRTL = true;
    expect(sideInsetPadding({ left: 0, right: 48 }, 16)).toEqual({
      paddingLeft: 48,
      paddingRight: 16,
    });
  });
});

import { shouldShowPlayerMenu } from "./shouldShowPlayerMenu";

describe("shouldShowPlayerMenu", () => {
  test("hidden on TV (TV uses its own navigation-based selectors)", () => {
    expect(shouldShowPlayerMenu({ isTV: true })).toBe(false);
  });

  test("shown on every non-TV device, including offline transcoded downloads", () => {
    expect(shouldShowPlayerMenu({ isTV: false })).toBe(true);
  });
});

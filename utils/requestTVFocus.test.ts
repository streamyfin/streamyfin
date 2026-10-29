import type { ViewInstance } from "react-native";
import { requestTVFocus } from "./requestTVFocus";

describe("requestTVFocus", () => {
  test("asks the view's TV focus method to take focus", () => {
    const focus = jest.fn();
    requestTVFocus({ requestTVFocus: focus } as unknown as ViewInstance);
    expect(focus).toHaveBeenCalledTimes(1);
  });

  test("does nothing for a view that is not mounted", () => {
    expect(() => requestTVFocus(null)).not.toThrow();
    expect(() => requestTVFocus(undefined)).not.toThrow();
  });

  test("does nothing for a view without the TV method", () => {
    expect(() => requestTVFocus({} as ViewInstance)).not.toThrow();
  });
});

import { withAlpha } from "@/utils/color";

describe("withAlpha", () => {
  test("adds the alpha to a six-digit hex color", () => {
    expect(withAlpha("#7c3aed", 0.7)).toBe("#7c3aedb3");
  });

  test("expands a three-digit hex color first", () => {
    expect(withAlpha("#fff", 0.5)).toBe("#ffffff80");
  });

  test("keeps the bounds of the alpha", () => {
    expect(withAlpha("#000000", 0)).toBe("#00000000");
    expect(withAlpha("#000000", 1)).toBe("#000000ff");
    expect(withAlpha("#000000", 2)).toBe("#000000ff");
  });

  // The image palette hands over hex colors; anything else is left as it is
  // rather than guessed at.
  test("leaves a color it does not read unchanged", () => {
    expect(withAlpha("rgb(1, 2, 3)", 0.7)).toBe("rgb(1, 2, 3)");
    expect(withAlpha("red", 0.7)).toBe("red");
  });
});

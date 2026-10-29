import { reanimatedModule } from "./reanimated";

const { Extrapolation, interpolate } = reanimatedModule;

describe("the reanimated double's interpolate", () => {
  test("extends past the input range by default, as Reanimated does", () => {
    expect(interpolate(2, [0, 1], [0, 10])).toBe(20);
    expect(interpolate(-1, [0, 1], [0, 10])).toBe(-10);
  });

  test("clamps only when asked to", () => {
    expect(interpolate(2, [0, 1], [0, 10], Extrapolation.CLAMP)).toBe(10);
    expect(interpolate(-1, [0, 1], [0, 10], "clamp")).toBe(0);
  });

  test("returns the value itself past the range with identity", () => {
    expect(interpolate(7, [0, 1], [0, 10], Extrapolation.IDENTITY)).toBe(7);
  });

  test("takes a separate rule for each edge", () => {
    const rule = {
      extrapolateLeft: Extrapolation.CLAMP,
      extrapolateRight: Extrapolation.EXTEND,
    };
    expect(interpolate(-1, [0, 1], [0, 10], rule)).toBe(0);
    expect(interpolate(2, [0, 1], [0, 10], rule)).toBe(20);
  });

  test("follows each segment of a range with more than two points", () => {
    expect(interpolate(-50, [-100, 0, 100], [-50, 0, 75])).toBe(-25);
    expect(interpolate(50, [-100, 0, 100], [-50, 0, 75])).toBe(37.5);
  });
});

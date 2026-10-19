import { PixelRatio } from "react-native";
import { fillHeightParams, toImagePixels } from "./imagePixels";

afterEach(() => {
  jest.restoreAllMocks();
});

describe("toImagePixels", () => {
  test("scales a layout length by the screen density", () => {
    jest.spyOn(PixelRatio, "get").mockReturnValue(3);

    expect(toImagePixels(130)).toBe(390);
  });

  test("returns whole pixels on a fractional density", () => {
    jest.spyOn(PixelRatio, "get").mockReturnValue(2.625);

    expect(toImagePixels(411)).toBe(1079);
  });
});

describe("fillHeightParams", () => {
  test("carries the box height and bounds both sides of the result", () => {
    expect(fillHeightParams(1500)).toEqual({
      fillHeight: "1500",
      maxWidth: "1920",
      maxHeight: "1920",
    });
  });

  test("sends whole pixels", () => {
    expect(fillHeightParams(1049.6).fillHeight).toBe("1050");
  });
});

import { squareArtworkSide } from "./artworkSize";

const PORTRAIT = { width: 412, height: 915 };
const LANDSCAPE = { width: 915, height: 412 };

describe("squareArtworkSide", () => {
  test("keeps the portrait size when the phone turns to landscape", () => {
    expect(squareArtworkSide(LANDSCAPE, { inset: 80 })).toBe(332);
    expect(squareArtworkSide(LANDSCAPE, { inset: 80 })).toBe(
      squareArtworkSide(PORTRAIT, { inset: 80 }),
    );
    expect(squareArtworkSide(LANDSCAPE, { ratio: 0.5 })).toBe(206);
  });

  test("shrinks with a narrower window", () => {
    expect(squareArtworkSide({ width: 320, height: 900 }, { ratio: 0.4 })).toBe(
      128,
    );
  });

  test("never goes below zero", () => {
    expect(squareArtworkSide({ width: 60, height: 60 }, { inset: 80 })).toBe(0);
  });
});

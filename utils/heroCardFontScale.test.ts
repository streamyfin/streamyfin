import { heroCardMaxFontScale } from "./heroCardFontScale";

describe("heroCardMaxFontScale", () => {
  it("caps the cards of a phone", () => {
    expect(heroCardMaxFontScale(411)).toBe(1.3);
  });

  it("caps the cards of the smallest phones", () => {
    expect(heroCardMaxFontScale(320)).toBe(1.3);
  });

  it("caps the cards of the widest window short of a tablet", () => {
    expect(heroCardMaxFontScale(599)).toBe(1.3);
  });

  // A tablet card is wide enough for the largest system font: capping it
  // shrank text that fit (the max review of #2429).
  it("leaves the cards of a tablet on the system's scale", () => {
    expect(heroCardMaxFontScale(600)).toBeNull();
    expect(heroCardMaxFontScale(820)).toBeNull();
    expect(heroCardMaxFontScale(1366)).toBeNull();
  });
});

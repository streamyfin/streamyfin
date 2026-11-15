import { countryFlagEmoji } from "./countryFlag";

describe("countryFlagEmoji", () => {
  test("builds the flag from a two letter code, in any case", () => {
    expect(countryFlagEmoji("FR")).toBe("🇫🇷");
    expect(countryFlagEmoji("us")).toBe("🇺🇸");
    expect(countryFlagEmoji(" jp ")).toBe("🇯🇵");
  });

  test("returns null for anything that is not two letters", () => {
    expect(countryFlagEmoji("")).toBeNull();
    expect(countryFlagEmoji("USA")).toBeNull();
    expect(countryFlagEmoji("1A")).toBeNull();
  });
});

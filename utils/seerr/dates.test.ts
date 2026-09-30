import { formatSeerrDate, seerrLocaleTag } from "./dates";

// The app formats Seerr's dates in the Seerr user's language and region,
// joined as one tag. Seerr's languages include some with a region already,
// such as pt-BR: "pt-BR-BR" is no tag, and formatting with it throws.
describe("seerrLocaleTag", () => {
  test("joins the language and the region", () => {
    expect(seerrLocaleTag("fr", "FR")).toBe("fr-FR");
    expect(seerrLocaleTag("en", "US")).toBe("en-US");
  });

  test("keeps a language that has its own region", () => {
    expect(seerrLocaleTag("pt-BR", "BR")).toBe("pt-BR");
    expect(seerrLocaleTag("zh-TW", "US")).toBe("zh-TW");
  });

  test("falls back to the device's own when nothing valid comes", () => {
    expect(seerrLocaleTag("", "US")).toBeUndefined();
    expect(seerrLocaleTag("not a language", "US")).toBeUndefined();
  });
});

// Seerr's dates are days, not moments: "2024-05-01" reads as midnight UTC,
// which the device's own time zone moved to April 30 anywhere west of UTC.
// Seerr pins its own to UTC (AirDateBadge, MovieDetails, TvDetails).
describe("formatSeerrDate", () => {
  // West of UTC, whatever zone the machine running the tests is in.
  const zone = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = "America/New_York";
  });
  afterAll(() => {
    process.env.TZ = zone;
  });

  test("shows the day Seerr gives, whatever the time zone", () => {
    expect(formatSeerrDate("2024-05-01", "en-US")).toBe("May 1, 2024");
  });

  test("formats in the language asked", () => {
    expect(formatSeerrDate("2024-05-01", "fr-FR")).toBe("1 mai 2024");
  });

  test("has nothing to show without a date, or with a broken one", () => {
    expect(formatSeerrDate(undefined, "en-US")).toBeUndefined();
    expect(formatSeerrDate("", "en-US")).toBeUndefined();
    expect(formatSeerrDate("not a date", "en-US")).toBeUndefined();
  });
});

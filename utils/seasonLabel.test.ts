import i18next from "i18next";
import { seasonHeading, seasonLabel } from "@/utils/seasonLabel";

beforeAll(() =>
  i18next.init({
    lng: "fr",
    resources: {
      fr: {
        translation: {
          seerr: { season_number: "Saison {{season_number}}" },
        },
      },
    },
  }),
);

// "Season 1" read in English on a French TV while a series loaded (2026-11-03).
test("names a season the server gave no name in the app's language", () => {
  expect(seasonLabel(i18next.t, undefined, 2)).toBe("Saison 2");
  expect(seasonLabel(i18next.t, "", 0)).toBe("Saison 0");
});

test("keeps the name the server gave a season", () => {
  expect(seasonLabel(i18next.t, "Specials", 0)).toBe("Specials");
});

// A TV series page named its row "Season 1" while the seasons loaded, or for
// good when they failed, though the series may have no season 1.
test("no season heading until the seasons are known", () => {
  expect(seasonHeading(i18next.t, undefined, 1)).toBeNull();
});

test("the heading is the selected season's name once the seasons are known", () => {
  const seasons = [
    { Name: "Specials", IndexNumber: 0 },
    { Name: undefined, IndexNumber: 2 },
  ];
  expect(seasonHeading(i18next.t, seasons, 0)).toBe("Specials");
  expect(seasonHeading(i18next.t, seasons, 2)).toBe("Saison 2");
});
